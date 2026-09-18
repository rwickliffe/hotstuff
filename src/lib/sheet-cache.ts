// Cloudflare Workers scoped: refreshSources takes a KVNamespace and fetches
// with the `cf` cache options Workers' fetch() adds.

export type SheetCache<T extends Record<string, unknown[]>> = T & {
  fetchedAt: string | null;
  lastError: Partial<Record<keyof T, string>> | null;
};

export type SourceSpec<T> = {
  url: string;
  validate: (text: string) => { rows?: T[]; error?: string };
};

async function fetchAndValidate<T>(
  name: string,
  spec: SourceSpec<T>,
): Promise<{ rows?: T[]; error?: string }> {
  if (!spec.url) return { error: "url empty" };
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

export async function refreshSources<T extends Record<string, unknown[]>>(
  kv: KVNamespace,
  key: string,
  sources: { [K in keyof T]: SourceSpec<T[K][number]> },
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
  const next: SheetCache<T> = {
    ...datasets,
    fetchedAt: new Date().toISOString(),
    lastError: Object.keys(err).length ? err : null,
  };
  await kv.put(key, JSON.stringify(next));
  return next;
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
