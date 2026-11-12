import { createHash } from 'node:crypto';
import type { LLMClient } from '../types';
import { extractQuote, type ExtractionResult } from './extractQuote';

export type ExtractionCache = Map<string, ExtractionResult>;

export const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

/**
 * Same document text + same provider/model = same stored result, so re-running analysis costs no model calls.
 * Failures are never cached. Keep one cache per server process (or back it with the database later).
 */
export async function extractQuoteCached(llm: LLMClient, sourceText: string, cache: ExtractionCache): Promise<ExtractionResult> {
  const key = `${llm.provider}:${llm.model}:${sha256(sourceText.trim())}`;
  const hit = cache.get(key);
  if (hit) return structuredClone(hit);
  const res = await extractQuote(llm, sourceText);
  cache.set(key, structuredClone(res));
  return res;
}
