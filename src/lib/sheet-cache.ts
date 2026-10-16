// Cloudflare Workers scoped: refreshSources takes a KVNamespace and fetches
// with the `cf` cache options Workers' fetch() adds.

export type SheetCache<T extends Record<string, unknown[]>> = T & {
  fetchedAt: string | null;
  lastError: Partial<Record<keyof T, string>> | null;
};

export type SourceSpec<T> = {
  url: string;
  /** A blank url is "nothing to fetch" (no rows), not a fault. */
  optional?: boolean;
  validate: (text: string) => { rows?: T[]; error?: string };
};

async function fetchAndValidate<T>(
  name: string,
  spec: SourceSpec<T>,
): Promise<{ rows?: T[]; error?: string }> {
  if (!spec.url) return spec.optional ? { rows: [] } : { error: "url empty" };
  let res: Response;
  try {
    res = await fetch(spec.url, {
      cf: { cacheTtl: 0, cacheEverything: false },
    });
  } catch (e) {
    const error = "network: " + (e instanceof Error ? e.message : String(e));
    console.warn({ sheet: name, ok: false, error });
    return { error };
  }
  if (!res.ok) {
    const error = "http " + res.status;
    console.warn({ sheet: name, ok: false, error, status: res.status });
    return { error };
  }
  const text = await res.text();
  const out = spec.validate(text);
  if (out.error)
    console.warn({
      sheet: name,
      ok: false,
      error: out.error,
      bytes: text.length,
    });
  return out;
}

/** Coerce each named dataset and the two metadata fields. */
export async function readCache<T extends Record<string, unknown[]>>(
  kv: KVNamespace,
  key: string,
  names: (keyof T)[],
): Promise<SheetCache<T>> {
  const raw = await kv.get(key, "json");
  const o = (raw && typeof raw === "object" ? raw : {}) as Partial<
    SheetCache<T>
  >;
  const datasets = Object.fromEntries(
    names.map((n) => [n, Array.isArray(o[n]) ? o[n] : []]),
  ) as unknown as T;
  return {
    ...datasets,
    fetchedAt: typeof o.fetchedAt === "string" ? o.fetchedAt : null,
    lastError:
      o.lastError && typeof o.lastError === "object" ? o.lastError : null,
  };
}

/**
 * Fetch every source, merge with what is already stored, and write it back.
 * `versionKey`, when given, is written *after* the payload with the same
 * fetchedAt: a reader can learn which generation is current without pulling
 * the whole payload. The order matters — if the second write fails, readers
 * keep asking for the previous generation and see stale data, instead of
 * asking for a generation whose payload was never stored.
 */
export async function refreshSources<T extends Record<string, unknown[]>>(
  kv: KVNamespace,
  key: string,
  sources: { [K in keyof T]: SourceSpec<T[K][number]> },
  versionKey?: string,
): Promise<SheetCache<T>> {
  const names = Object.keys(sources) as (keyof T)[];
  const prev = await readCache<T>(kv, key, names);

  const results = await Promise.all(
    names.map(
      async (n) => [n, await fetchAndValidate(String(n), sources[n])] as const,
    ),
  );

  const datasets = Object.fromEntries(
    results.map(([n, res]) => [n, res.rows ?? prev[n] ?? []]),
  ) as unknown as T;
  const err = Object.fromEntries(
    results.filter(([, res]) => res.error).map(([n, res]) => [n, res.error]),
  ) as Partial<Record<keyof T, string>>;
  const fetchedAt = new Date().toISOString();
  const next: SheetCache<T> = {
    ...datasets,
    fetchedAt,
    lastError: Object.keys(err).length ? err : null,
  };
  await kv.put(key, JSON.stringify(next));
  if (versionKey) await kv.put(versionKey, fetchedAt);
  return next;
}

/** The stored generation, or null before the first write. */
export function readVersion(
  kv: KVNamespace,
  versionKey: string,
): Promise<string | null> {
  return kv.get(versionKey);
}

export function isStale(
  p: { fetchedAt: string | null },
  staleMs: number,
  now = Date.now(),
): boolean {
  if (!p.fetchedAt) return true;
  const t = Date.parse(p.fetchedAt);
  if (!Number.isFinite(t)) return true;
  return now - t > staleMs;
}

export function refreshMode(
  p: { fetchedAt: string | null },
  staleMs: number,
  now = Date.now(),
): "cold" | "stale" | "fresh" {
  if (!p.fetchedAt) return "cold";
  if (isStale(p, staleMs, now)) return "stale";
  return "fresh";
}
