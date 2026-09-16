/* Catalog validation and merge rules for the Worker pipeline.
 *
 *     node --test tools/test-catalog.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  MAX_SHEET_BYTES,
  MAX_SHEET_ROWS,
  acceptSheet,
  emptyCatalog,
  headersOk,
  isStale,
  refreshData,
  refreshMode,
  validateEvents,
  validateProducts,
} from "../src/worker/catalog.ts";
import { dataAge, debugSources, gridFor } from "../src/lib/page-catalog.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const productsCsv = fs.readFileSync(path.join(root, "data/products.csv"), "utf8");
const eventsCsv = fs.readFileSync(path.join(root, "data/fixtures/events.csv"), "utf8");
const fixtureProducts = fs.readFileSync(
  path.join(root, "data/fixtures/products.csv"),
  "utf8"
);

test("products fixture and bake seed pass header validation", () => {
  assert.ok(validateProducts(productsCsv)?.length);
  assert.ok(validateProducts(fixtureProducts)?.length);
});

test("events fixture passes and drops undated junk", () => {
  const rows = validateEvents(eventsCsv);
  assert.ok(rows && rows.length >= 3);
});

test("pubhtml-shaped body is refused (the dangerous 200)", () => {
  const html = "<!DOCTYPE html><html><body>maker,name\nx,y</body></html>";
  assert.equal(headersOk(html, ["maker", "name"]), false);
  assert.equal(validateProducts(html), null);
});

test("missing required column fails", () => {
  assert.equal(validateProducts("name,heat\nSalsa,2\n"), null);
  assert.equal(validateEvents("name,time\nMarket,noon\n"), null);
});

test("oversized body is refused before parse", () => {
  const head = "maker,name,description,heat,price\n";
  const huge = head + "x".repeat(MAX_SHEET_BYTES);
  assert.ok(huge.length > MAX_SHEET_BYTES);
  assert.equal(acceptSheet("products", huge).error, "too large");
  assert.equal(validateProducts(huge), null);
});

test("too many rows is refused", () => {
  const lines = ["maker,name,description,heat,price"];
  for (let i = 0; i < MAX_SHEET_ROWS + 1; i++) {
    lines.push(`Paula,Jar ${i},desc,1,10`);
  }
  const text = lines.join("\n") + "\n";
  assert.ok(text.length < MAX_SHEET_BYTES);
  assert.equal(acceptSheet("products", text).error, "too many rows");
  assert.equal(validateProducts(text), null);
});

test("isStale treats missing fetchedAt as stale", () => {
  assert.equal(isStale(emptyCatalog()), true);
  assert.equal(
    isStale({ ...emptyCatalog(), fetchedAt: new Date().toISOString() }),
    false
  );
});

test("refreshMode: cold vs stale vs fresh (no double path)", () => {
  assert.equal(refreshMode(emptyCatalog()), "cold");
  assert.equal(
    refreshMode({
      ...emptyCatalog(),
      fetchedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    }),
    "stale"
  );
  assert.equal(
    refreshMode({ ...emptyCatalog(), fetchedAt: new Date().toISOString() }),
    "fresh"
  );
});

test("refreshData merges on partial failure", async () => {
  const store = new Map();
  store.set(
    "catalog",
    JSON.stringify({
      products: [{ maker: "Paula", name: "Keep Me" }],
      events: [{ date: "2099-01-01", name: "Old Fair" }],
      fetchedAt: "2020-01-01T00:00:00.000Z",
      lastError: null,
    })
  );

  const env = {
    PRODUCTS_CSV_URL: "https://example.test/products.csv",
    EVENTS_CSV_URL: "https://example.test/events.csv",
    CATALOG: {
      async get(key, type) {
        const v = store.get(key);
        if (v == null) return null;
        return type === "json" ? JSON.parse(v) : v;
      },
      async put(key, value) {
        store.set(key, value);
      },
    },
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("products")) {
      return new Response("<html>not csv</html>", { status: 200 });
    }
    return new Response(eventsCsv, { status: 200 });
  };

  try {
    const next = await refreshData(env);
    assert.equal(next.products[0]?.name, "Keep Me");
    assert.ok(next.events.length >= 3);
    assert.ok(next.lastError?.products);
    assert.equal(next.lastError?.events, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("dataAge hides fresh fetches and names stale hours", () => {
  const now = Date.parse("2026-09-15T18:00:00Z");
  assert.equal(dataAge(null, now).hidden, true);
  assert.equal(dataAge("2026-09-15T17:00:00Z", now).hidden, true);
  const stale = dataAge("2026-09-15T10:00:00Z", now);
  assert.equal(stale.hidden, false);
  assert.match(stale.text, /8 hours/);
});

test("gridFor featured leads with flagged rows", () => {
  const rows = [
    { maker: "John", name: "A", featured: "" },
    { maker: "John", name: "B", featured: "yes" },
    { maker: "Paula", name: "C", featured: "yes" },
  ];
  assert.deepEqual(gridFor(rows, "john", true).map((p) => p.name), ["B"]);
  assert.deepEqual(gridFor(rows, "John", false).map((p) => p.name), ["A", "B"]);
});

test("debugSources reports live KV row counts and lastError", () => {
  const d = debugSources({
    products: [{ name: "A" }, { name: "B" }],
    events: [],
    fetchedAt: "2026-09-15T12:00:00Z",
    lastError: { events: "too large" },
  });
  assert.equal(d.products.state, "live KV");
  assert.equal(d.products.rows, 2);
  assert.equal(d.events.state, "empty");
  assert.match(d.events.note, /lastError: too large/);
  assert.match(d.products.note, /fetchedAt 2026-09-15T12:00:00Z/);
});
