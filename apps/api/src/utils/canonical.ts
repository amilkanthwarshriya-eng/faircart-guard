import { createHash } from 'node:crypto';

/** Deterministic JSON: sorted keys, Dates as ISO strings, undefined dropped. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(sortValue);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      const val = (v as Record<string, unknown>)[k];
      if (val !== undefined) out[k] = sortValue(val);
    }
    return out;
  }
  return v;
}

export const sha256Hex = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex');
