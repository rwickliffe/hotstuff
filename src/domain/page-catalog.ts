import type { CatalogPayload } from "../worker/catalog.ts";
import snapshot from "../../data/catalog-snapshot.json" with { type: "json" };

export type Product = Record<string, string>;
export type CatalogSource = "kv" | "snapshot";

const SNAPSHOT = snapshot as CatalogPayload;

const DATA_AGE_MS = 6 * 60 * 60 * 1000;

/** Empty KV uses the committed snapshot so both pages still have jars. */
export function catalogForPage(
  kv: CatalogPayload,
  floor: CatalogPayload = SNAPSHOT,
): {
  catalog: CatalogPayload;
  source: CatalogSource;
} {
  if (kv.products.length) return { catalog: kv, source: "kv" };
  return { catalog: floor, source: "snapshot" };
}

export function catalogDataAgeNotice(
  fetchedAt: string | null,
  now = Date.now(),
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
