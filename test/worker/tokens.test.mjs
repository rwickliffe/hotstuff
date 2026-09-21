import assert from "node:assert/strict";
import test from "node:test";

import {
  CONFIRM_TTL_MS,
  makeToken,
  verifyToken,
} from "../../src/worker/tokens.ts";

test("confirmation tokens verify, expire, and reject tampering", async () => {
  assert.equal(CONFIRM_TTL_MS, 60 * 60 * 1000);
  const secret = "test secret";
  const email = "person@example.com";
  const token = await makeToken(email, Date.now() + 60_000, secret);
  assert.equal(await verifyToken(token, secret), email);

  // Tamper with the FIRST character of the signature, not the last. A
  // 32-byte HMAC is 43 base64url chars, so the final char carries only 4
  // meaningful bits and its low 2 are discarded - A, B, C and D all decode
  // identically there, and flipping between them is a no-op the token
  // survives. The first char carries a full 6 bits.
  const [body, sig] = token.split(".");
  const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
  assert.equal(await verifyToken(body + "." + flipped, secret), null);
  assert.equal(
    await verifyToken(await makeToken(email, Date.now() - 1, secret), secret),
    null,
  );
  assert.equal(await verifyToken("not-a-token", secret), null);
  assert.equal(await verifyToken("bm90LWFuLWVtYWls.*", secret), null);
});
