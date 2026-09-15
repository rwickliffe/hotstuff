// Catalog pipeline: fetch published sheet CSVs, validate, merge into KV.
// Pure validation helpers are exported for unit tests (this module is not
// the Worker entrypoint, so named exports are fine).

import { csvToObjects, parseDay } from "../../public/lib/data.js";

export const CATALOG_KEY = "catalog";

/** Soft age before GET /data refreshes in the background. Cron is the floor. */
export const STALE_MS = 60 * 60 * 1000;

/** Refuse runaway / garbage sheets before they land in KV. */
export const MAX_SHEET_BYTES = 256_000;
export const MAX_SHEET_ROWS = 500;

const PRODUCT_HEADERS = ["maker", "name", "description", "heat", "price"];
const EVENT_HEADERS = ["date", "name"];

export type SheetKind = "products" | "events";

export type CatalogPayload = {
  products: Record<string, string>[];
  events: Record<string, string>[];
  fetchedAt: string | null;
  lastError: { products?: string; events?: string } | null;
};

type CatalogEnv = {
  CATALOG: KVNamespace;
  PRODUCTS_CSV_URL: string;
  EVENTS_CSV_URL: string;
};

export function emptyCatalog(): CatalogPayload {
  return { products: [], events: [], fetchedAt: null, lastError: null };
}

/** Header line must include every required column (extra columns are fine). */
export function headersOk(text: string, required: string[]): boolean {
  const first = text.split(/\r?\n/, 1)[0] || "";
  // HTML publish URLs answer 200 with a document — refuse before parse.
  if (/^\s*</.test(first) || /<html/i.test(text.slice(0, 200))) return false;
  const head = first.split(",").map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
  return required.every((r) => head.includes(r));
}

export function validateProducts(text: string): Record<string, string>[] | null {
  const r = acceptSheet("products", text);
  return r.rows ?? null;
}

export function validateEvents(text: string): Record<string, string>[] | null {
  const r = acceptSheet("events", text);
  return r.rows ?? null;
}

/** Shared accept path: size → headers → rows → row cap. Distinct errors for logs. */
export function acceptSheet(
  kind: SheetKind,
  text: string
): { rows?: Record<string, string>[]; error?: string } {
  if (text.length > MAX_SHEET_BYTES) return { error: "too large" };
  const required = kind === "products" ? PRODUCT_HEADERS : EVENT_HEADERS;
  if (!headersOk(text, required)) return { error: "bad headers or no usable rows" };
  let rows =
    kind === "products"
      ? csvToObjects(text)
      : csvToObjects(text).filter((r) => parseDay(r.date));
  if (!rows.length) return { error: "bad headers or no usable rows" };
  if (rows.length > MAX_SHEET_ROWS) return { error: "too many rows" };
  return { rows };
}

async function readKv(env: CatalogEnv): Promise<CatalogPayload> {
  const raw = await env.CATALOG.get(CATALOG_KEY, "json");
  if (!raw || typeof raw !== "object") return emptyCatalog();
  const o = raw as Partial<CatalogPayload>;
  return {
    products: Array.isArray(o.products) ? o.products : [],
    events: Array.isArray(o.events) ? o.events : [],
    fetchedAt: typeof o.fetchedAt === "string" ? o.fetchedAt : null,
    lastError: o.lastError && typeof o.lastError === "object" ? o.lastError : null,
  };
}

async function fetchSheet(
  kind: SheetKind,
  url: string
): Promise<{ rows?: Record<string, string>[]; error?: string }> {
  if (!url) return { error: "url empty" };
  let res: Response;
  try {
    res = await fetch(url, { cf: { cacheTtl: 0, cacheEverything: false } });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.warn({ sheet: kind, ok: false, error });
    return { error: "network: " + error };
  }
  if (!res.ok) {
    const error = "http " + res.status;
    console.warn({ sheet: kind, ok: false, error, status: res.status });
    return { error };
  }
  const text = await res.text();
  const accepted = acceptSheet(kind, text);
  if (accepted.error) {
    console.warn({
      sheet: kind,
      ok: false,
      error: accepted.error,
      bytes: text.length,
    });
    return { error: accepted.error };
  }
  return { rows: accepted.rows };
}

/** Fetch both sheets; on partial failure keep the previous good side. */
export async function refreshData(env: CatalogEnv): Promise<CatalogPayload> {
  const prev = await readKv(env);
  const [products, events] = await Promise.all([
    fetchSheet("products", env.PRODUCTS_CSV_URL),
    fetchSheet("events", env.EVENTS_CSV_URL),
  ]);

  const next: CatalogPayload = {
    products: products.rows ?? prev.products,
    events: events.rows ?? prev.events,
    fetchedAt: new Date().toISOString(),
    lastError: null,
  };
  const err: { products?: string; events?: string } = {};
  if (products.error) err.products = products.error;
  if (events.error) err.events = events.error;
  if (err.products || err.events) next.lastError = err;

  await env.CATALOG.put(CATALOG_KEY, JSON.stringify(next));
  return next;
}

export async function readCatalog(env: CatalogEnv): Promise<CatalogPayload> {
  return readKv(env);
}

export function isStale(catalog: CatalogPayload, now = Date.now()): boolean {
  if (!catalog.fetchedAt) return true;
  const t = Date.parse(catalog.fetchedAt);
  if (!Number.isFinite(t)) return true;
  return now - t > STALE_MS;
}

/** How /data should refresh: cold blocks, stale is background, fresh is a no-op. */
export function refreshMode(catalog: CatalogPayload, now = Date.now()): "cold" | "stale" | "fresh" {
  if (!catalog.fetchedAt) return "cold";
  if (isStale(catalog, now)) return "stale";
  return "fresh";
}
