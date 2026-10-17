#!/usr/bin/env node
/* Refresh the committed catalog floor from live /data.
 *
 *     tools/pull-catalog.mjs
 *     DATA_URL=http://127.0.0.1:8787/data tools/pull-catalog.mjs
 *
 * Writes data/catalog-snapshot.json (empty-KV floor). Cron updates KV only —
 * run this before deploy when the sheet has meaningfully changed.
 *
 * Default DATA_URL is the live site. Point it at a local wrangler dev when
 * you want the snapshot to match whatever you are testing against.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FLOOR_SHEETS, SHEET_NAMES } from "../src/worker/catalog.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapOut = path.join(root, "data/catalog-snapshot.json");
const dataUrl = process.env.DATA_URL || "https://paulaandcrazyjohn.com/data";

const res = await fetch(dataUrl, { cache: "no-store" });
if (!res.ok) {
  console.error(`FAIL: ${dataUrl} → HTTP ${res.status}`);
  process.exit(1);
}
const data = await res.json();
// The optional sheets stay empty on purpose: see FLOOR_SHEETS.
const datasets = Object.fromEntries(
  SHEET_NAMES.map((n) => [
    n,
    FLOOR_SHEETS.includes(n) && Array.isArray(data[n]) ? data[n] : [],
  ]),
);
if (!datasets.products.length) {
  console.error("FAIL: /data returned no products");
  process.exit(1);
}

const snapshot = {
  ...datasets,
  fetchedAt: typeof data.fetchedAt === "string" ? data.fetchedAt : null,
  lastError:
    data.lastError && typeof data.lastError === "object"
      ? data.lastError
      : null,
};
fs.writeFileSync(snapOut, JSON.stringify(snapshot, null, 2) + "\n");
console.log(
  `wrote ${FLOOR_SHEETS.map((n) => `${datasets[n].length} ${n}`).join(", ")} to data/catalog-snapshot.json from ${dataUrl}` +
    ` (${SHEET_NAMES.filter((n) => !FLOOR_SHEETS.includes(n)).join(", ")} left empty)`,
);
