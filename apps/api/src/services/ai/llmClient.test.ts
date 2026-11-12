import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AiError } from './errors';
import { createLLMClientFrom } from './llmClient';
import type { RawLLM } from './types';

const schema = z.object({ a: z.number() }).strict();
const noSleep = async () => {};

function fake(replies: Array<string | Error>) {
  const state = { calls: 0 };
  const raw: RawLLM = {
    provider: 'fake',
    model: 'm',
    async complete() {
      const r = replies[state.calls++];
      if (r instanceof Error) throw r;
      return r as string;
    },
  };
  return { raw, state };
}

describe('LLMClient.generateJson', () => {
  it('returns validated JSON', async () => {
    const { raw } = fake(['{"a":1}']);
    const out = await createLLMClientFrom(raw).generateJson({ schema, system: 's', prompt: 'p' });
    expect(out).toEqual({ a: 1 });
  });

  it('accepts JSON wrapped in markdown fences', async () => {
    const { raw } = fake(['```json\n{"a":2}\n```']);
    const out = await createLLMClientFrom(raw).generateJson({ schema, system: 's', prompt: 'p' });
    expect(out).toEqual({ a: 2 });
  });

  it('repairs once when the first reply fails the schema', async () => {
    const { raw, state } = fake(['{"a":"x"}', '{"a":3}']);
    const out = await createLLMClientFrom(raw).generateJson({ schema, system: 's', prompt: 'p' });
    expect(out).toEqual({ a: 3 });
    expect(state.calls).toBe(2);
  });

  it('throws SCHEMA_INVALID after one failed repair (and rejects extra fields)', async () => {
    const { raw, state } = fake(['{"a":1,"extra":2}', '{"a":1,"extra":2}']);
    await expect(createLLMClientFrom(raw).generateJson({ schema, system: 's', prompt: 'p' })).rejects.toMatchObject({
      code: 'SCHEMA_INVALID',
    });
    expect(state.calls).toBe(2);
  });

  it('throws INVALID_JSON when output is never JSON', async () => {
    const { raw } = fake(['hello', 'still not json']);
    await expect(createLLMClientFrom(raw).generateJson({ schema, system: 's', prompt: 'p' })).rejects.toMatchObject({
      code: 'INVALID_JSON',
    });
  });

  it('retries 429 then succeeds', async () => {
    const { raw, state } = fake([new AiError('RATE_LIMITED', 'x', true, 429), '{"a":1}']);
    const out = await createLLMClientFrom(raw, { sleep: noSleep }).generateJson({ schema, system: 's', prompt: 'p' });
    expect(out).toEqual({ a: 1 });
    expect(state.calls).toBe(2);
  });

  it('does not retry non-retryable errors', async () => {
    const { raw, state } = fake([new AiError('CONFIG', 'bad key', false, 401)]);
    await expect(
      createLLMClientFrom(raw, { sleep: noSleep }).generateJson({ schema, system: 's', prompt: 'p' }),
    ).rejects.toMatchObject({ code: 'CONFIG' });
    expect(state.calls).toBe(1);
  });

  it('gives up after maxRetries', async () => {
    const e = () => new AiError('RATE_LIMITED', 'x', true, 429);
    const { raw, state } = fake([e(), e(), e()]);
    await expect(
      createLLMClientFrom(raw, { sleep: noSleep, maxRetries: 2 }).generateJson({ schema, system: 's', prompt: 'p' }),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(state.calls).toBe(3);
  });

  it('times out with a typed error', async () => {
    const raw: RawLLM = {
      provider: 'fake',
      model: 'm',
      complete: (_req, signal) =>
        new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))),
        ),
    };
    await expect(
      createLLMClientFrom(raw, { timeoutMs: 20 }).generateJson({ schema, system: 's', prompt: 'p' }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});
