export const DEFAULT_MAX_BYTES = 256_000;
export const DEFAULT_MAX_ROWS = 500;

/** Header line must include every required column (extra columns are fine). */
export function headersOk(text: string, required: string[]): boolean {
  const first = text.split(/\r?\n/, 1)[0] || "";
  // HTML publish URLs answer 200 with a document — refuse before parse.
  if (/^\s*</.test(first) || /<html/i.test(text.slice(0, 200))) return false;
  const head = first
    .split(",")
    .map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
  return required.every((r) => head.includes(r));
}

/**
 * Size → headers → parse → empty check → row cap. A parse that yields no
 * rows is an error, not an empty success. The error string is the protocol:
 * callers store it and show it.
 */
export function acceptSheet<T>(
  text: string,
  opts: {
    requiredHeaders: string[];
    parse: (text: string) => T[];
    maxBytes?: number;
    maxRows?: number;
  },
): { rows?: T[]; error?: string } {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRows = opts.maxRows ?? DEFAULT_MAX_ROWS;
  if (text.length > maxBytes) return { error: "too large" };
  if (!headersOk(text, opts.requiredHeaders)) {
    return { error: "bad headers or no usable rows" };
  }
  const rows = opts.parse(text);
  if (!rows.length) return { error: "bad headers or no usable rows" };
  if (rows.length > maxRows) return { error: "too many rows" };
  return { rows };
}
