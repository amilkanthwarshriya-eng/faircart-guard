import type { QuoteExtraction } from '../schemas/quoteExtraction';

const MONEY_FIELDS = ['unitPrice', 'subtotal', 'tax', 'shipping', 'otherFees', 'discount', 'statedTotal'] as const;
/** Fields that must come with supporting text if they have a value. */
const NEEDS_EVIDENCE = [
  ...MONEY_FIELDS,
  'quantity',
  'deliveryDays',
  'deliveryDate',
  'validUntil',
  'paymentTerms',
] as const;
const CHECKED_FIELDS = new Set<string>([...NEEDS_EVIDENCE, 'vendorName', 'product', 'currency']);

/** Text that looks like an instruction aimed at an AI, not like quotation content. */
export const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all |any |the )*(previous|prior|above|earlier) (instructions?|prompts?|rules?)/i,
  /disregard (all |any |the )*(previous|prior|above|earlier)/i,
  /you are now\b/i,
  /system prompt/i,
  /approve (this|the|our) (vendor|quote|quotation|offer)/i,
  /(set|output|change) the (total|price)/i,
];

export function looksLikeInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((p) => p.test(text));
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** True if the money value (or its form without ".00") appears as a whole number in the evidence text. */
function moneyAppearsIn(value: string, evidence: string): boolean {
  const text = evidence.replace(/,/g, '');
  const forms = new Set([value, value.replace(/\.00$/, '')]);
  for (const f of forms) {
    const re = new RegExp(`(?<![\\d.])${f.replace(/\./g, '\\.')}(?!\\d)`);
    if (re.test(text)) return true;
  }
  return false;
}

export interface VerifyResult {
  extraction: QuoteExtraction;
  warnings: string[];
}

/**
 * Deterministic safety net after the model answers. Any value whose evidence is missing, not found in the
 * document, instruction-like, or does not contain the number is set back to null ("unknown, not guessed")
 * and reported in uncertainties. The buyer then reviews it.
 */
export function verifyEvidence(extraction: QuoteExtraction, sourceText: string): VerifyResult {
  const out: QuoteExtraction = structuredClone(extraction);
  const record = out as unknown as Record<string, unknown>;
  const src = norm(sourceText);
  const warnings: string[] = [];

  const reject = (field: string, reason: string) => {
    record[field] = null;
    delete out.evidence[field];
    if (!out.missingFields.includes(field)) out.missingFields.push(field);
    out.uncertainties.push({ field, reason });
    warnings.push(`${field}: ${reason}`);
  };

  const evidenceProblem = (field: string, evidence: string | undefined): string | null => {
    if (!evidence) return 'no supporting text provided';
    if (!src.includes(norm(evidence))) return 'supporting text not found in the document';
    if (looksLikeInjection(evidence)) return 'supporting text looks like an instruction, not quotation content';
    const value = record[field];
    if ((MONEY_FIELDS as readonly string[]).includes(field) && typeof value === 'string' && Number(value) !== 0) {
      if (!moneyAppearsIn(value, evidence)) return 'the amount does not appear in the supporting text';
    }
    return null;
  };

  for (const field of NEEDS_EVIDENCE) {
    if (record[field] === null) continue;
    const problem = evidenceProblem(field, out.evidence[field]);
    if (problem) reject(field, problem);
  }

  // Optional fields: if the model gave evidence anyway, it must still be real.
  for (const field of ['vendorName', 'product', 'currency']) {
    if (record[field] === null || out.evidence[field] === undefined) continue;
    const problem = evidenceProblem(field, out.evidence[field]);
    if (problem) reject(field, problem);
  }

  // Drop evidence entries for unknown keys or for fields that are now null.
  for (const key of Object.keys(out.evidence)) {
    if (!CHECKED_FIELDS.has(key) || record[key] === null) delete out.evidence[key];
  }

  return { extraction: out, warnings };
}
