#!/usr/bin/env node
/* Refresh the committed catalog floor from live /data.
 *
 *     DATA_URL=https://<worker>.<account>.workers.dev/data tools/pull-catalog.mjs
 *     DATA_URL=http://127.0.0.1:8787/data tools/pull-catalog.mjs
 *
 * Writes data/catalog-snapshot.json (empty-KV floor). Cron updates KV only —
 * run this before deploy when the sheet has meaningfully changed.
 *
 * DATA_URL is required: there is no single deployed Worker to default to.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SHEET_NAMES } from "../src/worker/catalog.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapOut = path.join(root, "data/catalog-snapshot.json");
const dataUrl = process.env.DATA_URL;
if (!dataUrl) {
  console.error(
    "FAIL: set DATA_URL to the /data URL of a deployed or local Worker",
  );
  process.exit(1);
}

const res = await fetch(dataUrl, { cache: "no-store" });
if (!res.ok) {
  console.error(`FAIL: ${dataUrl} → HTTP ${res.status}`);
  process.exit(1);
}
const data = await res.json();
const datasets = Object.fromEntries(
  SHEET_NAMES.map((n) => [n, Array.isArray(data[n]) ? data[n] : []]),
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
  `wrote ${SHEET_NAMES.map((n) => `${datasets[n].length} ${n}`).join(", ")} to data/catalog-snapshot.json from ${dataUrl}`,
);
