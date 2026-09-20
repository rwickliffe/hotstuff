import assert from "node:assert/strict";
import test from "node:test";

import { debugSources, isDebug } from "../../src/domain/debug.ts";
import { DEBUG_PARAM } from "../../src/site-config.ts";

test("isDebug reads the configured param, not a hardcoded name", () => {
  const at = (query) => isDebug(new URL("https://hotstuff.example/" + query));
  assert.equal(at(""), false);
  assert.equal(at("?" + DEBUG_PARAM), true);
  assert.equal(at("?" + DEBUG_PARAM + "=1"), true);
  assert.equal(at("?ask=Chow%20Chow"), false);
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
