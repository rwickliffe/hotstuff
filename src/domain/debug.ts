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
  const productNote = [
    catalog.lastError?.products
      ? "lastError: " + catalog.lastError.products
      : "",
    fetched,
  ]
    .filter(Boolean)
    .join(" · ");
  const eventNote = [
    catalog.lastError?.events ? "lastError: " + catalog.lastError.events : "",
    fetched,
  ]
    .filter(Boolean)
    .join(" · ");
  const live = source === "snapshot" ? "snapshot" : "live KV";
  return {
    products: {
      state: catalog.products.length ? live : "empty",
      rows: catalog.products.length,
      note: productNote,
    },
    events: {
      state: catalog.events.length ? live : "empty",
      rows: catalog.events.length,
      note: eventNote,
    },
    worker: { state: "same-origin", note: "" },
  };
}
