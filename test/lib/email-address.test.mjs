import assert from "node:assert/strict";
import test from "node:test";

import { emailOk } from "../../src/lib/email-address.ts";

test("emailOk accepts normal addresses and rejects unsafe or invalid ones", () => {
  for (const email of [
    "o'brien@example.ie",
    "x+tag@sub.example.co",
    "first.last@example.com",
  ])
    assert.equal(emailOk(email), true, email);

  for (const email of [
    "a,b@c.co",
    'a"b@c.co',
    "a;b@c.co",
    "a<b@c.co",
    "a\nBcc:x@c.co",
    "a@-b.co",
    "a@b-.co",
    "a@b",
    "a@@b.co",
  ])
    assert.equal(emailOk(email), false, email);
});
