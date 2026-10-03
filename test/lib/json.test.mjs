import assert from "node:assert/strict";
import test from "node:test";

import { json, readJson } from "../../src/lib/json.ts";

const post = (body, headers = {}) =>
  new Request("https://hotstuff.example/x", { method: "POST", body, headers });

test("json carries the status and the object", async () => {
  const r = json({ ok: false, reason: "bad" }, 400);
  assert.equal(r.status, 400);
  assert.equal(r.headers.get("Content-Type"), "application/json");
  assert.deepEqual(await r.json(), { ok: false, reason: "bad" });
});

test("a body within the cap parses", async () => {
  const parsed = await readJson(post(JSON.stringify({ t: "token" })), 100);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.data, { t: "token" });
});

test("an oversized body is refused before it is read", async () => {
  // Content-Length only: the body itself is small, so a refusal here proves
  // the header was believed rather than the text measured.
  const parsed = await readJson(post("{}", { "Content-Length": "9999" }), 100);
  assert.deepEqual(parsed, { ok: false, reason: "size" });
});

test("an oversized body is still refused without a Content-Length", async () => {
  const parsed = await readJson(
    post(JSON.stringify({ t: "x".repeat(200) })),
    100,
  );
  assert.deepEqual(parsed, { ok: false, reason: "size" });
});

test("a body that is not JSON is refused as bad, not as a crash", async () => {
  const parsed = await readJson(post("not json at all"), 100);
  assert.deepEqual(parsed, { ok: false, reason: "bad" });
});

test("JSON that is not an object is bad, not a body", async () => {
  // Each of these parses. None of them is something a caller can read fields
  // off: `null.name` throws, and an array's named fields are always absent.
  for (const body of ["null", "[]", "5", '"a string"']) {
    assert.deepEqual(
      await readJson(post(body), 100),
      { ok: false, reason: "bad" },
      body,
    );
  }
});

test("an empty body is bad rather than an empty object", async () => {
  const parsed = await readJson(post(""), 100);
  assert.deepEqual(parsed, { ok: false, reason: "bad" });
});
