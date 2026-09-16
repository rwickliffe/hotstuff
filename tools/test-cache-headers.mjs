import assert from "node:assert/strict";
import test from "node:test";

import { cacheControlForChicago } from "../src/lib/cache-headers.ts";

// 16 Sep 2026 is CDT (UTC-5). Times below are wall-clock Chicago.

test("noon Chicago is a flat hour", () => {
  // 12:00:00 CDT
  assert.equal(
    cacheControlForChicago(new Date("2026-09-16T17:00:00.000Z")),
    "public, max-age=3600"
  );
});

test("the last hour of the day clamps to midnight, not the hour", () => {
  // 23:59:01 CDT → 59 seconds until midnight
  assert.equal(
    cacheControlForChicago(new Date("2026-09-17T04:59:01.000Z")),
    "public, max-age=59"
  );
});

test("the last second of the day still caches for one second", () => {
  // 23:59:59 CDT
  assert.equal(
    cacheControlForChicago(new Date("2026-09-17T04:59:59.000Z")),
    "public, max-age=1"
  );
});
