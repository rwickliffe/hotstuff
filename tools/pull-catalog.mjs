#!/usr/bin/env node
/* Refresh the committed catalog floor from live /data.
 *
 *     tools/pull-catalog.mjs
 *     DATA_URL=http://127.0.0.1:8787/data tools/pull-catalog.mjs
 *
 * Writes data/catalog-snapshot.json (Astro's empty-KV floor) and
 * data/products.csv (bake seed until step 4). Cron updates KV only — run
 * this before deploy when the sheet has meaningfully changed.
 *
 * Default DATA_URL is the deployed workers.dev /data.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const csvOut = path.join(root, "data/products.csv");
const snapOut = path.join(root, "data/catalog-snapshot.json");
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
/** @type {{
 *   products?: Record<string, string>[],
 *   events?: Record<string, string>[],
 *   fetchedAt?: string | null,
 *   lastError?: { products?: string, events?: string } | null
 * }} */
const data = await res.json();
const products = Array.isArray(data.products) ? data.products : [];
const events = Array.isArray(data.events) ? data.events : [];
if (!products.length) {
  console.error("FAIL: /data returned no products");
  process.exit(1);
}

const snapshot = {
  products,
  events,
  fetchedAt: typeof data.fetchedAt === "string" ? data.fetchedAt : null,
  lastError: data.lastError && typeof data.lastError === "object" ? data.lastError : null,
};
fs.writeFileSync(snapOut, JSON.stringify(snapshot, null, 2) + "\n");

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
fs.writeFileSync(csvOut, lines.join("\n") + "\n");
console.log(
  `wrote ${products.length} products, ${events.length} events to data/catalog-snapshot.json`
);
console.log(`wrote ${products.length} products to data/products.csv from ${dataUrl}`);
