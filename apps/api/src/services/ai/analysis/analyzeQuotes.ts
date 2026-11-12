import { randomUUID } from 'node:crypto';
import { AiError } from '../errors';
import { looksLikeInjection } from '../extraction/verifyEvidence';
import { aiRiskResponseSchema, type QuoteRisk, type Severity } from '../schemas/quoteRisk';
import type { LLMClient } from '../types';
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisPrompt, sanitizeUntrusted } from './prompts';
import { detectRuleRisks } from './ruleRisks';
import type { AnalysisContext, AnalysisQuoteInput, QuoteAnalysis } from './types';

const BANNED_WORDS = /\b(fraud\w*|scam\w*|illegal\w*|cheat\w*|dishonest\w*|deceiv\w*|decepti\w*|swindl\w*)\b/i;
const MAX_AI_RISKS = 6;
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
const rank: Record<Severity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export async function analyzeQuote(llm: LLMClient, ctx: AnalysisContext, q: AnalysisQuoteInput): Promise<QuoteAnalysis> {
  const warnings: string[] = [];
  const ruleRisks = detectRuleRisks(ctx, q);
  let aiRisks: QuoteRisk[] = [];
  let aiStatus: QuoteAnalysis['aiStatus'] = 'OK';
  let aiError: QuoteAnalysis['aiError'];

  const cleanText = sanitizeUntrusted(q.sourceText);
  const src = norm(cleanText);

  try {
    // One call per quote, so text inside one quotation can never influence the analysis of another.
    const res = await llm.generateJson({
      schema: aiRiskResponseSchema,
      system: ANALYSIS_SYSTEM_PROMPT,
      prompt: buildAnalysisPrompt(ctx, q, cleanText, randomUUID().slice(0, 8)),
    });

    for (const r of res.risks.slice(0, MAX_AI_RISKS)) {
      const evidence = r.evidence.trim();
      let drop: string | null = null;
      if (BANNED_WORDS.test(`${r.title} ${r.detail}`)) drop = 'accusatory wording';
      else if (evidence === '' && r.type !== 'MISSING_INFO') drop = 'no evidence';
      else if (evidence !== '' && !src.includes(norm(evidence))) drop = 'evidence not found in the document';
      else if (evidence !== '' && looksLikeInjection(evidence)) drop = 'evidence looks like an instruction';
      else if (looksLikeInjection(`${r.title} ${r.detail}`)) drop = 'text looks like an instruction';

      if (drop) {
        warnings.push(`Dropped AI risk "${r.title.slice(0, 60)}": ${drop}`);
        continue;
      }
      aiRisks.push({
        quoteId: q.quoteId,
        source: 'AI',
        type: r.type,
        severity: r.severity,
        title: r.title.slice(0, 120),
        detail: r.detail.slice(0, 500),
        evidence: evidence === '' ? null : evidence,
      });
    }
  } catch (err) {
    if (!(err instanceof AiError)) throw err;
    aiStatus = 'FAILED';
    aiError = { code: err.code, message: err.message };
    aiRisks = [];
  }

  // Rule risks win. Drop an AI risk that repeats one (same type, or same evidence text).
  const seen = ruleRisks.map((r) => ({ type: r.type, ev: r.evidence ? norm(r.evidence) : null }));
  const uniqueAi = aiRisks.filter((a) => {
    const aEv = a.evidence ? norm(a.evidence) : null;
    const dup = seen.some((s) => s.type === a.type || (aEv !== null && s.ev === aEv));
    if (dup) warnings.push(`Dropped duplicate AI risk "${a.title.slice(0, 60)}"`);
    return !dup;
  });

  const risks = [...ruleRisks, ...uniqueAi].sort((a, b) => rank[a.severity] - rank[b.severity]);
  return { quoteId: q.quoteId, risks, aiStatus, aiError, warnings };
}

/** Quotes are analysed one at a time (friendly to free-tier rate limits). */
export async function analyzeQuotes(llm: LLMClient, ctx: AnalysisContext, quotes: AnalysisQuoteInput[]): Promise<QuoteAnalysis[]> {
  const out: QuoteAnalysis[] = [];
  for (const q of quotes) out.push(await analyzeQuote(llm, ctx, q));
  return out;
}
