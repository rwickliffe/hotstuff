import assert from "node:assert/strict";
import test from "node:test";

import { DATA_AGE_STALE_MS, dataAge } from "../../src/domain/data-age.ts";

const now = Date.parse("2026-09-15T18:00:00Z");
const agoHours = (h) => new Date(now - h * 60 * 60 * 1000).toISOString();

test("no timestamp is not old data", () => {
  assert.deepEqual(dataAge(null, now), { stale: false, hours: 0 });
  assert.deepEqual(dataAge("not a date", now), { stale: false, hours: 0 });
});

test("a recent fetch is not stale", () => {
  assert.equal(dataAge(agoHours(1), now).stale, false);
});

test("past the window it is stale, and names the rounded hours", () => {
  const old = dataAge(agoHours(8), now);
  assert.equal(old.stale, true);
  assert.equal(old.hours, 8);
});

test("the boundary itself counts as stale", () => {
  const exact = new Date(now - DATA_AGE_STALE_MS).toISOString();
  assert.equal(dataAge(exact, now).stale, true);
});
