#!/usr/bin/env node
/* Refresh data/products.csv from the live Worker /data payload so the bake
 * floor matches what the site serves. Events stay sheet-only (not baked).
 *
 *     tools/pull-catalog.mjs
 *     DATA_URL=http://127.0.0.1:8787/data tools/pull-catalog.mjs
 *
 * Default DATA_URL is the deployed workers.dev /data. Then run
 * tools/make-catalog.mjs to rewrite the HTML blocks.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "data/products.csv");
const dataUrl =
  process.env.DATA_URL || "https://hotstuff.rwickliffe.workers.dev/data";

/** @param {string} s */
function csvCell(s) {
  const v = String(s ?? "");
  return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

/** Prefer a stable column order matching the historical seed. */
const PREFERRED = [
  "maker",
  "name",
  "description",
  "heat",
  "price",
  "price_quart",
  "sold_out",
  "featured",
];

const res = await fetch(dataUrl, { cache: "no-store" });
if (!res.ok) {
  console.error(`FAIL: ${dataUrl} → HTTP ${res.status}`);
  process.exit(1);
}
/** @type {{ products?: Record<string, string>[] }} */
const data = await res.json();
const products = Array.isArray(data.products) ? data.products : [];
if (!products.length) {
  console.error("FAIL: /data returned no products");
  process.exit(1);
}

const keys = new Set();
for (const row of products) Object.keys(row).forEach((k) => keys.add(k));
const cols = [
  ...PREFERRED.filter((k) => keys.has(k)),
  ...[...keys].filter((k) => !PREFERRED.includes(k)).sort(),
];

const lines = [cols.join(",")];
for (const row of products) {
  lines.push(cols.map((c) => csvCell(row[c])).join(","));
}
fs.writeFileSync(out, lines.join("\n") + "\n");
console.log(`wrote ${products.length} products to data/products.csv from ${dataUrl}`);
console.log("next: tools/make-catalog.mjs");
