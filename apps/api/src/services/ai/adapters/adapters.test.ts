import { describe, expect, it } from 'vitest';
import { createLLMClientFromEnv } from '../factory';
import { createAnthropicAdapter } from './anthropicAdapter';
import { createGeminiAdapter } from './geminiAdapter';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const sig = new AbortController().signal;
const req = { system: 's', prompt: 'p' };

describe('gemini adapter', () => {
  it('returns text from candidates', async () => {
    const fetchFn = async () => json({ candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }] });
    const a = createGeminiAdapter({ apiKey: 'k', model: 'm', fetchFn: fetchFn as typeof fetch });
    expect(await a.complete(req, sig)).toBe('{"a":1}');
  });

  it('maps 429 to retryable RATE_LIMITED without leaking the key', async () => {
    const fetchFn = async () => json({ error: 'quota' }, 429);
    const a = createGeminiAdapter({ apiKey: 'SECRET-KEY', model: 'm', fetchFn: fetchFn as typeof fetch });
    const err = await a.complete(req, sig).catch((e) => e);
    expect(err).toMatchObject({ code: 'RATE_LIMITED', retryable: true });
    expect(String(err.message)).not.toContain('SECRET-KEY');
  });

  it('errors on an empty (blocked) response', async () => {
    const fetchFn = async () => json({ candidates: [] });
    const a = createGeminiAdapter({ apiKey: 'k', model: 'm', fetchFn: fetchFn as typeof fetch });
    await expect(a.complete(req, sig)).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
  });
});

describe('anthropic adapter', () => {
  it('returns text blocks', async () => {
    const fetchFn = async () => json({ content: [{ type: 'text', text: '{"a":1}' }] });
    const a = createAnthropicAdapter({ apiKey: 'k', model: 'm', fetchFn: fetchFn as typeof fetch });
    expect(await a.complete(req, sig)).toBe('{"a":1}');
  });

  it('maps 529 overloaded to retryable PROVIDER_ERROR', async () => {
    const fetchFn = async () => json({}, 529);
    const a = createAnthropicAdapter({ apiKey: 'k', model: 'm', fetchFn: fetchFn as typeof fetch });
    await expect(a.complete(req, sig)).rejects.toMatchObject({ code: 'PROVIDER_ERROR', retryable: true });
  });
});

describe('createLLMClientFromEnv', () => {
  it('defaults to gemini and needs a key', () => {
    expect(() => createLLMClientFromEnv({})).toThrowError(/GEMINI_API_KEY/);
  });
  it('builds a gemini client', () => {
    expect(createLLMClientFromEnv({ GEMINI_API_KEY: 'k' }).provider).toBe('gemini');
  });
  it('anthropic needs key and model', () => {
    expect(() => createLLMClientFromEnv({ LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k' })).toThrowError(/ANTHROPIC_MODEL/);
  });
  it('rejects unknown providers', () => {
    expect(() => createLLMClientFromEnv({ LLM_PROVIDER: 'foo' })).toThrowError(/Unknown LLM_PROVIDER/);
  });
});
