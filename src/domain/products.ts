import { byField, selectOrFallback } from "../lib/grid.js";
import { isYes } from "../lib/csv.js";
import { FEATURED_MAX } from "../site-config.ts";
import type { Product } from "./page-catalog.ts";

export const byMaker = (products: Product[], maker: string) =>
  byField(products, "maker", maker);

export const featuredByMaker = (products: Product[], maker: string) =>
  selectOrFallback(
    byMaker(products, maker),
    (p) => isYes(p.featured),
    FEATURED_MAX,
  );

// This sheet writes "sold out" in the sold_out column, so the generic
// yes-parser isn't enough on its own.
export const isSoldOut = (p: Product) =>
  isYes(p.sold_out) || /^sold ?out$/i.test((p.sold_out ?? "").trim());
