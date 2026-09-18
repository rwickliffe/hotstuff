// This business's two sheets: headers, row rules, KV key, and stale window.
// The fetch/merge engine is src/lib/sheet-cache.ts; the size/header guard is
// src/lib/csv-guard.ts.

import {
  readCache,
  refreshSources,
  isStale as isStaleAt,
  refreshMode as refreshModeAt,
  type SheetCache,
} from "../lib/sheet-cache.ts";
import { acceptSheet } from "../lib/csv-guard.ts";
import { csvToObjects, normalizeDay } from "../lib/csv.js";

export const CATALOG_KEY = "catalog";
export const STALE_MS = 60 * 60 * 1000;

const PRODUCT_HEADERS = ["maker", "name", "description", "heat", "price"];
const EVENT_HEADERS = ["date", "name"];
const NAMES = ["products", "events"] as const;

type CatalogData = {
  products: Record<string, string>[];
  events: Record<string, string>[];
};

export type CatalogPayload = SheetCache<CatalogData>;

export function emptyCatalog(): CatalogPayload {
  return { products: [], events: [], fetchedAt: null, lastError: null };
}

export function productRows(text: string) {
  return acceptSheet(text, {
    requiredHeaders: PRODUCT_HEADERS,
    parse: (t) => csvToObjects(t).filter((r) => r.name),
  });
}

export function eventRows(text: string) {
  return acceptSheet(text, {
    requiredHeaders: EVENT_HEADERS,
    parse: (t) => csvToObjects(t).filter((r) => normalizeDay(r.date)),
  });
}

export function validateProducts(text: string) {
  return productRows(text).rows ?? null;
}

export function validateEvents(text: string) {
  return eventRows(text).rows ?? null;
}

export const isStale = (c: CatalogPayload, now?: number) => isStaleAt(c, STALE_MS, now);
export const refreshMode = (c: CatalogPayload, now?: number) => refreshModeAt(c, STALE_MS, now);

export function readCatalog(env: Env): Promise<CatalogPayload> {
  return readCache<CatalogData>(env.CATALOG, CATALOG_KEY, [...NAMES]);
}

export function refreshData(env: Env): Promise<CatalogPayload> {
  return refreshSources<CatalogData>(env.CATALOG, CATALOG_KEY, {
    products: { url: env.PRODUCTS_CSV_URL, validate: productRows },
    events: { url: env.EVENTS_CSV_URL, validate: eventRows },
  });
}
