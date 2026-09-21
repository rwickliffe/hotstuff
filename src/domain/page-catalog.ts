import type { CatalogPayload } from "../worker/catalog.ts";
import snapshot from "../../data/catalog-snapshot.json" with { type: "json" };

export type Product = Record<string, string>;
export type CatalogSource = "kv" | "snapshot";

const SNAPSHOT = snapshot as CatalogPayload;

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
