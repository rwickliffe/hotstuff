/* Catalog validation and merge rules for the Worker pipeline. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_ROWS,
  sheetHeadersOk,
} from "../../src/lib/csv-guard.ts";
import {
  announcementRows,
  emptyCatalog,
  eventRows,
  productRows,
  refreshData,
  refreshMode,
} from "../../src/worker/catalog.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const eventsCsv = fs.readFileSync(
  path.join(root, "data/fixtures/events.csv"),
  "utf8",
);
const productsCsv = fs.readFileSync(
  path.join(root, "data/fixtures/products.csv"),
  "utf8",
);

test("products fixture passes header validation", () => {
  assert.ok(productRows(productsCsv).rows?.length);
});

test("events fixture passes and drops undated junk", () => {
  const rows = eventRows(eventsCsv).rows;
  assert.ok(rows && rows.length >= 3);
});

test("pubhtml-shaped body is refused (the dangerous 200)", () => {
  const html = "<!DOCTYPE html><html><body>maker,name\nx,y</body></html>";
  assert.equal(sheetHeadersOk(html, ["maker", "name"]), false);
  assert.ok(productRows(html).error);
});

test("missing required column fails", () => {
  assert.ok(productRows("name,heat\nSalsa,2\n").error);
  assert.ok(eventRows("name,time\nMarket,noon\n").error);
});

test("oversized body is refused before parse", () => {
  const head = "maker,name,description,heat,price\n";
  const huge = head + "x".repeat(DEFAULT_MAX_BYTES);
  assert.ok(huge.length > DEFAULT_MAX_BYTES);
  assert.equal(productRows(huge).error, "too large");
});

test("too many rows is refused", () => {
  const lines = ["maker,name,description,heat,price"];
  for (let i = 0; i < DEFAULT_MAX_ROWS + 1; i++) {
    lines.push(`Paula,Jar ${i},desc,1,10`);
  }
  const text = lines.join("\n") + "\n";
  assert.ok(text.length < DEFAULT_MAX_BYTES);
  assert.equal(productRows(text).error, "too many rows");
});

test("productRows drops nameless rows", () => {
  const out = productRows(
    "maker,name,description,heat,price\nPaula,,x,1,2\nPaula,Verde,x,1,2\n",
  );
  assert.deepEqual(
    out.rows?.map((r) => r.name),
    ["Verde"],
  );
});

test("refreshMode: cold vs stale vs fresh (no double path)", () => {
  assert.equal(refreshMode(emptyCatalog()), "cold");
  assert.equal(
    refreshMode({
      ...emptyCatalog(),
      fetchedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    }),
    "stale",
  );
  assert.equal(
    refreshMode({ ...emptyCatalog(), fetchedAt: new Date().toISOString() }),
    "fresh",
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
    }),
  );

  const env = {
    PRODUCTS_CSV_URL: "https://example.test/products.csv",
    EVENTS_CSV_URL: "https://example.test/events.csv",
    ANNOUNCEMENTS_CSV_URL: "",
    VIDEOS_CSV_URL: "",
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
    assert.equal(next.lastError?.announcements, undefined);
    assert.equal(next.lastError?.videos, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("announcements: headers only is a quiet success, a missing column is not", () => {
  assert.deepEqual(announcementRows("posted,headline\n"), { rows: [] });
  assert.ok(announcementRows("posted,text\n2026-10-01,Hi\n").error);
});

test("a blank URL is a quiet skip for the optional sheets only", async () => {
  const kv = { get: async () => null, put: async () => {} };
  const next = await refreshData({
    PRODUCTS_CSV_URL: "",
    EVENTS_CSV_URL: "",
    ANNOUNCEMENTS_CSV_URL: "",
    VIDEOS_CSV_URL: "",
    CATALOG: kv,
  });
  assert.deepEqual(next.announcements, []);
  assert.deepEqual(next.videos, []);
  // The two the site cannot do without still report a blank URL as a fault.
  assert.deepEqual(next.lastError, {
    products: "url empty",
    events: "url empty",
  });
});
