// This business's three sheets: headers, row rules, KV key, and stale window.
// The fetch/merge engine is src/lib/sheet-cache.ts; the size/header guard is
// src/lib/csv-guard.ts.

import {
  readCache,
  refreshSources,
  refreshMode as refreshModeAt,
  type SheetCache,
} from "../lib/sheet-cache.ts";
import { acceptSheet } from "../lib/csv-guard.ts";
import { csvToObjects, normalizeDay } from "../lib/csv.js";

export const CATALOG_KEY = "catalog";
export const CATALOG_STALE_MS = 60 * 60 * 1000;

const PRODUCT_HEADERS = ["maker", "name", "description", "heat", "price"];
const EVENT_HEADERS = ["date", "name"];
// `expires`, `link` and `priority` are optional columns: a sheet without them
// still validates, and every row is then an ordinary one that never expires.
const ANNOUNCEMENT_HEADERS = ["posted", "headline"];
const SHEET_NAMES = ["products", "events", "announcements"] as const;

type CatalogData = {
  products: Record<string, string>[];
  events: Record<string, string>[];
  announcements: Record<string, string>[];
};

export type CatalogPayload = SheetCache<CatalogData>;

export function emptyCatalog(): CatalogPayload {
  return {
    products: [],
    events: [],
    announcements: [],
    fetchedAt: null,
    lastError: null,
  };
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

/** Most days there is nothing to announce, so no rows is a success here. */
export function announcementRows(text: string) {
  return acceptSheet(text, {
    requiredHeaders: ANNOUNCEMENT_HEADERS,
    parse: (t) => csvToObjects(t).filter((r) => r.headline?.trim()),
    allowEmpty: true,
  });
}

export const refreshMode = (c: CatalogPayload, now?: number) =>
  refreshModeAt(c, CATALOG_STALE_MS, now);

export function readCatalog(env: Env): Promise<CatalogPayload> {
  return readCache<CatalogData>(env.CATALOG, CATALOG_KEY, [...SHEET_NAMES]);
}

export function refreshData(env: Env): Promise<CatalogPayload> {
  return refreshSources<CatalogData>(env.CATALOG, CATALOG_KEY, {
    products: { url: env.PRODUCTS_CSV_URL, validate: productRows },
    events: { url: env.EVENTS_CSV_URL, validate: eventRows },
    announcements: {
      url: env.ANNOUNCEMENTS_CSV_URL,
      optional: true,
      validate: announcementRows,
    },
  });
}
