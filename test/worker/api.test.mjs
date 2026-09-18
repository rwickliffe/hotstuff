import assert from "node:assert/strict";
import test from "node:test";

import worker from "../../src/worker/api.ts";
import {
  CONFIRM_TTL_MS,
  MAX_BODY,
  MAX_SEND_BODY,
  emailOk,
  esc,
  makeToken,
  timingSafeEqual,
  verifyToken,
} from "../../src/worker/mail-helpers.ts";

const limiter = { limit: async () => ({ success: true }) };

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

test("esc covers all HTML-sensitive characters", () => {
  assert.equal(esc(`<a title="'">&`), "&lt;a title=&quot;&#39;&quot;&gt;&amp;");
});

test("timingSafeEqual compares content without leaking length", async () => {
  assert.equal(await timingSafeEqual("same", "same"), true);
  assert.equal(await timingSafeEqual("same", "sAme"), false);
  assert.equal(await timingSafeEqual("short", "longer"), false);
  assert.equal(await timingSafeEqual("", "password"), false);
  assert.equal(await timingSafeEqual("pass", "password"), false);
});

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
      BROADCAST_POSTAL_ADDRESS: "PO Box 1",
      BROADCAST_PASSWORD: "secret",
      RESEND_SEGMENT_ID: "segment",
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

test("/send refuses when BROADCAST_PASSWORD was never set", async () => {
  let sends = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    sends++;
    return new Response(JSON.stringify({ id: "ok" }), { status: 200 });
  };

  try {
    // postal address configured but the password secret missing is a real
    // setup ordering: the PO box arrives before anyone runs `wrangler secret`.
    const env = {
      SEND_IP: limiter,
      BROADCAST_POSTAL_ADDRESS: "PO Box 1",
      RESEND_SEGMENT_ID: "segment",
      RESEND_FROM: "Hot Stuff <test@example.com>",
      RESEND_API_KEY: "key",
    };
    for (const password of ["", "anything"]) {
      const req = new Request("https://worker.test/send", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ password, subject: "Test", body: "Hello." }),
      });
      const res = await worker.fetch(req, env);
      assert.equal(res.status, 401, `password ${JSON.stringify(password)}`);
      assert.equal((await res.json()).reason, "auth");
    }
    assert.equal(sends, 0, "no broadcast may be dispatched");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("contact records metrics after a successful send", async () => {
  const points = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ id: "ok" }), { status: 200 });

  try {
    const env = {
      MAIL_IP: limiter,
      MAIL_EMAIL: limiter,
      CONTACT_TO: "paula@example.com",
      RESEND_FROM: "Hot Stuff <test@example.com>",
      RESEND_API_KEY: "key",
      METRICS: {
        writeDataPoint(p) {
          points.push(p);
        },
      },
    };
    const req = new Request("https://worker.test/contact", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        name: "Pat",
        email: "pat@example.com",
        message: 'Is "Chow Chow" coming back?',
        ask: "Chow Chow",
        company: "",
      }),
    });
    assert.equal((await worker.fetch(req, env)).status, 200);
    assert.equal(points.length, 2);
    assert.deepEqual(points[0].blobs, ["contact", ""]);
    assert.deepEqual(points[1].blobs, ["ask", "Chow Chow"]);

    points.length = 0;
    const plain = new Request("https://worker.test/contact", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        name: "Pat",
        email: "other@example.com",
        message: "Just saying hi.",
        company: "",
      }),
    });
    assert.equal((await worker.fetch(plain, env)).status, 200);
    assert.equal(points.length, 1);
    assert.deepEqual(points[0].blobs, ["contact", ""]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("subscribe records a metric after a successful confirm mail", async () => {
  const points = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ id: "ok" }), { status: 200 });

  try {
    const env = {
      MAIL_IP: limiter,
      MAIL_EMAIL: limiter,
      SUBSCRIBE_SIGNING_KEY: "test secret",
      RESEND_FROM: "Hot Stuff <test@example.com>",
      RESEND_API_KEY: "key",
      METRICS: {
        writeDataPoint(p) {
          points.push(p);
        },
      },
    };
    const req = new Request("https://worker.test/subscribe", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ email: "pat@example.com", company: "" }),
    });
    assert.equal((await worker.fetch(req, env)).status, 200);
    assert.equal(points.length, 1);
    assert.deepEqual(points[0].blobs, ["subscribe", ""]);
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
      SUBSCRIBE_SIGNING_KEY: secret,
      RESEND_API_KEY: "key",
      RESEND_SEGMENT_ID: "segment",
    });

    assert.equal(res.status, 200);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, "https://api.resend.com/contacts");
    assert.equal(calls[1].method, "POST");
    assert.equal(
      calls[1].url,
      "https://api.resend.com/contacts/person%40example.com/segments/segment",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
