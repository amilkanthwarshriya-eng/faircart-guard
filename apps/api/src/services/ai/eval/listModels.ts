/**
 * Run:  npx tsx src/services/ai/eval/listModels.ts      (from apps/api)
 * Prints the Gemini models your key can call with generateContent. Never prints the key.
 */
import { loadDotEnv } from './loadEnv';

async function main(): Promise<void> {
  const files = loadDotEnv();
  console.log(`.env files read: ${files.length ? files.join(', ') : '(none found)'}`);
  console.log(`GEMINI_API_KEY found: ${Boolean(process.env.GEMINI_API_KEY)}`);
  console.log(`GEMINI_MODEL in .env: ${process.env.GEMINI_MODEL ?? '(not set)'}\n`);

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error('No GEMINI_API_KEY found. Put it in apps/api/.env as: GEMINI_API_KEY=your_key (no quotes needed).');
    process.exit(1);
  }

  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
    headers: { 'x-goog-api-key': key },
  });
  if (!res.ok) {
    console.error(`Google answered HTTP ${res.status}. 400/403 usually means the key is wrong or was copied incompletely.`);
    process.exit(1);
  }
  const data = (await res.json()) as { models?: Array<{ name: string; supportedGenerationMethods?: string[] }> };
  const names = (data.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((n) => /flash/i.test(n));
  console.log('Flash models you can use (copy one into GEMINI_MODEL):');
  for (const n of names) console.log(`  ${n}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
