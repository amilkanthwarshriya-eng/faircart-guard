import { AiError, httpStatusToAiError } from '../errors';
import type { RawLLM } from '../types';

export interface GeminiConfig {
  apiKey: string;
  model: string;
  fetchFn?: typeof fetch;
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

export function createGeminiAdapter(cfg: GeminiConfig): RawLLM {
  const doFetch = cfg.fetchFn ?? fetch;
  return {
    provider: 'gemini',
    model: cfg.model,
    async complete({ system, prompt }, signal) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`;
      const res = await doFetch(url, {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0 },
        }),
      });
      if (!res.ok) throw httpStatusToAiError('gemini', res.status);
      const data = (await res.json()) as GeminiResponse;
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      if (!text) throw new AiError('PROVIDER_ERROR', 'gemini: empty response (possibly blocked by safety filters)');
      return text;
    },
  };
}
