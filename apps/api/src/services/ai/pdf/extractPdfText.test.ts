import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AiError } from '../errors';
import { sampleQuotes } from '../fixtures/sampleQuotes';
import { createLLMClientFrom } from '../llmClient';
import { extractQuote } from '../extraction/extractQuote';
import { extractQuoteCached } from '../extraction/extractionCache';
import { demoExtractionFor } from '../agent/steps';
import type { RawLLM } from '../types';
import { extractPdfText } from './extractPdfText';

const pdf = (name: string) => new Uint8Array(readFileSync(path.resolve(__dirname, '../fixtures/pdfs', name)));
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
const files: Record<string, string> = { A: 'quote-a.pdf', B: 'quote-b.pdf', C: 'quote-c.pdf', D_INJECTION: 'quote-d-injection.pdf' };

describe('extractPdfText', () => {
  for (const s of sampleQuotes) {
    it(`quote ${s.id}: every evidence line from the fixture is found in the PDF text`, async () => {
      const { text, pages } = await extractPdfText(pdf(files[s.id]));
      expect(pages).toBe(1);
      for (const [field, ev] of Object.entries(s.evidence)) {
        expect(norm(text), `evidence for ${field}`).toContain(norm(ev));
      }
    });
  }

  it('rejects a scanned PDF (no selectable text) with a manual-entry message', async () => {
    await expect(extractPdfText(pdf('scanned-no-text.pdf'))).rejects.toMatchObject({ code: 'INVALID_INPUT', message: expect.stringMatching(/scanned/) });
  });

  it('rejects files that are not PDFs, empty, oversized or too long', async () => {
    await expect(extractPdfText(new TextEncoder().encode('hello world'))).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(extractPdfText(new Uint8Array(0))).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(extractPdfText(pdf('quote-a.pdf'), { maxBytes: 100 })).rejects.toThrow(/larger than/);
    await expect(extractPdfText(pdf('three-pages.pdf'), { maxPages: 2 })).rejects.toThrow(/3 pages/);
    expect((await extractPdfText(pdf('three-pages.pdf'))).pages).toBe(3);
  });

  it('rejects a damaged PDF', async () => {
    const broken = new TextEncoder().encode('%PDF-1.4\nthis is not really a pdf');
    await expect(extractPdfText(broken)).rejects.toBeInstanceOf(AiError);
  });
});

describe('PDF -> extraction (end to end with a fake model)', () => {
  function fake() {
    let calls = 0;
    const raw: RawLLM = {
      provider: 'fake', model: 'm',
      async complete() { calls++; return JSON.stringify(demoExtractionFor(sampleQuotes[0])); },
    };
    return { llm: createLLMClientFrom(raw), calls: () => calls };
  }

  it('evidence checks pass on text read from a real PDF (no values lost to line breaks)', async () => {
    const { text } = await extractPdfText(pdf('quote-a.pdf'));
    const res = await extractQuote(fake().llm, text);
    expect(res.warnings).toEqual([]);
    expect(res.extraction.statedTotal).toBe('17910.00');
  });

  it('the injection PDF is flagged', async () => {
    const { text } = await extractPdfText(pdf('quote-d-injection.pdf'));
    const res = await extractQuote(fake().llm, text);
    expect(res.injectionSuspected).toBe(true);
  });

  it('cache: the second run on the same text makes no model call', async () => {
    const { llm, calls } = fake();
    const { text } = await extractPdfText(pdf('quote-a.pdf'));
    const cache = new Map();
    const first = await extractQuoteCached(llm, text, cache);
    const second = await extractQuoteCached(llm, text, cache);
    expect(calls()).toBe(1);
    expect(second.extraction).toEqual(first.extraction);
    second.extraction.vendorName = 'changed';
    expect((await extractQuoteCached(llm, text, cache)).extraction.vendorName).not.toBe('changed');
  });
});
