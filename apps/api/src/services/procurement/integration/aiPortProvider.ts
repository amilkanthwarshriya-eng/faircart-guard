/**
 * TEMPORARY INTEGRATION STUBS (Member 3). Delete/replace once Member 2's service is registered.
 *  - NullAiAnalysisPort:  default. Returns NO risks and NO explanation, status UNAVAILABLE. It fakes nothing.
 *  - DemoFixtureAiAnalysisPort: only when DEMO_MODE=true and no real port is registered. Every output is
 *    labelled DEMO_FIXTURE; it flags non-zero "other fees" mechanically (cautious wording, never "fraud").
 */
import type { AiAnalysisInput, AiAnalysisPort, AiAnalysisResult } from './aiPort';
import { getEnv } from '../../../config/env';

let registered: AiAnalysisPort | null = null;

/** TODO(Member 2): call this at start-up with the real AI-backed implementation. */
export function setAiAnalysisPort(port: AiAnalysisPort | null): void {
  registered = port;
}

export const NullAiAnalysisPort: AiAnalysisPort = {
  async analyze(): Promise<AiAnalysisResult> {
    return { status: 'UNAVAILABLE', source: 'NONE', risks: [], explanation: null, error: 'No AI analysis service is registered.' };
  },
};

export const DemoFixtureAiAnalysisPort: AiAnalysisPort = {
  async analyze(input: AiAnalysisInput): Promise<AiAnalysisResult> {
    const risks: AiAnalysisResult['risks'] = [];
    for (const q of input.quotes) {
      const fees = q.evaluation.totals.otherFees;
      if (fees && Number(fees) > 0) {
        risks.push({
          quoteId: q.quoteId,
          category: 'AMBIGUOUS_CHARGE',
          severity: 'MEDIUM',
          title: '[DEMO FIXTURE] Additional fee should be disclosed',
          description: `The quotation includes other fees of ${q.evaluation.currency} ${fees}. This is a disclosure item to confirm with the vendor, not an accusation.`,
          evidence: q.otherFeesDescription,
        });
      }
    }
    return { status: 'OK', source: 'DEMO_FIXTURE', risks, explanation: null };
  },
};

export function getAiAnalysisPort(): AiAnalysisPort {
  if (registered) return registered;
  return getEnv().DEMO_MODE ? DemoFixtureAiAnalysisPort : NullAiAnalysisPort;
}
