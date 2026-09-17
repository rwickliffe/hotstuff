import assert from "node:assert/strict";
import test from "node:test";

import { cacheControlForChicago, chicagoCalendarDay, htmlCacheKey } from "../src/lib/cache-headers.ts";
import { parseDay } from "../src/lib/data.js";

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

test("htmlCacheKey keeps / and /products, strips query, skips debug", () => {
  const origin = "https://hotstuff.example";
  const key = (path) => htmlCacheKey(new Request(origin + path));
  assert.equal(key("/")?.url, origin + "/");
  assert.equal(key("/?ask=Chow%20Chow")?.url, origin + "/");
  assert.equal(key("/products")?.url, origin + "/products");
  assert.equal(key("/products?debug"), null);
  assert.equal(key("/?debug=1"), null);
  assert.equal(key("/data"), null);
  assert.equal(htmlCacheKey(new Request(origin + "/", { method: "POST" })), null);
});

test("Chicago's calendar day is still the 16th at 23:59 CDT", () => {
  // 23:59:59 CDT 16 Sep = 04:59:59 UTC 17 Sep. UTC midnight would already
  // have dropped a 16 Sep market.
  const now = new Date("2026-09-17T04:59:59.000Z");
  assert.equal(chicagoCalendarDay(now), "2026-09-16");
  const today = parseDay(chicagoCalendarDay(now));
  const market = parseDay("2026-09-16");
  assert.ok(today && market && market >= today);
});

test("Chicago midnight is a new calendar day", () => {
  assert.equal(
    chicagoCalendarDay(new Date("2026-09-17T05:00:00.000Z")),
    "2026-09-17"
  );
});

