// The ?debug panel: whether to show it, and what it says about each source.
// Reads the catalog, but its subject is the panel, not the catalog.

import { DEBUG_PARAM } from "../site-config.ts";
import { SHEET_NAMES, type CatalogPayload } from "../worker/catalog.ts";
import type { CatalogSource } from "./page-catalog.ts";

export function isDebug(url: URL): boolean {
  return url.searchParams.has(DEBUG_PARAM);
}

/**
 * One row per sheet, in catalog order, plus the worker. Walking SHEET_NAMES
 * rather than naming each sheet is what keeps the panel honest: a sheet added
 * to the catalog cannot be left off the panel, which is how announcements and
 * videos both nearly shipped invisible.
 */
export function debugSources(
  catalog: CatalogPayload,
  source: CatalogSource = "kv",
) {
  const fetched = catalog.fetchedAt ? "fetchedAt " + catalog.fetchedAt : "";
  const live = source === "snapshot" ? "snapshot" : "live KV";
  return {
    sheets: SHEET_NAMES.map((name) => {
      // A snapshot written before this sheet existed simply has no key.
      const rows = catalog[name]?.length ?? 0;
      const err = catalog.lastError?.[name];
      return {
        name,
        state: rows ? live : "empty",
        rows,
        note: [err ? "lastError: " + err : "", fetched]
          .filter(Boolean)
          .join(" · "),
      };
    }),
    worker: { state: "same-origin", note: "" },
  };
}
