import { fmtMinor, toMinor } from '../explanation/facts';
import type { EngineQuote, EngineRequest, ProcurementEngine, RuleOutcome, ScoredQuote } from './engine';

/**
 * STAND-IN for Member 3's engine, written from section 6.3 of the project doc.
 * Use it for tests, the eval script and demos until M3's real engine is wired in.
 */
export function createReferenceEngine(opts: { now?: () => Date } = {}): ProcurementEngine {
  const now = opts.now ?? (() => new Date());
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  const totalOf = (q: EngineQuote) => q.calculatedTotal ?? q.extraction.statedTotal;

  const deliveryDaysOf = (q: EngineQuote): number | null => {
    const e = q.extraction;
    if (e.deliveryDays !== null) return e.deliveryDays;
    if (e.deliveryDate !== null) return Math.ceil((new Date(e.deliveryDate).getTime() - now().getTime()) / 86_400_000);
    return null;
  };

  /** A spec counts as confirmed if any of its main words (4+ letters) appears in the quotation. */
  const unconfirmedSpecs = (req: EngineRequest, q: EngineQuote): string[] => {
    const text = q.sourceText.toLowerCase();
    return req.requiredSpecs.filter((spec) => {
      const words = spec.toLowerCase().split(/\W+/).filter((w) => w.length >= 4);
      return !words.some((w) => text.includes(w));
    });
  };

  const completenessOf = (q: EngineQuote): number => {
    const e = q.extraction;
    const fields = [e.vendorName, e.quantity, e.unitPrice, e.subtotal, e.tax, e.shipping, e.statedTotal, e.validUntil, e.deliveryDays ?? e.deliveryDate];
    const present = fields.filter((f) => f !== null).length / fields.length;
    const unexplainedFee = q.risks.some((r) => r.type === 'AMBIGUOUS_CHARGE' || r.type === 'HIDDEN_CHARGE');
    return clamp(present - (unexplainedFee ? 0.1 : 0));
  };

  return {
    calculateTotal(e) {
      if (e.subtotal === null) return null;
      const m = (s: string | null) => (s === null ? 0 : toMinor(s));
      return fmtMinor(Math.max(0, m(e.subtotal) + m(e.tax) + m(e.shipping) + m(e.otherFees) - m(e.discount)));
    },

    evaluateRules(req, q): RuleOutcome {
      const fail: string[] = [];
      const review: string[] = [];

      const total = totalOf(q);
      if (total === null) review.push('The total price could not be determined');
      else if (toMinor(total) > toMinor(req.budget)) {
        fail.push(`Total ${req.currency} ${total} is above the budget of ${req.currency} ${req.budget}`);
      }

      const days = deliveryDaysOf(q);
      if (days === null) review.push('Delivery time is not stated');
      else if (days > req.deadlineDays) fail.push(`Delivery in ${days} days is later than the ${req.deadlineDays}-day deadline`);

      const valid = q.extraction.validUntil;
      if (valid !== null && new Date(`${valid}T23:59:59Z`).getTime() < now().getTime()) fail.push(`The quotation expired on ${valid}`);

      for (const spec of unconfirmedSpecs(req, q)) review.push(`Required specification not confirmed: ${spec}`);

      if (fail.length) return { status: 'FAIL', reasons: [...fail, ...review] };
      if (review.length) return { status: 'NEEDS_REVIEW', reasons: review };
      return { status: 'PASS', reasons: [] };
    },

    rank(req, eligible): ScoredQuote[] {
      if (!eligible.length) return [];
      const totals = eligible.map((q) => toMinor(totalOf(q) ?? '0'));
      const min = Math.min(...totals);
      const max = Math.max(...totals);
      const w = req.weights;
      const wSum = w.cost + w.delivery + w.specs + w.completeness;

      const scored = eligible.map((q, i) => {
        const days = deliveryDaysOf(q);
        const cost = max === min ? 1 : (max - totals[i]) / (max - min);
        const delivery = days === null ? 0 : clamp((req.deadlineDays - days) / req.deadlineDays);
        const specs = req.requiredSpecs.length ? 1 - unconfirmedSpecs(req, q).length / req.requiredSpecs.length : 1;
        const completeness = completenessOf(q);
        const final = (w.cost * cost + w.delivery * delivery + w.specs * specs + w.completeness * completeness) / wSum;
        return { quoteId: q.quoteId, total: totals[i], scores: { cost, delivery, specs, completeness, final } };
      });

      scored.sort((a, b) => b.scores.final - a.scores.final || a.total - b.total || a.quoteId.localeCompare(b.quoteId));
      return scored.map((s, i) => ({ quoteId: s.quoteId, rank: i + 1, scores: s.scores }));
    },
  };
}
