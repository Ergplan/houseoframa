// Canonical JSON: object keys sorted at every depth, two-space indent, trailing newline.
// Array order is the extractor's responsibility (every array it writes is sorted on purpose).

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value), null, 2) + '\n';
}

/** Plain code-unit comparison: the same order on every machine and locale. */
export const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
