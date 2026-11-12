import { randomUUID } from 'node:crypto';
import { AiError } from '../errors';
import { quoteExtractionSchema, type QuoteExtraction } from '../schemas/quoteExtraction';
import type { LLMClient } from '../types';
import { EXTRACTION_SYSTEM_PROMPT, buildExtractionPrompt } from './prompts';
import { looksLikeInjection, verifyEvidence } from './verifyEvidence';

export interface ExtractionResult {
  extraction: QuoteExtraction;
  injectionSuspected: boolean;
  warnings: string[];
  provider: string;
  model: string;
}

const DEFAULT_MAX_CHARS = 20_000;
const FORGED_MARKER = /<<<\s*QUOTATION_(START|END)[^>]*>>>/gi;

export async function extractQuote(
  llm: LLMClient,
  sourceText: string,
  opts: { maxChars?: number } = {},
): Promise<ExtractionResult> {
  const trimmed = sourceText.trim();
  if (!trimmed) throw new AiError('INVALID_INPUT', 'Quotation text is empty');

  // 1. Untrusted text: cap its size and remove anything that imitates our delimiters.
  const text = trimmed.slice(0, opts.maxChars ?? DEFAULT_MAX_CHARS).replace(FORGED_MARKER, '[removed]');
  const injectionSuspected = looksLikeInjection(text);

  // 2. Ask the model. The client has no tool/function-calling path, so it cannot act, only return JSON.
  const nonce = randomUUID().slice(0, 8);
  const raw = await llm.generateJson({
    schema: quoteExtractionSchema,
    system: EXTRACTION_SYSTEM_PROMPT,
    prompt: buildExtractionPrompt(text, nonce),
  });

  // 3. Code (not the model) checks every value against the document.
  const { extraction, warnings } = verifyEvidence(raw, text);
  if (injectionSuspected) {
    warnings.push('Document contains instruction-like text. It was treated as data and ignored.');
  }

  return { extraction, injectionSuspected, warnings, provider: llm.provider, model: llm.model };
}
