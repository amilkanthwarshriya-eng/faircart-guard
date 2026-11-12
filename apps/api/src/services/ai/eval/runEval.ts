/**
 * Run:  npx tsx src/services/ai/eval/runEval.ts      (from apps/api, with GEMINI_API_KEY in .env)
 * Uses sample quotations only. Never put real vendor documents through a free-tier provider.
 */
import { createReferenceEngine } from '../agent/referenceEngine';
import { createLLMClientFromEnv } from '../factory';
import { formatReport, runEval } from './evalRunner';
import { loadDotEnv } from './loadEnv';

async function main(): Promise<void> {
  loadDotEnv();
  // Patient settings for free tiers: longer waits between retries on 429.
  const llm = createLLMClientFromEnv(process.env, { timeoutMs: 60_000, maxRetries: 3, baseDelayMs: 4_000 });
  console.log(`Evaluating ${llm.provider} / ${llm.model} on sample quotations (about 8 requests) ...\n`);
  const report = await runEval(llm, createReferenceEngine(), (l) => console.log(l));
  console.log('\n' + formatReport(report));
  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? `${err.name}: ${err.message}` : err);
  process.exit(1);
});
