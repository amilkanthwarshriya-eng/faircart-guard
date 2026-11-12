/**
 * ProcurementRulesService - deterministic procurement rules (NO LLM involved).
 *
 * Every rule is an independent pure function returning
 *   { rule, status: PASS | FAIL | NEEDS_REVIEW, explanation, details }.
 *
 * Eligibility:
 *  - any FAIL (hard constraint broken)            -> INELIGIBLE
 *  - no FAIL but any NEEDS_REVIEW (uncertain data) -> NEEDS_REVIEW  (never silently accepted, never ranked)
 *  - all PASS                                      -> ELIGIBLE
 */
import { Money, calculateQuoteTotal, compareToBudget, currencyDecimals, type QuoteTotalResult } from '../../utils/money';
import type { QuoteRecord, QuoteStatus, RequestRecord } from './types';

export const NO_ELIGIBLE_VENDOR_MESSAGE =
  'No eligible vendor found. Review the purchasing requirements or request new quotations.';

export const RULE_NAMES = [
  'BUDGET', 'DELIVERY_DEADLINE', 'MANDATORY_SPECS', 'REQUIRED_INFO', 'QUOTE_VALIDITY', 'DATA_CONSISTENCY',
] as const;
export type RuleName = (typeof RULE_NAMES)[number];
export type RuleStatus = 'PASS' | 'FAIL' | 'NEEDS_REVIEW';
export type Eligibility = 'ELIGIBLE' | 'INELIGIBLE' | 'NEEDS_REVIEW';

export interface RuleResult {
  rule: RuleName;
  status: RuleStatus;
  explanation: string;
  details: Record<string, unknown>;
}

export interface RuleContext {
  request: RequestRecord;
  quote: QuoteRecord;
  totals: QuoteTotalResult;
  /** Effective delivery time in days (null = unknown). */
  deliveryDays: number | null;
  now: Date;
}

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Derived facts
// ---------------------------------------------------------------------------

export function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / DAY_MS);
}

/** Delivery days = quoted days, else derived from a quoted delivery date relative to the request creation. */
export function effectiveDeliveryDays(quote: QuoteRecord, baseline: Date): number | null {
  if (quote.deliveryDays !== null) return quote.deliveryDays;
  if (quote.deliveryDate) return Math.max(0, daysBetween(baseline, quote.deliveryDate));
  return null;
}

export function totalsFor(quote: QuoteRecord): QuoteTotalResult {
  return calculateQuoteTotal({
    currency: quote.currency,
    subtotal: quote.subtotal,
    lineItems: quote.lineItems,
    tax: quote.tax,
    shipping: quote.shipping,
    otherFees: quote.otherFees,
    discount: quote.discount,
    statedTotal: quote.statedTotal,
  });
}

export const normalizeSpec = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

export interface SpecCompliance {
  total: number;
  confirmed: string[];
  /** The quotation explicitly says the spec is NOT met. */
  contradicted: string[];
  /** No confirmation entry, or confirmed without supporting evidence text. */
  unverified: string[];
  /** confirmed / total (1.0 only when nothing is mandatory). */
  score: number;
}

export function specCompliance(requiredSpecs: readonly string[], confirmations: readonly { spec: string; confirmed: boolean; evidence: string | null }[]): SpecCompliance {
  const byKey = new Map(confirmations.map((c) => [normalizeSpec(c.spec), c]));
  const confirmed: string[] = [];
  const contradicted: string[] = [];
  const unverified: string[] = [];
  for (const spec of requiredSpecs) {
    const entry = byKey.get(normalizeSpec(spec));
    if (entry && !entry.confirmed) contradicted.push(spec);
    else if (entry && entry.confirmed && (entry.evidence ?? '').trim() !== '') confirmed.push(spec);
    else unverified.push(spec);
  }
  const total = requiredSpecs.length;
  return { total, confirmed, contradicted, unverified, score: total === 0 ? 1 : confirmed.length / total };
}

export interface InfoCompleteness {
  required: string[];
  present: string[];
  missing: string[];
  /** Non-blocking observations, e.g. an unexplained fee. */
  advisories: string[];
  /** present / required, in [0,1]. */
  score: number;
}

/**
 * Required info: subtotal, tax, shipping, otherFees, delivery, validUntil, buyerReviewed.
 * A non-zero otherFees additionally needs a description to count as "explained" (this only
 * lowers the completeness SCORE and raises an advisory - it does not block eligibility).
 */
export function infoCompleteness(quote: QuoteRecord, totals: QuoteTotalResult, deliveryDays: number | null): InfoCompleteness {
  const checks: [string, boolean][] = [
    ['subtotal', totals.subtotal !== null],
    ['tax', totals.tax !== null],
    ['shipping', totals.shipping !== null],
    ['otherFees', totals.otherFees !== null],
    ['delivery', deliveryDays !== null],
    ['validUntil', quote.validUntil !== null],
    ['buyerReviewed', quote.buyerReviewed],
  ];
  const advisories: string[] = [];
  if (totals.otherFees && !totals.otherFees.isZero()) {
    const explained = (quote.otherFeesDescription ?? '').trim() !== '';
    checks.push(['otherFeesExplained', explained]);
    if (!explained) advisories.push('OTHER_FEES_UNEXPLAINED: a non-zero fee is charged without a description.');
  }
  const required = checks.map(([n]) => n);
  const present = checks.filter(([, ok]) => ok).map(([n]) => n);
  const missing = checks.filter(([, ok]) => !ok).map(([n]) => n);
  return { required, present, missing, advisories, score: required.length === 0 ? 0 : present.length / required.length };
}

// ---------------------------------------------------------------------------
// Individual rules (each independently testable)
// ---------------------------------------------------------------------------

export function ruleBudget(ctx: RuleContext): RuleResult {
  const { request, quote, totals } = ctx;
  const base = { rule: 'BUDGET' as const };
  if (!totals.calculatedTotal) {
    return { ...base, status: 'NEEDS_REVIEW', explanation: 'The quote total cannot be calculated because the subtotal is missing.', details: { budget: request.budget, currency: request.currency } };
  }
  if (quote.currency.toUpperCase() !== request.currency.toUpperCase()) {
    return { ...base, status: 'NEEDS_REVIEW', explanation: `Quote currency ${quote.currency} differs from request currency ${request.currency}; the total cannot be compared with the budget.`, details: { quoteCurrency: quote.currency, requestCurrency: request.currency } };
  }
  const cmp = compareToBudget(totals.calculatedTotal, request.budget, request.currency);
  const details = {
    total: totals.calculatedTotal.toCurrencyString(request.currency),
    budget: Money.from(request.budget).toCurrencyString(request.currency),
    remaining: cmp.remaining.toCurrencyString(request.currency),
    overBy: cmp.overBy.toCurrencyString(request.currency),
    percentUsed: cmp.percentUsed,
    currency: request.currency,
  };
  return cmp.withinBudget
    ? { ...base, status: 'PASS', explanation: `Total ${request.currency} ${details.total} is within the budget of ${request.currency} ${details.budget}.`, details }
    : { ...base, status: 'FAIL', explanation: `Total ${request.currency} ${details.total} exceeds the budget of ${request.currency} ${details.budget} by ${details.overBy}.`, details };
}

export function ruleDeliveryDeadline(ctx: RuleContext): RuleResult {
  const { request, deliveryDays } = ctx;
  const base = { rule: 'DELIVERY_DEADLINE' as const };
  if (deliveryDays === null) {
    return { ...base, status: 'NEEDS_REVIEW', explanation: 'Delivery time is not stated, so the deadline cannot be verified.', details: { deadlineDays: request.deadlineDays } };
  }
  const details = { deliveryDays, deadlineDays: request.deadlineDays, slackDays: request.deadlineDays - deliveryDays };
  return deliveryDays <= request.deadlineDays
    ? { ...base, status: 'PASS', explanation: `Delivery in ${deliveryDays} day(s) meets the ${request.deadlineDays}-day deadline.`, details }
    : { ...base, status: 'FAIL', explanation: `Delivery in ${deliveryDays} day(s) misses the ${request.deadlineDays}-day deadline.`, details };
}

export function ruleMandatorySpecs(ctx: RuleContext): RuleResult {
  const { request, quote } = ctx;
  const base = { rule: 'MANDATORY_SPECS' as const };
  const sc = specCompliance(request.requiredSpecs, quote.specConfirmations);
  const details = { required: request.requiredSpecs, confirmed: sc.confirmed, contradicted: sc.contradicted, unverified: sc.unverified, score: sc.score };
  if (sc.contradicted.length > 0) {
    return { ...base, status: 'FAIL', explanation: `The quotation does not meet mandatory specification(s): ${sc.contradicted.join(', ')}.`, details };
  }
  if (sc.unverified.length > 0) {
    return { ...base, status: 'NEEDS_REVIEW', explanation: `Mandatory specification(s) not confirmed with evidence: ${sc.unverified.join(', ')}.`, details };
  }
  return { ...base, status: 'PASS', explanation: sc.total === 0 ? 'No mandatory specifications were required.' : `All ${sc.total} mandatory specification(s) are confirmed with evidence.`, details };
}

export function ruleRequiredInfo(ctx: RuleContext): RuleResult {
  const { quote, totals, deliveryDays } = ctx;
  const base = { rule: 'REQUIRED_INFO' as const };
  const info = infoCompleteness(quote, totals, deliveryDays);
  const details = { required: info.required, present: info.present, missing: info.missing, advisories: info.advisories, completenessScore: info.score };
  const blocking = info.missing.filter((m) => m !== 'otherFeesExplained');
  if (blocking.length > 0) {
    return { ...base, status: 'NEEDS_REVIEW', explanation: `Required information is missing or not yet reviewed by the buyer: ${blocking.join(', ')}.`, details };
  }
  return { ...base, status: 'PASS', explanation: info.advisories.length ? `All required information is present and reviewed. Note: ${info.advisories.join(' ')}` : 'All required information is present and reviewed.', details };
}

export function ruleQuoteValidity(ctx: RuleContext): RuleResult {
  const { quote, now } = ctx;
  const base = { rule: 'QUOTE_VALIDITY' as const };
  if (!quote.validUntil) {
    return { ...base, status: 'NEEDS_REVIEW', explanation: 'The quotation has no validity date, so expiry cannot be verified.', details: {} };
  }
  const details = { validUntil: quote.validUntil.toISOString(), now: now.toISOString() };
  return quote.validUntil.getTime() < now.getTime()
    ? { ...base, status: 'FAIL', explanation: `The quotation expired on ${quote.validUntil.toISOString().slice(0, 10)}.`, details }
    : { ...base, status: 'PASS', explanation: `The quotation is valid until ${quote.validUntil.toISOString().slice(0, 10)}.`, details };
}

export function ruleDataConsistency(ctx: RuleContext): RuleResult {
  const { request, quote, totals } = ctx;
  const base = { rule: 'DATA_CONSISTENCY' as const };
  const dp = currencyDecimals(request.currency);

  if (quote.currency.toUpperCase() !== request.currency.toUpperCase()) {
    return { ...base, status: 'FAIL', explanation: `Quote currency ${quote.currency} does not match the request currency ${request.currency}.`, details: { quoteCurrency: quote.currency, requestCurrency: request.currency } };
  }

  const issues: string[] = [];
  const details: Record<string, unknown> = {};
  if (totals.consistent === false && totals.difference && totals.statedTotal && totals.calculatedTotal) {
    issues.push(`The stated total ${totals.statedTotal.toFixed(dp)} differs from the calculated total ${totals.calculatedTotal.toFixed(dp)} by ${totals.difference.toFixed(dp)}.`);
    details.statedTotal = totals.statedTotal.toFixed(dp);
    details.calculatedTotal = totals.calculatedTotal.toFixed(dp);
    details.difference = totals.difference.toFixed(dp);
  }
  if (totals.subtotalMatchesLineItems === false) {
    issues.push('The stated subtotal does not equal the sum of the line items.');
    details.lineItemsTotal = totals.lineItemsTotal?.toFixed(dp) ?? null;
  }
  if (quote.deliveryDays !== null && quote.deliveryDate) {
    const derived = Math.max(0, daysBetween(request.createdAt, quote.deliveryDate));
    if (Math.abs(derived - quote.deliveryDays) > 1) {
      issues.push(`Delivery days (${quote.deliveryDays}) contradict the delivery date (about ${derived} days).`);
      details.derivedDeliveryDays = derived;
    }
  }
  if (!quote.buyerReviewed && quote.uncertainties.length > 0) {
    issues.push(`Unresolved uncertain field(s): ${quote.uncertainties.map((u) => u.field).join(', ')}.`);
    details.uncertainties = quote.uncertainties;
  }
  return issues.length > 0
    ? { ...base, status: 'NEEDS_REVIEW', explanation: issues.join(' '), details }
    : { ...base, status: 'PASS', explanation: 'No contradictory or uncertain information was found.', details };
}

const ALL_RULES: ((ctx: RuleContext) => RuleResult)[] = [
  ruleBudget, ruleDeliveryDeadline, ruleMandatorySpecs, ruleRequiredInfo, ruleQuoteValidity, ruleDataConsistency,
];

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export interface EvaluatedTotals {
  currency: string;
  subtotal: string | null;
  tax: string | null;
  shipping: string | null;
  otherFees: string | null;
  discount: string;
  /** Authoritative total (backend-calculated). null when it cannot be calculated. */
  calculatedTotal: string | null;
  statedTotal: string | null;
  difference: string | null;
  consistent: boolean | null;
  missing: string[];
}

export interface QuoteEvaluation {
  quoteId: string;
  vendorId: string;
  vendorName: string;
  currency: string;
  eligibility: Eligibility;
  /** Quote status the analyze step should persist. */
  suggestedQuoteStatus: Extract<QuoteStatus, 'ELIGIBLE' | 'INELIGIBLE' | 'EXPIRED' | 'NEEDS_REVIEW'>;
  totals: EvaluatedTotals;
  deliveryDays: number | null;
  specScore: number;
  completenessScore: number;
  rules: RuleResult[];
  /** Explanations of every rule that did not PASS. */
  reasons: string[];
}

const fmt = (m: Money | null, cur: string): string | null => (m ? m.roundToCurrency(cur).toCurrencyString(cur) : null);

export function evaluateQuote(request: RequestRecord, quote: QuoteRecord, now: Date): QuoteEvaluation {
  const totals = totalsFor(quote);
  const deliveryDays = effectiveDeliveryDays(quote, request.createdAt);
  const ctx: RuleContext = { request, quote, totals, deliveryDays, now };
  const rules = ALL_RULES.map((r) => r(ctx));

  const anyFail = rules.some((r) => r.status === 'FAIL');
  const anyReview = rules.some((r) => r.status === 'NEEDS_REVIEW');
  const eligibility: Eligibility = anyFail ? 'INELIGIBLE' : anyReview ? 'NEEDS_REVIEW' : 'ELIGIBLE';
  const expired = rules.some((r) => r.rule === 'QUOTE_VALIDITY' && r.status === 'FAIL');
  const suggestedQuoteStatus = eligibility === 'ELIGIBLE' ? 'ELIGIBLE' : eligibility === 'NEEDS_REVIEW' ? 'NEEDS_REVIEW' : expired ? 'EXPIRED' : 'INELIGIBLE';

  const cur = quote.currency;
  return {
    quoteId: quote.id,
    vendorId: quote.vendorId,
    vendorName: quote.vendorName,
    currency: cur,
    eligibility,
    suggestedQuoteStatus,
    totals: {
      currency: cur,
      subtotal: fmt(totals.subtotal, cur),
      tax: fmt(totals.tax, cur),
      shipping: fmt(totals.shipping, cur),
      otherFees: fmt(totals.otherFees, cur),
      discount: totals.discount.roundToCurrency(cur).toCurrencyString(cur),
      calculatedTotal: fmt(totals.calculatedTotal, cur),
      statedTotal: fmt(totals.statedTotal, cur),
      difference: fmt(totals.difference, cur),
      consistent: totals.consistent,
      missing: [...totals.missing],
    },
    deliveryDays,
    specScore: specCompliance(request.requiredSpecs, quote.specConfirmations).score,
    completenessScore: infoCompleteness(quote, totals, deliveryDays).score,
    rules,
    reasons: rules.filter((r) => r.status !== 'PASS').map((r) => `${r.rule}: ${r.explanation}`),
  };
}

export interface RulesOutcome {
  evaluations: QuoteEvaluation[];
  eligibleQuoteIds: string[];
  /** Set only when no quotation is eligible. */
  message: string | null;
}

export function evaluateQuotes(request: RequestRecord, quotes: readonly QuoteRecord[], now: Date): RulesOutcome {
  const evaluations = quotes.map((q) => evaluateQuote(request, q, now));
  const eligibleQuoteIds = evaluations.filter((e) => e.eligibility === 'ELIGIBLE').map((e) => e.quoteId);
  return { evaluations, eligibleQuoteIds, message: eligibleQuoteIds.length === 0 ? NO_ELIGIBLE_VENDOR_MESSAGE : null };
}
