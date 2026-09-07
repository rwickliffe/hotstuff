import assert from "node:assert/strict";
import test from "node:test";

import worker, {
  CONFIRM_TTL_MS,
  MAX_BODY,
  MAX_SEND_BODY,
  emailOk,
  esc,
  makeToken,
  timingSafeEqual,
  verifyToken,
} from "./src/worker.js";

const limiter = { limit: async () => ({ success: true }) };

test("emailOk accepts normal addresses and rejects unsafe or invalid ones", () => {
  for (const email of [
    "o'brien@example.ie",
    "x+tag@sub.example.co",
    "first.last@example.com",
  ]) assert.equal(emailOk(email), true, email);

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
  ]) assert.equal(emailOk(email), false, email);
});

test("esc covers all HTML-sensitive characters", () => {
  assert.equal(
    esc(`<a title="'">&`),
    "&lt;a title=&quot;&#39;&quot;&gt;&amp;"
  );
});

test("timingSafeEqual compares content and length", () => {
  assert.equal(timingSafeEqual("same", "same"), true);
  assert.equal(timingSafeEqual("same", "sAme"), false);
  assert.equal(timingSafeEqual("short", "longer"), false);
  assert.equal(timingSafeEqual("", "password"), false);
  assert.equal(timingSafeEqual("pass", "password"), false);
});

test("confirmation tokens verify, expire, and reject tampering", async () => {
  assert.equal(CONFIRM_TTL_MS, 60 * 60 * 1000);
  const secret = "test secret";
  const email = "person@example.com";
  const token = await makeToken(email, Date.now() + 60_000, secret);
  assert.equal(await verifyToken(token, secret), email);

  const replacement = token.endsWith("A") ? "B" : "A";
  assert.equal(await verifyToken(token.slice(0, -1) + replacement, secret), null);
  assert.equal(
    await verifyToken(await makeToken(email, Date.now() - 1, secret), secret),
    null
  );
  assert.equal(await verifyToken("not-a-token", secret), null);
  assert.equal(await verifyToken("bm90LWFuLWVtYWls.*", secret), null);
});

test("contact and broadcast routes enforce their own body caps", async () => {
  let fetches = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetches++;
    return new Response(JSON.stringify({ id: "ok" }), { status: 200 });
  };

  try {
    const tooLargeContact = new Request("https://worker.test/contact", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "x".repeat(MAX_BODY + 1),
    });
    assert.equal((await worker.fetch(tooLargeContact, {})).status, 413);
    assert.equal(fetches, 0);

    const body = "x\n".repeat(4000);
    assert.equal(body.length, 8000);
    const validBroadcast = new Request("https://worker.test/send", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        password: "secret",
        subject: "Test",
        body,
      }),
    });
    const env = {
      SEND_IP: limiter,
      MAIL_POSTAL_ADDRESS: "PO Box 1",
      COMPOSE_PASSWORD: "secret",
      RESEND_AUDIENCE_ID: "segment",
      RESEND_FROM: "Hot Stuff <test@example.com>",
      RESEND_API_KEY: "key",
    };
    assert.equal((await worker.fetch(validBroadcast, env)).status, 200);
    assert.equal(fetches, 1);

    const tooLargeBroadcast = new Request("https://worker.test/send", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "x".repeat(MAX_SEND_BODY + 1),
    });
    assert.equal((await worker.fetch(tooLargeBroadcast, env)).status, 413);
    assert.equal(fetches, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("existing contacts are added to the Segment without an update", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init.method });
    return new Response("", { status: 409 });
  };

  try {
    const secret = "test secret";
    const email = "person@example.com";
    const token = await makeToken(email, Date.now() + 60_000, secret);
    const req = new Request("https://worker.test/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t: token }),
    });
    const res = await worker.fetch(req, {
      MAIL_IP: limiter,
      CONFIRM_SECRET: secret,
      RESEND_API_KEY: "key",
      RESEND_AUDIENCE_ID: "segment",
    });

    assert.equal(res.status, 200);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, "https://api.resend.com/contacts");
    assert.equal(calls[1].method, "POST");
    assert.equal(
      calls[1].url,
      "https://api.resend.com/contacts/person%40example.com/segments/segment"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
