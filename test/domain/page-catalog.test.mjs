import assert from "node:assert/strict";
import test from "node:test";

import { catalogForPage } from "../../src/domain/page-catalog.ts";
import { emptyCatalog } from "../../src/worker/catalog.ts";

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
