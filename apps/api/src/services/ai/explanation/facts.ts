import { looksLikeInjection } from '../extraction/verifyEvidence';
import type { QuoteNote, RankedQuote, RankingData } from './types';

/** Display/compare helpers only. Authoritative money maths is M3's. */
export const toMinor = (s: string): number => {
  const [i, f = ''] = s.split('.');
  return Number(i) * 100 + Number((f + '00').slice(0, 2));
};
export const fmtMinor = (m: number): string => `${Math.floor(m / 100)}.${String(m % 100).padStart(2, '0')}`;

/** Vendor names come from untrusted documents: clean them, and fall back to "Vendor A/B/C" if suspicious. */
export function safeLabel(raw: string | null, index: number): string {
  const cleaned = (raw ?? '').replace(/[\r\n\t]+/g, ' ').replace(/[<>{}[\]`]/g, '').trim().slice(0, 60);
  if (!cleaned || looksLikeInjection(cleaned)) return `Vendor ${String.fromCharCode(65 + (index % 26))}`;
  return cleaned;
}

export interface Prepared {
  data: RankingData;
  winner: RankedQuote | null;
  others: RankedQuote[];
  names: Map<string, string>;
  budgetRemaining: string | null;
  facts: Record<string, unknown>;
  allowed: { exact: number[]; scores: number[] };
  ineligibleNotes: QuoteNote[];
}

export function prepare(input: RankingData): Prepared {
  const data: RankingData = { ...input, ranked: [...input.ranked].sort((a, b) => a.rank - b.rank) };
  const names = new Map<string, string>();
  [...data.ranked, ...data.ineligible].forEach((q, i) => names.set(q.quoteId, safeLabel(q.vendorName, i)));

  const winner = data.ranked[0] ?? null;
  const others = data.ranked.slice(1);
  const exact: number[] = [data.deadlineDays, data.ranked.length, ...Object.values(data.weights)];
  const scores: number[] = [];
  const num = (s: string | null) => {
    if (s !== null) exact.push(Number(s));
  };
  num(data.budget);

  let budgetRemaining: string | null = null;
  const facts: Record<string, unknown> = {
    currency: data.currency,
    budget: data.budget,
    deadlineDays: data.deadlineDays,
    weightsPercent: data.weights,
    scoreScale: 'scores are between 0 and 1, higher is better',
  };

  const scoreFacts = (q: RankedQuote) => {
    const s = q.scores;
    scores.push(s.cost, s.delivery, s.specs, s.completeness, s.final);
    return {
      cost: +s.cost.toFixed(3), delivery: +s.delivery.toFixed(3), specs: +s.specs.toFixed(3),
      completeness: +s.completeness.toFixed(3), final: +s.final.toFixed(3),
    };
  };

  if (winner) {
    budgetRemaining = fmtMinor(toMinor(data.budget) - toMinor(winner.total));
    num(winner.total);
    num(budgetRemaining);
    if (winner.deliveryDays !== null) exact.push(winner.deliveryDays);
    exact.push(1);
    facts.recommended = {
      name: names.get(winner.quoteId), rank: 1, total: winner.total, deliveryDays: winner.deliveryDays,
      budgetRemainingAfterPurchase: budgetRemaining, scores: scoreFacts(winner),
      risksToConfirm: winner.risks.map((r) => safeLabel(r.title, 0)),
    };
    facts.otherRankedQuotes = others.map((o) => {
      num(o.total);
      exact.push(o.rank);
      if (o.deliveryDays !== null) exact.push(o.deliveryDays);
      const priceDiff = toMinor(o.total) - toMinor(winner.total);
      exact.push(Math.abs(priceDiff) / 100);
      const dayDiff = o.deliveryDays !== null && winner.deliveryDays !== null ? o.deliveryDays - winner.deliveryDays : null;
      if (dayDiff !== null) exact.push(Math.abs(dayDiff));
      return {
        quoteId: o.quoteId, name: names.get(o.quoteId), rank: o.rank, total: o.total, deliveryDays: o.deliveryDays,
        scores: scoreFacts(o),
        priceVersusRecommended: { difference: fmtMinor(Math.abs(priceDiff)), direction: priceDiff > 0 ? 'higher' : priceDiff < 0 ? 'lower' : 'equal' },
        deliveryVersusRecommended:
          dayDiff === null ? 'unknown' : { differenceDays: Math.abs(dayDiff), direction: dayDiff > 0 ? 'slower' : dayDiff < 0 ? 'faster' : 'same' },
        risksToConfirm: o.risks.map((r) => safeLabel(r.title, 0)),
      };
    });
  }

  const ineligibleNotes: QuoteNote[] = data.ineligible.map((q) => ({
    quoteId: q.quoteId,
    vendorName: names.get(q.quoteId)!,
    text: `${names.get(q.quoteId)} was not ranked: ${q.reasons.join('; ') || 'it did not meet the purchasing rules'}.`,
  }));
  facts.notRanked = data.ineligible.map((q) => ({ name: names.get(q.quoteId), reasons: q.reasons }));
  data.ineligible.forEach((q) => num(q.total));

  return { data, winner, others, names, budgetRemaining, facts, allowed: { exact, scores }, ineligibleNotes };
}

/** True if a number written in the explanation matches a backend value (or a rounded score). */
export function numberAllowed(n: number, allowed: Prepared['allowed']): boolean {
  if (allowed.exact.some((a) => Math.abs(a - n) < 1e-6)) return true;
  return allowed.scores.some((s) => Math.abs(n - s) <= 0.005 + 1e-9 || Math.abs(n - s * 100) <= 0.5 + 1e-9);
}
