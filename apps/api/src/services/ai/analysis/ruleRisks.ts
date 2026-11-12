import type { QuoteRisk } from '../schemas/quoteRisk';
import type { AnalysisContext, AnalysisQuoteInput } from './types';

/** Display/compare helpers only. The authoritative money maths lives in M3's money library. */
const toMinor = (s: string): number => {
  const [i, f = ''] = s.split('.');
  return Number(i) * 100 + Number((f + '00').slice(0, 2));
};
const fmt = (minor: number): string => `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}`;

type Draft = Omit<QuoteRisk, 'quoteId' | 'source'>;

/** Risks found by plain code. These never depend on the model, so they always work. */
export function detectRuleRisks(ctx: AnalysisContext, q: AnalysisQuoteInput): QuoteRisk[] {
  const e = q.extraction;
  const risks: QuoteRisk[] = [];
  const handled = new Set<string>();
  const reasonFor = (field: string) => e.uncertainties.find((u) => u.field === field)?.reason;
  const note = (field: string) => (reasonFor(field) ? ` Note: ${reasonFor(field)}.` : '');
  const add = (draft: Draft, ...fields: string[]) => {
    risks.push({ quoteId: q.quoteId, source: 'RULE', ...draft });
    fields.forEach((f) => handled.add(f));
  };

  // 1. Extra fee on top of price, tax and shipping: a disclosure item, never an accusation.
  if (e.otherFees !== null && toMinor(e.otherFees) !== 0) {
    add(
      {
        type: 'AMBIGUOUS_CHARGE',
        severity: 'MEDIUM',
        title: 'Extra fee to confirm with the vendor',
        detail:
          `The quotation lists an additional charge of ${ctx.currency} ${e.otherFees} that is separate from the unit price, tax and shipping. ` +
          `Ask the vendor what it covers and whether it is mandatory.${note('otherFees')}`,
        evidence: e.evidence.otherFees ?? null,
      },
      'otherFees',
    );
  }

  // 2. Stated total vs the backend-calculated total.
  if (e.statedTotal === null) {
    add(
      {
        type: 'MISSING_INFO',
        severity: 'MEDIUM',
        title: 'Total amount not stated',
        detail: `The quotation does not clearly state a total.${note('statedTotal')}`,
        evidence: null,
      },
      'statedTotal',
    );
  } else if (q.calculatedTotal !== null && toMinor(e.statedTotal) !== toMinor(q.calculatedTotal)) {
    const diff = Math.abs(toMinor(e.statedTotal) - toMinor(q.calculatedTotal));
    add(
      {
        type: 'INCONSISTENT_AMOUNT',
        severity: 'HIGH',
        title: 'Stated total does not match its own components',
        detail:
          `The quotation states a total of ${ctx.currency} ${e.statedTotal}, but its listed components add up to ` +
          `${ctx.currency} ${q.calculatedTotal} (calculated by the system). The difference is ${ctx.currency} ${fmt(diff)}. Ask the vendor to clarify.`,
        evidence: e.evidence.statedTotal ?? null,
      },
      'statedTotal',
    );
  }

  // 3. Missing information the buyer needs.
  if (e.tax === null) {
    add(
      { type: 'MISSING_INFO', severity: 'MEDIUM', title: 'Tax not stated', detail: `The final amount may change once tax is added.${note('tax')}`, evidence: null },
      'tax',
    );
  }
  if (e.shipping === null) {
    add(
      { type: 'MISSING_INFO', severity: 'MEDIUM', title: 'Shipping cost not stated', detail: `Shipping may be charged on top of this quotation.${note('shipping')}`, evidence: null },
      'shipping',
    );
  }
  if (e.deliveryDays === null && e.deliveryDate === null) {
    add(
      { type: 'DELIVERY_RISK', severity: 'MEDIUM', title: 'Delivery time not stated', detail: `The deadline of ${ctx.deadlineDays} days cannot be confirmed.${note('deliveryDays')}`, evidence: null },
      'deliveryDays',
      'deliveryDate',
    );
  }
  if (e.validUntil === null) {
    add(
      { type: 'MISSING_INFO', severity: 'LOW', title: 'Quote validity not stated', detail: `It is unclear how long this price is held.${note('validUntil')}`, evidence: null },
      'validUntil',
    );
  }

  // 4. Any other uncertainty the extraction step recorded.
  for (const u of e.uncertainties) {
    if (handled.has(u.field)) continue;
    handled.add(u.field);
    risks.push({
      quoteId: q.quoteId,
      source: 'RULE',
      type: 'OTHER',
      severity: 'LOW',
      title: `Needs review: ${u.field}`,
      detail: u.reason,
      evidence: e.evidence[u.field] ?? null,
    });
  }

  return risks;
}
