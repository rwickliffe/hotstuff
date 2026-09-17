import { featuredFrom, forMaker } from "./data.js";
import { DEBUG_PARAM } from "../site-config.ts";
import type { CatalogPayload } from "../worker/catalog.ts";
import snapshot from "../../data/catalog-snapshot.json" with { type: "json" };

export type Product = Record<string, string>;
export type CatalogSource = "kv" | "snapshot";

const SNAPSHOT = snapshot as CatalogPayload;

const DATA_AGE_MS = 6 * 60 * 60 * 1000;

/** Empty KV uses the committed snapshot so both pages still have jars. */
export function catalogForPage(
  kv: CatalogPayload,
  floor: CatalogPayload = SNAPSHOT
): {
  catalog: CatalogPayload;
  source: CatalogSource;
} {
  if (kv.products.length) return { catalog: kv, source: "kv" };
  return { catalog: floor, source: "snapshot" };
}

export function gridFor(
  products: Product[],
  maker: string,
  featured: boolean
): Product[] {
  const mine = forMaker(products, maker.trim().toLowerCase());
  return featured ? featuredFrom(mine) : mine;
}

export function dataAge(
  fetchedAt: string | null,
  now = Date.now()
): { hidden: boolean; text: string } {
  if (!fetchedAt) return { hidden: true, text: "" };
  const t = Date.parse(fetchedAt);
  if (!Number.isFinite(t) || now - t < DATA_AGE_MS) {
    return { hidden: true, text: "" };
  }
  const hours = Math.round((now - t) / (60 * 60 * 1000));
  return {
    hidden: false,
    text: "List last refreshed about " + hours + " hours ago.",
  };
}

export function isDebug(url: URL): boolean {
  return url.searchParams.has(DEBUG_PARAM);
}

export function debugSources(catalog: CatalogPayload, source: CatalogSource = "kv") {
  const fetched = catalog.fetchedAt ? "fetchedAt " + catalog.fetchedAt : "";
  const productNote = [
    catalog.lastError?.products ? "lastError: " + catalog.lastError.products : "",
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
