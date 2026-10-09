// This business's four sheets: headers, row rules, KV key, and stale window.
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
import { youtubeId } from "../domain/videos.ts";

export const CATALOG_KEY = "catalog";
export const CATALOG_STALE_MS = 60 * 60 * 1000;

const PRODUCT_HEADERS = ["maker", "name", "description", "heat", "price"];
const EVENT_HEADERS = ["date", "name"];
// `expires`, `link` and `priority` are optional columns: a sheet without them
// still validates, and every row is then an ordinary one that never expires.
const ANNOUNCEMENT_HEADERS = ["posted", "headline"];
// `posted`, `blurb` and `featured` are optional. `video` takes a YouTube id
// or any address they paste; a row with no id in it is dropped here.
const VIDEO_HEADERS = ["video", "title"];
/** Every sheet in the catalog. The ?debug panel walks this, so a new sheet
 *  shows up there without anyone remembering to add it. */
export const SHEET_NAMES = [
  "products",
  "events",
  "announcements",
  "videos",
] as const;

export type SheetName = (typeof SHEET_NAMES)[number];

type CatalogData = {
  products: Record<string, string>[];
  events: Record<string, string>[];
  announcements: Record<string, string>[];
  videos: Record<string, string>[];
};

export type CatalogPayload = SheetCache<CatalogData>;

export function emptyCatalog(): CatalogPayload {
  return {
    products: [],
    events: [],
    announcements: [],
    videos: [],
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

/** Empty until they start filming, which is not a fault either. */
export function videoRows(text: string) {
  return acceptSheet(text, {
    requiredHeaders: VIDEO_HEADERS,
    parse: (t) =>
      csvToObjects(t).filter((r) => r.title?.trim() && youtubeId(r.video)),
    allowEmpty: true,
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
    videos: { url: env.VIDEOS_CSV_URL, optional: true, validate: videoRows },
  });
}
