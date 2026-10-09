// The ?debug panel: whether to show it, and what it says about each source.
// Reads the catalog, but its subject is the panel, not the catalog.

import { DEBUG_PARAM } from "../site-config.ts";
import type { CatalogPayload } from "../worker/catalog.ts";
import type { CatalogSource } from "./page-catalog.ts";

export function isDebug(url: URL): boolean {
  return url.searchParams.has(DEBUG_PARAM);
}

export function debugSources(
  catalog: CatalogPayload,
  source: CatalogSource = "kv",
) {
  const fetched = catalog.fetchedAt ? "fetchedAt " + catalog.fetchedAt : "";
  const live = source === "snapshot" ? "snapshot" : "live KV";
  const sheet = (name: "products" | "events" | "announcements") => {
    const err = catalog.lastError?.[name];
    return {
      state: catalog[name].length ? live : "empty",
      rows: catalog[name].length,
      note: [err ? "lastError: " + err : "", fetched]
        .filter(Boolean)
        .join(" · "),
    };
  };
  return {
    products: sheet("products"),
    events: sheet("events"),
    announcements: sheet("announcements"),
    worker: { state: "same-origin", note: "" },
  };
}
