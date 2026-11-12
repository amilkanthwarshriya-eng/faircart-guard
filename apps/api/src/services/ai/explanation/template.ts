import { fmtMinor, toMinor, type Prepared } from './facts';
import type { Explanation } from './types';

export const NO_ELIGIBLE_MESSAGE = 'No eligible vendor found. Review the purchasing requirements or request new quotations.';

/** Explanation written by plain code from the ranking data. Used when the model is unavailable or its text fails our checks. */
export function buildTemplateExplanation(p: Prepared, base: Pick<Explanation, 'aiStatus' | 'aiError' | 'warnings'>): Explanation {
  const { data, winner, others, names } = p;

  if (!winner) {
    return {
      source: 'TEMPLATE', ...base, headline: NO_ELIGIBLE_MESSAGE, whyWinner: NO_ELIGIBLE_MESSAGE,
      otherQuotes: [], ineligible: p.ineligibleNotes, tradeOffs: [], remainingRisks: [], uncertainties: [],
    };
  }

  const cur = data.currency;
  const wName = names.get(winner.quoteId)!;
  const delivery =
    winner.deliveryDays === null
      ? 'Its delivery time is not stated.'
      : `It promises delivery in ${winner.deliveryDays} days against a ${data.deadlineDays}-day deadline.`;

  const otherQuotes = others.map((o) => {
    const n = names.get(o.quoteId)!;
    const diff = toMinor(o.total) - toMinor(winner.total);
    const price = diff === 0 ? 'the same total as' : `${cur} ${fmtMinor(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than`;
    const del = o.deliveryDays === null ? 'its delivery time is not stated' : `it promises delivery in ${o.deliveryDays} days`;
    return {
      quoteId: o.quoteId, vendorName: n,
      text: `${n} ranks #${o.rank} with an overall score of ${o.scores.final.toFixed(3)} (${wName}: ${winner.scores.final.toFixed(3)}). It has ${price} ${wName}, and ${del}.`,
    };
  });

  const tradeOffs: string[] = [];
  for (const o of others) {
    const n = names.get(o.quoteId)!;
    const diff = toMinor(winner.total) - toMinor(o.total);
    if (diff > 0) tradeOffs.push(`${n} costs ${cur} ${fmtMinor(diff)} less than ${wName} but ranks lower overall.`);
    if (o.deliveryDays !== null && winner.deliveryDays !== null && o.deliveryDays < winner.deliveryDays) {
      tradeOffs.push(`${n} promises delivery ${winner.deliveryDays - o.deliveryDays} days sooner than ${wName} but ranks lower overall.`);
    }
  }

  return {
    source: 'TEMPLATE', ...base,
    headline: `${wName} is the recommended vendor`,
    whyWinner:
      `${wName} has the highest overall score (${winner.scores.final.toFixed(3)}) among the eligible quotes. ` +
      `Its total is ${cur} ${winner.total}, which leaves ${cur} ${p.budgetRemaining} of the ${cur} ${data.budget} budget. ${delivery}`,
    otherQuotes, ineligible: p.ineligibleNotes, tradeOffs,
    remainingRisks: winner.risks.filter((r) => r.type !== 'MISSING_INFO').map((r) => r.title),
    uncertainties: winner.risks.filter((r) => r.type === 'MISSING_INFO').map((r) => r.title),
  };
}
