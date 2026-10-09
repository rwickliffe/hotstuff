import assert from "node:assert/strict";
import test from "node:test";

import { debugSources, isDebug } from "../../src/domain/debug.ts";
import { DEBUG_PARAM } from "../../src/site-config.ts";

const at = (d, name) => d.sheets.find((s) => s.name === name);

test("isDebug reads the configured param, not a hardcoded name", () => {
  const flag = (query) => isDebug(new URL("https://hotstuff.example/" + query));
  assert.equal(flag(""), false);
  assert.equal(flag("?" + DEBUG_PARAM), true);
  assert.equal(flag("?" + DEBUG_PARAM + "=1"), true);
  assert.equal(flag("?ask=Chow%20Chow"), false);
});

test("debugSources reports live KV row counts and lastError", () => {
  const d = debugSources({
    products: [{ name: "A" }, { name: "B" }],
    events: [],
    announcements: [],
    videos: [],
    fetchedAt: "2026-09-15T12:00:00Z",
    lastError: { events: "too large", announcements: "http 404" },
  });
  assert.equal(at(d, "products").state, "live KV");
  assert.equal(at(d, "products").rows, 2);
  assert.equal(at(d, "events").state, "empty");
  assert.match(at(d, "events").note, /lastError: too large/);
  assert.equal(at(d, "announcements").state, "empty");
  assert.match(at(d, "announcements").note, /lastError: http 404/);
  assert.match(at(d, "products").note, /fetchedAt 2026-09-15T12:00:00Z/);
});

test("debugSources names snapshot when KV was empty", () => {
  const d = debugSources(
    {
      products: [{ name: "A" }],
      events: [{ name: "M" }],
      announcements: [{ headline: "H" }],
      videos: [{ title: "V" }],
      fetchedAt: null,
      lastError: null,
    },
    "snapshot",
  );
  for (const name of ["products", "events", "announcements", "videos"]) {
    assert.equal(at(d, name).state, "snapshot", name);
  }
});

// The panel is built from the catalog's own sheet list, so this is what stops
// a newly added sheet from being invisible in ?debug.
test("every catalog sheet gets a row, in catalog order", () => {
  const d = debugSources({
    products: [],
    events: [],
    announcements: [],
    videos: [],
    fetchedAt: null,
    lastError: null,
  });
  assert.deepEqual(
    d.sheets.map((s) => s.name),
    ["products", "events", "announcements", "videos"],
  );
  assert.equal(d.worker.state, "same-origin");
});

test("a sheet missing from an older snapshot reads as empty, not a crash", () => {
  const d = debugSources({
    products: [{ name: "A" }],
    events: [],
    fetchedAt: null,
    lastError: null,
  });
  assert.equal(at(d, "videos").state, "empty");
  assert.equal(at(d, "videos").rows, 0);
});
