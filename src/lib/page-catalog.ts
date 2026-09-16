import { featuredFrom, forMaker } from "./data.js";
import type { CatalogPayload } from "../worker/catalog.ts";

export type Product = Record<string, string>;

const DATA_AGE_MS = 6 * 60 * 60 * 1000;

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
  return url.searchParams.has("debug");
}

export function debugSources(catalog: CatalogPayload) {
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
  return {
    products: {
      state: catalog.products.length ? "live KV" : "empty",
      rows: catalog.products.length,
      note: productNote,
    },
    events: {
      state: catalog.events.length ? "live KV" : "empty",
      rows: catalog.events.length,
      note: eventNote,
    },
    worker: { state: "same-origin", note: "" },
  };
}
