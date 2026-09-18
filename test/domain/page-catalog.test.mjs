import assert from "node:assert/strict";
import test from "node:test";

import {
  catalogForPage,
  dataAge,
  debugSources,
} from "../../src/domain/page-catalog.ts";
import { emptyCatalog } from "../../src/worker/catalog.ts";

test("dataAge hides fresh fetches and names stale hours", () => {
  const now = Date.parse("2026-09-15T18:00:00Z");
  assert.equal(dataAge(null, now).hidden, true);
  assert.equal(dataAge("2026-09-15T17:00:00Z", now).hidden, true);
  const stale = dataAge("2026-09-15T10:00:00Z", now);
  assert.equal(stale.hidden, false);
  assert.match(stale.text, /8 hours/);
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

test("debugSources names snapshot when KV was empty", () => {
  const d = debugSources(
    {
      products: [{ name: "A" }],
      events: [{ name: "M" }],
      fetchedAt: null,
      lastError: null,
    },
    "snapshot",
  );
  assert.equal(d.products.state, "snapshot");
  assert.equal(d.events.state, "snapshot");
});

test("catalogForPage uses KV when it has products and the snapshot otherwise", () => {
  const floor = {
    products: [{ name: "Snap" }],
    events: [],
    fetchedAt: "2026-01-01T00:00:00Z",
    lastError: null,
  };
  const live = catalogForPage(
    {
      products: [{ name: "Live" }],
      events: [],
      fetchedAt: "2026-09-16T00:00:00Z",
      lastError: null,
    },
    floor,
  );
  assert.equal(live.source, "kv");
  assert.equal(live.catalog.products[0]?.name, "Live");

  const cold = catalogForPage(emptyCatalog(), floor);
  assert.equal(cold.source, "snapshot");
  assert.equal(cold.catalog.products[0]?.name, "Snap");
});
