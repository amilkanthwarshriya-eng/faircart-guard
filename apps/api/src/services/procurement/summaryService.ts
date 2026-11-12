/** GET /api/requests/:id - the purchase summary aggregate. */
import { getPrisma } from '../../db';
import { notFound } from '../../utils/errors';
import { Money } from '../../utils/money';
import type { PurchaseSummaryDto } from '../../contracts';
import { buildAnalysis } from './analysis';
import { quoteInclude, toApprovalDto, toPaymentDto, toQuoteDto, toRecommendationDto, toRequestDto } from './dto';
import { toApprovalRecord, toQuoteRecord, toRequestRecord } from './mappers';

export async function getPurchaseSummary(requestId: string, now: Date = new Date()): Promise<PurchaseSummaryDto> {
  const prisma = getPrisma();
  const row = await prisma.purchaseRequest.findUnique({
    where: { id: requestId },
    include: {
      quotes: { include: quoteInclude, orderBy: { createdAt: 'asc' } },
      approvals: { orderBy: { createdAt: 'desc' } },
      payments: { orderBy: { createdAt: 'desc' } },
      recommendations: { orderBy: { createdAt: 'desc' }, take: 1, include: { risks: true } },
    },
  });
  if (!row) throw notFound('Purchase request', requestId);

  const request = toRequestRecord(row);
  const analysis = buildAnalysis({ request, quotes: row.quotes.map(toQuoteRecord), now });
  const evalById = new Map(analysis.rules.evaluations.map((e) => [e.quoteId, e]));
  const rankById = new Map(analysis.ranking.entries.map((e) => [e.quoteId, e]));

  const approvals = row.approvals.map(toApprovalRecord);
  const active = approvals.find((a) => a.status === 'APPROVED') ?? null;
  const cur = request.currency;
  const committed = active ? Money.from(active.amount).roundToCurrency(cur) : null;
  const latest = row.recommendations[0];

  return {
    request: toRequestDto(row),
    quotes: row.quotes.map((q) => ({ ...toQuoteDto(q), evaluation: evalById.get(q.id) ?? null, ranking: rankById.get(q.id) ?? null })),
    analysis: { ranking: analysis.ranking, winnerQuoteId: analysis.winnerQuoteId, noEligibleMessage: analysis.ranking.noEligibleMessage },
    recommendation: latest ? toRecommendationDto(latest) : null,
    approval: active ? toApprovalDto(active) : null,
    approvalHistory: approvals.map(toApprovalDto),
    payments: row.payments.map(toPaymentDto),
    budget: {
      total: Money.from(request.budget).toCurrencyString(cur),
      currency: cur,
      committed: committed ? committed.toCurrencyString(cur) : null,
      remaining: committed ? Money.from(request.budget).sub(committed).roundToCurrency(cur).toCurrencyString(cur) : null,
      projectedRemaining: analysis.projectedRemainingBudget,
    },
  };
}
