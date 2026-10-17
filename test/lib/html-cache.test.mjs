import assert from "node:assert/strict";
import test from "node:test";

import {
  cacheablePath,
  dailyCacheControl,
  htmlCacheKey,
} from "../../src/lib/html-cache.ts";
import {
  CACHEABLE_PATHS,
  DEBUG_PARAM,
  MARKET_TZ,
} from "../../src/site-config.ts";

// 16 Sep 2026 is CDT (UTC-5). Times below are wall-clock in MARKET_TZ.

test("noon is a flat hour", () => {
  assert.equal(
    dailyCacheControl(new Date("2026-09-16T17:00:00.000Z"), MARKET_TZ),
    "public, max-age=3600",
  );
});

test("the last hour of the day clamps to midnight, not the hour", () => {
  assert.equal(
    dailyCacheControl(new Date("2026-09-17T04:59:01.000Z"), MARKET_TZ),
    "public, max-age=59",
  );
});

test("the last second of the day still caches for one second", () => {
  assert.equal(
    dailyCacheControl(new Date("2026-09-17T04:59:59.000Z"), MARKET_TZ),
    "public, max-age=1",
  );
});

test("cacheablePath keeps cacheable paths and skips the debug param", () => {
  const origin = "https://hotstuff.example";
  const at = (path, init) =>
    cacheablePath(
      new Request(origin + path, init),
      CACHEABLE_PATHS,
      DEBUG_PARAM,
    );
  assert.equal(at("/"), "/");
  assert.equal(at("/?ask=Chow%20Chow"), "/");
  assert.equal(at("/products"), "/products");
  assert.equal(at("/products/"), "/products");
  assert.equal(at("/products?debug"), null);
  assert.equal(at("/?debug=1"), null);
  assert.equal(at("/data"), null);
  assert.equal(at("/", { method: "POST" }), null);
});

test("a trailing slash in the configured path still matches", () => {
  assert.equal(
    cacheablePath(
      new Request("https://hotstuff.example/products"),
      ["/products/"],
      DEBUG_PARAM,
    ),
    "/products",
  );
});

test("the key carries the version, so a refresh retires the old entry", () => {
  const origin = "https://hotstuff.example";
  const before = htmlCacheKey(origin, "/", "2026-09-19T10:13:00.000Z");
  const after = htmlCacheKey(origin, "/", "2026-09-19T11:13:00.000Z");
  assert.notEqual(before.url, after.url);
  assert.equal(before.url, origin + "/?v=2026-09-19T10%3A13%3A00.000Z");
  // Same generation, same key: that is what makes a hit possible at all.
  assert.equal(
    htmlCacheKey(origin, "/", "same").url,
    htmlCacheKey(origin, "/", "same").url,
  );
  // Pages are still separate entries within one generation.
  assert.notEqual(
    htmlCacheKey(origin, "/", "same").url,
    htmlCacheKey(origin, "/products", "same").url,
  );
});
