import assert from "node:assert/strict";
import test from "node:test";

import { timingSafeEqual } from "../../src/worker/crypto.ts";

test("timingSafeEqual compares content without leaking length", async () => {
  assert.equal(await timingSafeEqual("same", "same"), true);
  assert.equal(await timingSafeEqual("same", "sAme"), false);
  assert.equal(await timingSafeEqual("short", "longer"), false);
  assert.equal(await timingSafeEqual("", "password"), false);
  assert.equal(await timingSafeEqual("pass", "password"), false);
});
