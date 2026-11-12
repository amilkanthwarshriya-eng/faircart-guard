/**
 * VendorRankingService - weighted, transparent ranking of ELIGIBLE quotations only.
 * Hard constraints are applied first (see rules.ts); ineligible quotations never receive a rank.
 *
 *  cost score     = (maxEligibleTotal - total) / (maxEligibleTotal - minEligibleTotal); 1.0 if all totals equal
 *  delivery score = clamp((deadlineDays - deliveryDays) / deadlineDays, 0, 1); unknown => 0 and flagged
 *  spec score     = confirmed-with-evidence mandatory specs / mandatory specs
 *  completeness   = required info present and reviewed / required info
 *  final          = cost*wCost + delivery*wDelivery + specs*wSpecs + completeness*wCompleteness
 *
 * NOTE: min-max over only two eligible quotes is harsh (cheapest = 1.0, other = 0.0). This is the
 * documented team choice; a budget-relative cost score (1 - total/budget) is the open alternative.
 */
import { Money } from '../../utils/money';
import { NO_ELIGIBLE_VENDOR_MESSAGE, type Eligibility, type QuoteEvaluation, type RuleResult } from './rules';

export interface RankingWeights {
  cost: number;
  delivery: number;
  specs: number;
  completeness: number;
}

export const DEFAULT_WEIGHTS: Readonly<RankingWeights> = Object.freeze({ cost: 0.45, delivery: 0.25, specs: 0.2, completeness: 0.1 });

export function validateWeights(w: RankingWeights): RankingWeights {
  const values = [w.cost, w.delivery, w.specs, w.completeness];
  if (values.some((v) => typeof v !== 'number' || !Number.isFinite(v) || v < 0)) {
    throw new Error('Ranking weights must be finite, non-negative numbers.');
  }
  const sum = values.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 1e-9) throw new Error(`Ranking weights must sum to 1 (got ${sum}).`);
  return { ...w };
}

export interface RankedEntry {
  quoteId: string;
  vendorId: string;
  vendorName: string;
  eligibility: Eligibility;
  eligible: boolean;
  /** 1-based; null for anything not eligible. */
  rank: number | null;
  finalScore: number | null;
  costScore: number | null;
  deliveryScore: number | null;
  specificationScore: number | null;
  completenessScore: number | null;
  totalAmount: string | null;
  currency: string;
  deliveryDays: number | null;
  /** Why this vendor scored as it did (eligible) or why it was excluded (not eligible). */
  reasons: string[];
  /** Data-quality flags, e.g. DELIVERY_UNKNOWN. */
  flags: string[];
  /** Rule results that failed or need review. Empty for clean eligible quotes. */
  disqualification: Pick<RuleResult, 'rule' | 'status' | 'explanation'>[];
}

export interface RankingResult {
  weights: RankingWeights;
  /** Eligible entries ordered by rank, followed by the non-eligible ones in input order. */
  entries: RankedEntry[];
  winnerQuoteId: string | null;
  noEligibleMessage: string | null;
}

const r4 = (n: number): number => Math.round(n * 10_000) / 10_000;
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
const safe01 = (n: number): number => (Number.isFinite(n) ? clamp01(n) : 0);

export interface RankInput {
  evaluations: readonly QuoteEvaluation[];
  deadlineDays: number;
  weights?: RankingWeights;
}

export function rankVendors({ evaluations, deadlineDays, weights = DEFAULT_WEIGHTS }: RankInput): RankingResult {
  const w = validateWeights(weights);
  // Defensive: only ELIGIBLE with a calculable total can ever be ranked.
  const eligible = evaluations.filter((e) => e.eligibility === 'ELIGIBLE' && e.totals.calculatedTotal !== null);
  const totals = eligible.map((e) => Money.from(e.totals.calculatedTotal));
  const max = totals.length ? totals.reduce((a, b) => (b.gt(a) ? b : a)) : null;
  const min = totals.length ? totals.reduce((a, b) => (b.lt(a) ? b : a)) : null;

  const scored = eligible.map((e, i) => {
    const total = totals[i] as Money;
    const flags: string[] = [];
    const reasons: string[] = [];

    let cost: number;
    if (!max || !min || max.eq(min)) {
      cost = 1;
      reasons.push(eligible.length > 1 ? 'Cost score 1.00: all eligible quotations have the same total.' : 'Cost score 1.00: the only eligible quotation.');
    } else {
      cost = Money.ratio(max.sub(total), max.sub(min));
      reasons.push(`Cost score ${cost.toFixed(2)} (min-max across eligible totals).`);
    }

    let delivery: number;
    if (e.deliveryDays === null || deadlineDays <= 0) {
      delivery = 0;
      flags.push('DELIVERY_UNKNOWN');
      reasons.push('Delivery score 0: delivery time is unknown (flagged).');
    } else {
      delivery = clamp01((deadlineDays - e.deliveryDays) / deadlineDays);
      reasons.push(`Delivery score ${delivery.toFixed(2)}: ${e.deliveryDays} day(s) against a ${deadlineDays}-day deadline.`);
    }

    const specs = safe01(e.specScore);
    const completeness = safe01(e.completenessScore);
    if (completeness < 1) flags.push('INCOMPLETE_INFORMATION');
    if (specs < 1) flags.push('SPECS_NOT_FULLY_CONFIRMED');
    reasons.push(`Specification score ${specs.toFixed(2)}, completeness score ${completeness.toFixed(2)}.`);

    const final = cost * w.cost + delivery * w.delivery + specs * w.specs + completeness * w.completeness;
    return { e, total, cost, delivery, specs, completeness, final, flags, reasons };
  });

  // Highest score first; ties -> lower total, faster delivery, then quoteId for determinism.
  scored.sort((a, b) =>
    b.final - a.final ||
    a.total.cmp(b.total) ||
    (a.e.deliveryDays ?? Infinity) - (b.e.deliveryDays ?? Infinity) ||
    a.e.quoteId.localeCompare(b.e.quoteId),
  );

  const rankedEntries: RankedEntry[] = scored.map((s, idx) => ({
    quoteId: s.e.quoteId,
    vendorId: s.e.vendorId,
    vendorName: s.e.vendorName,
    eligibility: s.e.eligibility,
    eligible: true,
    rank: idx + 1,
    finalScore: r4(s.final),
    costScore: r4(s.cost),
    deliveryScore: r4(s.delivery),
    specificationScore: r4(s.specs),
    completenessScore: r4(s.completeness),
    totalAmount: s.e.totals.calculatedTotal,
    currency: s.e.currency,
    deliveryDays: s.e.deliveryDays,
    reasons: s.reasons,
    flags: s.flags,
    disqualification: [],
  }));

  const rankedIds = new Set(rankedEntries.map((r) => r.quoteId));
  const excluded: RankedEntry[] = evaluations
    .filter((e) => !rankedIds.has(e.quoteId))
    .map((e) => {
      const problems = e.rules.filter((r) => r.status !== 'PASS');
      return {
        quoteId: e.quoteId,
        vendorId: e.vendorId,
        vendorName: e.vendorName,
        eligibility: e.eligibility === 'ELIGIBLE' ? 'NEEDS_REVIEW' : e.eligibility, // eligible-but-uncalculable is never shown as eligible
        eligible: false,
        rank: null,
        finalScore: null,
        costScore: null,
        deliveryScore: null,
        specificationScore: null,
        completenessScore: null,
        totalAmount: e.totals.calculatedTotal,
        currency: e.currency,
        deliveryDays: e.deliveryDays,
        reasons: e.reasons.length ? e.reasons : ['Total could not be calculated.'],
        flags: e.eligibility === 'INELIGIBLE' ? ['HARD_CONSTRAINT_FAILED'] : ['NEEDS_BUYER_REVIEW'],
        disqualification: problems.map(({ rule, status, explanation }) => ({ rule, status, explanation })),
      };
    });

  return {
    weights: w,
    entries: [...rankedEntries, ...excluded],
    winnerQuoteId: rankedEntries[0]?.quoteId ?? null,
    noEligibleMessage: rankedEntries.length === 0 ? NO_ELIGIBLE_VENDOR_MESSAGE : null,
  };
}
