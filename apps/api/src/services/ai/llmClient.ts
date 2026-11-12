import type { ZodType } from 'zod';
import { AiError } from './errors';
import type { LLMClient, RawLLM } from './types';

export interface ClientOptions {
  timeoutMs?: number; // per attempt
  maxRetries?: number; // only for 429 / 5xx
  baseDelayMs?: number; // backoff: base * 2^(n-1)
  sleep?: (ms: number) => Promise<void>; // injectable for tests
}

const JSON_ONLY = '\n\nRespond with a single JSON object only. No prose, no markdown fences.';

function toAiError(err: unknown): AiError {
  if (err instanceof AiError) return err;
  if (err instanceof Error && err.name === 'AbortError') {
    return new AiError('TIMEOUT', 'The AI provider did not answer in time');
  }
  return new AiError('PROVIDER_ERROR', 'Could not reach the AI provider');
}

function parseJson(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new AiError('INVALID_JSON', 'Model did not return valid JSON');
  }
}

type Checked<T> = { ok: true; data: T } | { ok: false; code: 'INVALID_JSON' | 'SCHEMA_INVALID'; reason: string };

function check<T>(text: string, schema: ZodType<T>): Checked<T> {
  let json: unknown;
  try {
    json = parseJson(text);
  } catch (e) {
    return { ok: false, code: 'INVALID_JSON', reason: (e as AiError).message };
  }
  const parsed = schema.safeParse(json);
  if (parsed.success) return { ok: true, data: parsed.data };
  const reason = parsed.error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ');
  return { ok: false, code: 'SCHEMA_INVALID', reason };
}

export function createLLMClientFrom(raw: RawLLM, opts: ClientOptions = {}): LLMClient {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const maxRetries = opts.maxRetries ?? 2;
  const baseDelayMs = opts.baseDelayMs ?? 1_000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  async function callWithRetry(system: string, prompt: string): Promise<string> {
    let attempt = 0;
    for (;;) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await raw.complete({ system, prompt }, controller.signal);
      } catch (err) {
        const aiErr = toAiError(err);
        if (!aiErr.retryable || attempt >= maxRetries) throw aiErr;
        attempt += 1;
        await sleep(baseDelayMs * 2 ** (attempt - 1));
      } finally {
        clearTimeout(timer);
      }
    }
  }

  return {
    provider: raw.provider,
    model: raw.model,

    async generateJson<T>({ schema, system, prompt }: { schema: ZodType<T>; system: string; prompt: string }) {
      const sys = system + JSON_ONLY;

      const first = await callWithRetry(sys, prompt);
      const r1 = check(first, schema);
      if (r1.ok) return r1.data;

      // One repair attempt, then surface the error (never fake success).
      const repairPrompt =
        `${prompt}\n\n---\nYour previous reply was rejected: ${r1.reason}\n` +
        `Previous reply:\n${first.slice(0, 4000)}\nReturn a corrected JSON object only.`;
      const second = await callWithRetry(sys, repairPrompt);
      const r2 = check(second, schema);
      if (r2.ok) return r2.data;

      throw new AiError(r2.code, `Model output failed validation after one repair attempt: ${r2.reason}`);
    },
  };
}
