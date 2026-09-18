import assert from "node:assert/strict";
import test from "node:test";

import { dailyCacheControl, htmlCacheKey } from "../../src/lib/html-cache.ts";
import { CACHEABLE_PATHS, DEBUG_PARAM, MARKET_TZ } from "../../src/site-config.ts";

// 16 Sep 2026 is CDT (UTC-5). Times below are wall-clock in MARKET_TZ.

test("noon is a flat hour", () => {
  assert.equal(
    dailyCacheControl(new Date("2026-09-16T17:00:00.000Z"), MARKET_TZ),
    "public, max-age=3600"
  );
});

test("the last hour of the day clamps to midnight, not the hour", () => {
  assert.equal(
    dailyCacheControl(new Date("2026-09-17T04:59:01.000Z"), MARKET_TZ),
    "public, max-age=59"
  );
});

test("the last second of the day still caches for one second", () => {
  assert.equal(
    dailyCacheControl(new Date("2026-09-17T04:59:59.000Z"), MARKET_TZ),
    "public, max-age=1"
  );
});

test("htmlCacheKey keeps cacheable paths, strips query, skips the debug param", () => {
  const origin = "https://hotstuff.example";
  const key = (path) => htmlCacheKey(new Request(origin + path), CACHEABLE_PATHS, DEBUG_PARAM);
  assert.equal(key("/")?.url, origin + "/");
  assert.equal(key("/?ask=Chow%20Chow")?.url, origin + "/");
  assert.equal(key("/products")?.url, origin + "/products");
  assert.equal(
    htmlCacheKey(new Request(origin + "/products"), ["/products/"], DEBUG_PARAM)?.url,
    origin + "/products"
  );
  assert.equal(key("/products?debug"), null);
  assert.equal(key("/?debug=1"), null);
  assert.equal(key("/data"), null);
  assert.equal(
    htmlCacheKey(new Request(origin + "/", { method: "POST" }), CACHEABLE_PATHS, DEBUG_PARAM),
    null
  );
});
