#!/usr/bin/env node
/* Refresh the committed catalog floor from live /data.
 *
 *     tools/pull-catalog.mjs
 *     DATA_URL=http://127.0.0.1:8787/data tools/pull-catalog.mjs
 *
 * Writes data/catalog-snapshot.json (empty-KV floor). Cron updates KV only —
 * run this before deploy when the sheet has meaningfully changed.
 *
 * Default DATA_URL is the deployed workers.dev /data.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapOut = path.join(root, "data/catalog-snapshot.json");
const dataUrl =
  process.env.DATA_URL || "https://hotstuff.rwickliffe.workers.dev/data";

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
console.log(
  `wrote ${products.length} products, ${events.length} events to data/catalog-snapshot.json from ${dataUrl}`
);
