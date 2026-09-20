import assert from "node:assert/strict";
import test from "node:test";

import {
  catalogDataAgeNotice,
  catalogForPage,
} from "../../src/domain/page-catalog.ts";
import { emptyCatalog } from "../../src/worker/catalog.ts";

test("catalogDataAgeNotice hides fresh fetches and names stale hours", () => {
  const now = Date.parse("2026-09-15T18:00:00Z");
  assert.equal(catalogDataAgeNotice(null, now).hidden, true);
  assert.equal(catalogDataAgeNotice("2026-09-15T17:00:00Z", now).hidden, true);
  const stale = catalogDataAgeNotice("2026-09-15T10:00:00Z", now);
  assert.equal(stale.hidden, false);
  assert.match(stale.text, /8 hours/);
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
