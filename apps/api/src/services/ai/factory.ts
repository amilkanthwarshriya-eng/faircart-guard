import { createAnthropicAdapter } from './adapters/anthropicAdapter';
import { createGeminiAdapter } from './adapters/geminiAdapter';
import { AiError } from './errors';
import { createLLMClientFrom, type ClientOptions } from './llmClient';
import type { LLMClient } from './types';

type Env = Record<string, string | undefined>;

/** Verified working on the free tier on 11 Nov 2026 (gemini-2.5-flash was retired on 16 Oct 2026). Override with GEMINI_MODEL. */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';

/** Picks the provider from LLM_PROVIDER (gemini | anthropic). Fails loudly on bad config; never falls back to a mock. */
export function createLLMClientFromEnv(env: Env = process.env, opts?: ClientOptions): LLMClient {
  const provider = (env.LLM_PROVIDER ?? 'gemini').toLowerCase();

  if (provider === 'gemini') {
    if (!env.GEMINI_API_KEY) throw new AiError('CONFIG', 'GEMINI_API_KEY is not set');
    const model = env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
    return createLLMClientFrom(createGeminiAdapter({ apiKey: env.GEMINI_API_KEY, model }), opts);
  }

  if (provider === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY) throw new AiError('CONFIG', 'ANTHROPIC_API_KEY is not set');
    if (!env.ANTHROPIC_MODEL) throw new AiError('CONFIG', 'ANTHROPIC_MODEL is not set');
    return createLLMClientFrom(
      createAnthropicAdapter({ apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL }),
      opts,
    );
  }

  throw new AiError('CONFIG', `Unknown LLM_PROVIDER "${provider}" (use gemini or anthropic)`);
}
