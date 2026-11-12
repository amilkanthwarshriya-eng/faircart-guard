/**
 * POST /api/requests/:id/analyze  and  GET /api/requests/:id/recommendation
 *
 * Pipeline: fetch request+quotes -> backend totals -> deterministic rules -> eligibility -> ranking
 *           -> AI risks/explanation via AiAnalysisPort (Member 2; advisory only) -> persist -> return.
 * The AI step runs AFTER eligibility and ranking are fixed and has no way to change them.
 */
import type { Prisma } from '@prisma/client';
import { getPrisma } from '../../db';
import { conflict, notFound, unprocessable } from '../../utils/errors';
import type { AnalyzeResponseDto, RecommendationDto } from '../../contracts';
import { buildAnalysis } from './analysis';
import { invalidateIfStale } from './approval';
import { quoteInclude, toRecommendationDto } from './dto';
import { toQuoteRecord, toRequestRecord } from './mappers';
import type { AiAnalysisPort, AiAnalysisResult } from './integration/aiPort';
import { getAiAnalysisPort } from './integration/aiPortProvider';
import { prismaApprovalTx } from './prismaApprovalStore';
import type { RankingWeights } from './ranking';
import type { QuoteEvaluation } from './rules';
import { LOCKED_REQUEST_STATUSES, type RequestStatus } from './types';

const json = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export interface AnalyzeOptions {
  now?: Date;
  weights?: RankingWeights;
  ai?: AiAnalysisPort;
}

export async function analyzeRequest(requestId: string, opts: AnalyzeOptions = {}): Promise<AnalyzeResponseDto> {
  const prisma = getPrisma();
  const now = opts.now ?? new Date();

  // 1-2. Fetch request + quotations
  const row = await prisma.purchaseRequest.findUnique({ where: { id: requestId }, include: { quotes: { include: quoteInclude, orderBy: { createdAt: 'asc' } } } });
  if (!row) throw notFound('Purchase request', requestId);
  if (LOCKED_REQUEST_STATUSES.includes(row.status as RequestStatus)) throw conflict('REQUEST_LOCKED', `Request is ${row.status}; it can no longer be analysed.`);
  if (row.quotes.length === 0) throw unprocessable('NO_QUOTES', 'Add at least one quotation before running analysis.');

  const request = toRequestRecord(row);
  const quotes = row.quotes.map(toQuoteRecord);

  // 3-6. Structured quote data (stored/buyer-reviewed) -> authoritative totals -> rules -> eligibility -> ranking
  const analysis = buildAnalysis({ request, quotes, now, weights: opts.weights });

  // 8. Advisory AI risks + explanation (Member 2) - isolated; failure never blocks deterministic results
  let ai: AiAnalysisResult;
  try {
    const port = opts.ai ?? getAiAnalysisPort();
    ai = await port.analyze({
      request: { id: request.id, title: request.title, quantity: request.quantity, budget: request.budget, currency: request.currency, deadlineDays: request.deadlineDays, requiredSpecs: request.requiredSpecs },
      quotes: quotes.map((q) => ({
        quoteId: q.id, vendorName: q.vendorName, lineItems: q.lineItems, otherFeesDescription: q.otherFeesDescription,
        evaluation: analysis.rules.evaluations.find((e) => e.quoteId === q.id) as QuoteEvaluation,
      })),
      ranking: analysis.ranking,
    });
  } catch (err) {
    ai = { status: 'FAILED', source: 'NONE', risks: [], explanation: null, error: clip(err instanceof Error ? err.message : 'AI analysis failed', 500) };
  }
  const knownQuoteIds = new Set(quotes.map((q) => q.id));
  const risks = ai.risks.filter((r) => knownQuoteIds.has(r.quoteId));

  // 9. Persist atomically
  const recommendationId = await prisma.$transaction(async (tx) => {
    const atx = prismaApprovalTx(tx);
    const locked = await atx.lockRequest(requestId);
    if (!locked) throw notFound('Purchase request', requestId);
    if (LOCKED_REQUEST_STATUSES.includes(locked.status)) throw conflict('REQUEST_LOCKED', `Request is ${locked.status}; it can no longer be analysed.`);

    for (const ev of analysis.rules.evaluations) {
      await tx.quote.update({ where: { id: ev.quoteId }, data: { status: ev.suggestedQuoteStatus, calculatedTotal: ev.totals.calculatedTotal, analyzedAt: now } });
    }
    await tx.quoteRisk.deleteMany({ where: { quote: { requestId } } });

    const rec = await tx.recommendation.create({
      data: {
        requestId,
        winnerQuoteId: analysis.winnerQuoteId,
        noEligibleMessage: analysis.ranking.noEligibleMessage,
        weights: json(analysis.ranking.weights),
        ranking: json(analysis.ranking.entries),
        ruleResults: json(analysis.rules.evaluations),
        explanationText: ai.explanation?.text ?? null,
        explanationJson: ai.explanation?.json === undefined ? undefined : json(ai.explanation.json),
        aiStatus: ai.status,
        aiSource: ai.source,
        aiError: ai.error ?? null,
      },
    });
    if (risks.length > 0) {
      await tx.quoteRisk.createMany({
        data: risks.map((r) => ({
          quoteId: r.quoteId, recommendationId: rec.id, category: r.category, severity: r.severity,
          title: clip(r.title, 300), description: clip(r.description, 2000), evidence: r.evidence ? clip(r.evidence, 2000) : null,
          source: ai.source === 'DEMO_FIXTURE' ? ('DEMO_FIXTURE' as const) : ('AI' as const),
        })),
      });
    }

    // An existing approval survives only if its quote is still eligible AND unchanged.
    const active = await atx.findActiveApproval(requestId);
    let stillApproved = false;
    if (active) {
      const approvedEval = analysis.rules.evaluations.find((e) => e.quoteId === active.quoteId);
      if (!approvedEval || approvedEval.eligibility !== 'ELIGIBLE') {
        await atx.invalidateApproval(active.id, 'Re-analysis found the approved quotation is no longer eligible.', now);
      } else {
        stillApproved = !(await invalidateIfStale(atx, requestId, 'Quotation or amount changed after approval.', now));
      }
    }
    const status: RequestStatus = stillApproved ? 'APPROVED' : analysis.rules.eligibleQuoteIds.length > 0 ? 'AWAITING_APPROVAL' : 'ANALYZED';
    await atx.setRequestStatus(requestId, status);
    return rec.id;
  }, { timeout: 20_000 });

  const saved = await prisma.recommendation.findUniqueOrThrow({ where: { id: recommendationId }, include: { risks: true } });
  const after = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: requestId }, select: { status: true } });
  return { requestStatus: after.status, recommendation: toRecommendationDto(saved) };
}

export async function getLatestRecommendation(requestId: string): Promise<RecommendationDto> {
  const prisma = getPrisma();
  if (!(await prisma.purchaseRequest.findUnique({ where: { id: requestId }, select: { id: true } }))) throw notFound('Purchase request', requestId);
  const rec = await prisma.recommendation.findFirst({ where: { requestId }, orderBy: { createdAt: 'desc' }, include: { risks: true } });
  if (!rec) throw notFound('Recommendation (run POST /api/requests/:id/analyze first)', requestId);
  return toRecommendationDto(rec);
}
