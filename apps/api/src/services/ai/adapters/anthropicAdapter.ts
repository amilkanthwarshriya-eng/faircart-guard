import { AiError, httpStatusToAiError } from '../errors';
import type { RawLLM } from '../types';

export interface AnthropicConfig {
  apiKey: string;
  model: string;
  fetchFn?: typeof fetch;
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
}

export function createAnthropicAdapter(cfg: AnthropicConfig): RawLLM {
  const doFetch = cfg.fetchFn ?? fetch;
  return {
    provider: 'anthropic',
    model: cfg.model,
    async complete({ system, prompt }, signal) {
      const res = await doFetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: 4096,
          temperature: 0,
          system,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) throw httpStatusToAiError('anthropic', res.status);
      const data = (await res.json()) as AnthropicResponse;
      const text = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
      if (!text) throw new AiError('PROVIDER_ERROR', 'anthropic: empty response');
      return text;
    },
  };
}
