import { AiError } from '../errors';
import { explanationResponseSchema } from '../schemas/explanation';
import type { LLMClient } from '../types';
import { prepare } from './facts';
import { EXPLANATION_SYSTEM_PROMPT, buildExplanationPrompt } from './prompts';
import { buildTemplateExplanation } from './template';
import type { Explanation, RankingData } from './types';
import { validateExplanation } from './validate';

const MAX_ATTEMPTS = 2;

/**
 * Explains M3's ranking in plain language. The model only receives structured ranking data.
 * Its text is accepted only if every number matches the data; otherwise we retry once, then use a code-written template.
 */
export async function explainRecommendation(llm: LLMClient, input: RankingData): Promise<Explanation> {
  const p = prepare(input);
  const warnings: string[] = [];

  if (!p.winner) return buildTemplateExplanation(p, { aiStatus: 'SKIPPED', warnings });

  let problems: string[] = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await llm.generateJson({
        schema: explanationResponseSchema,
        system: EXPLANATION_SYSTEM_PROMPT,
        prompt: buildExplanationPrompt(p.facts, problems),
      });
    } catch (err) {
      if (!(err instanceof AiError)) throw err;
      return buildTemplateExplanation(p, { aiStatus: 'FAILED', aiError: { code: err.code, message: err.message }, warnings });
    }

    problems = validateExplanation(res, p);
    if (problems.length === 0) {
      const byId = new Map(res.otherQuotes.map((o) => [o.quoteId, o.text]));
      return {
        source: 'AI', aiStatus: 'OK', warnings,
        headline: res.headline, whyWinner: res.whyWinner,
        otherQuotes: p.others.map((o) => ({ quoteId: o.quoteId, vendorName: p.names.get(o.quoteId)!, text: byId.get(o.quoteId)! })),
        ineligible: p.ineligibleNotes, // always written by code from M3's rule reasons
        tradeOffs: res.tradeOffs, remainingRisks: res.remainingRisks, uncertainties: res.uncertainties,
      };
    }
    warnings.push(`Attempt ${attempt} rejected: ${problems.join(' | ')}`);
  }

  return buildTemplateExplanation(p, { aiStatus: 'REJECTED', warnings });
}
