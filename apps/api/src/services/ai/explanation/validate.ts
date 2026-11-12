import { looksLikeInjection } from '../extraction/verifyEvidence';
import type { ExplanationResponse } from '../schemas/explanation';
import { numberAllowed, type Prepared } from './facts';

const BANNED = /\b(fraud\w*|scam\w*|illegal\w*|cheat\w*|dishonest\w*|deceiv\w*|decepti\w*|swindl\w*)\b/i;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Returns a list of problems. Empty list = the explanation is safe to show. */
export function validateExplanation(exp: ExplanationResponse, p: Prepared): string[] {
  const problems: string[] = [];
  if (!p.winner) return ['nothing to explain'];

  const winnerName = p.names.get(p.winner.quoteId)!;
  if (!exp.whyWinner.toLowerCase().includes(winnerName.toLowerCase())) {
    problems.push(`whyWinner must name the recommended vendor "${winnerName}"`);
  }

  const expected = new Set(p.others.map((o) => o.quoteId));
  const got = exp.otherQuotes.map((o) => o.quoteId);
  if (got.length !== expected.size || got.some((id) => !expected.has(id)) || new Set(got).size !== got.length) {
    problems.push(`otherQuotes must contain exactly one entry for each of these quoteIds: ${[...expected].join(', ') || '(none)'}`);
  }

  const texts = [exp.headline, exp.whyWinner, ...exp.otherQuotes.map((o) => o.text), ...exp.tradeOffs, ...exp.remainingRisks, ...exp.uncertainties];
  if (texts.some((t) => t.length > 800)) problems.push('each text must be under 800 characters');
  if ([exp.tradeOffs, exp.remainingRisks, exp.uncertainties].some((l) => l.length > 6)) problems.push('at most 6 items per list');

  const all = texts.join('\n');
  if (BANNED.test(all)) problems.push('accusatory wording is not allowed');
  if (looksLikeInjection(all)) problems.push('text contains instruction-like phrases');

  // Remove vendor names (they may contain digits), then check every remaining number against the backend data.
  const names = [...p.names.values()].sort((a, b) => b.length - a.length).map(escape);
  const stripped = names.length ? all.replace(new RegExp(names.join('|'), 'gi'), ' ') : all;
  const bad = new Set<string>();
  for (const m of stripped.match(/\d[\d,]*(?:\.\d+)?/g) ?? []) {
    const n = Number(m.replace(/,/g, ''));
    if (!Number.isNaN(n) && !numberAllowed(n, p.allowed)) bad.add(m.replace(/,+$/, ''));
  }
  if (bad.size) problems.push(`these numbers are not in the provided data: ${[...bad].join(', ')}`);

  return problems;
}
