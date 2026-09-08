// Hot Stuff mail Worker. Secrets stay in the dashboard, not this file.
// CORS allowlist is not access control: a text/plain POST is sent regardless
// of origin. Honeypot, rate limits, email-shape, size caps, and the compose
// password are the actual controls.

const ALLOW = [
  "http://localhost:8765",
  "https://rwickliffe.github.io",
];

const MAX_BODY = 8192;
const MAX_SEND_BODY = 65536;
const MAX_NAME = 100;
const MAX_EMAIL = 254;
const MAX_MSG = 2000;
const MAX_SUBJECT = 200;
const MAX_BROADCAST = 8000;
const CONFIRM_TTL_MS = 60 * 60 * 1000;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (req.method === "OPTIONS") {
      return cors(req, new Response(null, { status: 204 }));
    }

    try {
      if (path === "/contact" && req.method === "POST") return cors(req, await contact(req, env));
      if (path === "/subscribe" && req.method === "POST") return cors(req, await subscribe(req, env));
      if (path === "/confirm" && req.method === "GET") return confirmGet(url, env);
      if (path === "/confirm" && req.method === "POST") return confirmPost(req, env);
      if (path === "/compose" && req.method === "GET") return composePage(env);
      if (path === "/send" && req.method === "POST") return sendBroadcast(req, env);
      return new Response("Not found", { status: 404 });
    } catch (e) {
      return cors(req, json({ ok: false, reason: "down" }, 502));
    }
  },
};

function cors(req, res) {
  const origin = req.headers.get("Origin") || "";
  const headers = new Headers(res.headers);
  if (ALLOW.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(res.body, { status: res.status, headers });
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function html(body, status) {
  return new Response(body, {
    status: status || 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function ipOf(req) {
  return req.headers.get("CF-Connecting-IP") || "unknown";
}

async function limited(env, binding, key) {
  const { success } = await env[binding].limit({ key });
  return success;
}

function emailOk(s) {
  if (typeof s !== "string") return false;
  const e = s.trim().toLowerCase();
  if (e.length < 5 || e.length > MAX_EMAIL) return false;
  if (e.includes("..")) return false;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(e)) return false;
  return e.slice(e.lastIndexOf("@") + 1).split(".")
    .every((label) => !label.startsWith("-") && !label.endsWith("-"));
}

async function readJson(req, maxBody = MAX_BODY) {
  const len = Number(req.headers.get("Content-Length") || "0");
  if (len > maxBody) return { err: json({ ok: false, reason: "size" }, 413) };
  const text = await req.text();
  if (text.length > maxBody) return { err: json({ ok: false, reason: "size" }, 413) };
  try {
    return { data: JSON.parse(text) };
  } catch {
    return { err: json({ ok: false, reason: "bad" }, 400) };
  }
}

function honeypot(data) {
  return !!(data && (data.company || data.website));
}

async function resendSend(env, payload) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.RESEND_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (r.status === 429) return { reason: "quota" };
  if (!r.ok) return { reason: "down" };
  return { ok: true };
}

function resendFail(reason) {
  if (reason === "quota") return json({ ok: false, reason: "quota" }, 429);
  return json({ ok: false, reason: "down" }, 502);
}

async function contact(req, env) {
  const parsed = await readJson(req);
  if (parsed.err) return parsed.err;
  const data = parsed.data || {};
  if (honeypot(data)) return json({ ok: true }, 200);

  const name = String(data.name || "").trim();
  const email = String(data.email || "").trim().toLowerCase();
  const message = String(data.message || "").trim();
  if (!name || name.length > MAX_NAME) return json({ ok: false, reason: "bad" }, 400);
  if (!emailOk(email)) return json({ ok: false, reason: "bad" }, 400);
  if (!message || message.length > MAX_MSG) return json({ ok: false, reason: "bad" }, 400);

  if (!(await limited(env, "MAIL_IP", "contact:" + ipOf(req)))) {
    return json({ ok: false, reason: "rate" }, 429);
  }
  if (!(await limited(env, "MAIL_EMAIL", "contact:" + email))) {
    return json({ ok: false, reason: "rate" }, 429);
  }

  const result = await resendSend(env, {
    from: env.RESEND_FROM,
    to: [env.CONTACT_TO],
    reply_to: email,
    subject: "Hot Stuff note from " + name,
    text: "From: " + name + " <" + email + ">\n\n" + message,
  });
  if (!result.ok) return resendFail(result.reason);
  return json({ ok: true }, 200);
}

async function subscribe(req, env) {
  const parsed = await readJson(req);
  if (parsed.err) return parsed.err;
  const data = parsed.data || {};
  if (honeypot(data)) return json({ ok: true }, 200);

  const email = String(data.email || "").trim().toLowerCase();
  if (!emailOk(email)) return json({ ok: false, reason: "bad" }, 400);

  if (!(await limited(env, "MAIL_IP", "sub:" + ipOf(req)))) {
    return json({ ok: false, reason: "rate" }, 429);
  }
  if (!(await limited(env, "MAIL_EMAIL", "sub:" + email))) {
    return json({ ok: false, reason: "rate" }, 429);
  }

  const exp = Date.now() + CONFIRM_TTL_MS;
  const token = await makeToken(email, exp, env.SUBSCRIBE_SIGNING_KEY);
  const link = new URL(req.url);
  link.pathname = "/confirm";
  link.search = "t=" + encodeURIComponent(token);

  const result = await resendSend(env, {
    from: env.RESEND_FROM,
    to: [email],
    subject: "Confirm you're on The list",
    text:
      "Click to join Paula and Crazy John's list:\n\n" +
      link.toString() +
      "\n\n" +
      "It may be a while before you hear from us. We write when there is " +
      "something to say, and the first letter waits until we have a PO box " +
      "we can print.\n\n" +
      "If you did not ask for this, ignore it.",
  });
  if (!result.ok) return resendFail(result.reason);
  return json({ ok: true }, 200);
}

async function confirmGet(url, env) {
  const token = url.searchParams.get("t") || "";
  const email = await verifyToken(token, env.SUBSCRIBE_SIGNING_KEY);
  if (!email) {
    return html(thinPage("That link is dead", "<p>Ask again from the site if you still want on the list.</p>"), 400);
  }
  return html(thinPage(
    "One more click",
    "<p>Confirm you want on The list. Prefetchers stop here.</p>" +
      "<form method=\"POST\" action=\"/confirm\">" +
      "<input type=\"hidden\" name=\"t\" value=\"" + esc(token) + "\">" +
      "<button type=\"submit\">Put me on the list</button>" +
      "</form>" +
      "<p class=\"muted\">It may be a while before you hear from us.</p>"
  ));
}

async function confirmPost(req, env) {
  let token = "";
  const ct = req.headers.get("Content-Type") || "";
  if (ct.includes("application/x-www-form-urlencoded")) {
    const body = await req.text();
    if (body.length > MAX_BODY) return html(thinPage("Too big", ""), 413);
    token = new URLSearchParams(body).get("t") || "";
  } else {
    const parsed = await readJson(req);
    if (parsed.err) return parsed.err;
    token = String((parsed.data && parsed.data.t) || "");
  }

  const email = await verifyToken(token, env.SUBSCRIBE_SIGNING_KEY);
  if (!email) {
    return html(thinPage("That link is dead", "<p>Ask again from the site if you still want on the list.</p>"), 400);
  }

  if (!(await limited(env, "MAIL_IP", "confirm:" + ipOf(req)))) {
    return html(thinPage("Slow down", "<p>Try again in a minute.</p>"), 429);
  }

  // A Segment is a group of Contacts inside an Audience. Broadcasts target a
  // Segment, so a Segment id is what this needs, not the Audience itself.
  const r = await fetch("https://api.resend.com/contacts", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.RESEND_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      segments: [{ id: env.RESEND_SEGMENT_ID }],
    }),
  });

  if (r.status === 429) return html(thinPage("Mail is capped today", "<p>Try again tomorrow.</p>"), 429);
  if (r.status === 409) {
    // Existing global contacts still need adding to this Segment. This does
    // not change their global unsubscribe state if an old link is replayed.
    const add = await fetch(
      "https://api.resend.com/contacts/" + encodeURIComponent(email) +
        "/segments/" + encodeURIComponent(env.RESEND_SEGMENT_ID),
      {
        method: "POST",
        headers: { Authorization: "Bearer " + env.RESEND_API_KEY },
      }
    );
    if (add.status === 429) return html(thinPage("Mail is capped today", "<p>Try again tomorrow.</p>"), 429);
    if (!add.ok && add.status !== 409) {
      return html(thinPage("Could not join", "<p>Try again later.</p>"), 502);
    }
  } else if (!r.ok) {
    return html(thinPage("Could not join", "<p>Try again later.</p>"), 502);
  }

  return html(thinPage(
    "You're on the list",
    "<p>We'll write when there is something to say. It may be a while — " +
      "the first letter waits on a PO box we can print.</p>"
  ));
}

function composePage(env) {
  const ready = !!(env.BROADCAST_POSTAL_ADDRESS && String(env.BROADCAST_POSTAL_ADDRESS).trim());
  const gate = ready
    ? "<p class=\"muted\">Broadcasts go to the whole list. Preview only until you hit send.</p>"
    : "<p class=\"warn\">Broadcasts are off until BROADCAST_POSTAL_ADDRESS is set (a PO box you will print).</p>";
  return html(thinPage(
    "Compose",
    gate +
      "<form id=\"f\">" +
      "<label>Password <input type=\"password\" name=\"password\" required autocomplete=\"current-password\"></label>" +
      "<label>Subject <input name=\"subject\" required maxlength=\"" + MAX_SUBJECT + "\"></label>" +
      "<label>Body <textarea name=\"body\" rows=\"12\" required maxlength=\"" + MAX_BROADCAST + "\"></textarea></label>" +
      "<button type=\"submit\"" + (ready ? "" : " disabled") + ">Send</button>" +
      "<p id=\"status\" role=\"status\" aria-live=\"polite\"></p>" +
      "</form>" +
      "<script>" +
      "document.getElementById('f').addEventListener('submit', async function (e) {" +
      "e.preventDefault();" +
      "var s = document.getElementById('status');" +
      "s.textContent = 'Sending…';" +
      "var fd = new FormData(e.target);" +
      "var body = JSON.stringify({ password: fd.get('password'), subject: fd.get('subject'), body: fd.get('body') });" +
      "try {" +
      "var r = await fetch('/send', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: body });" +
      "var j = await r.json().catch(function () { return {}; });" +
      "s.textContent = j.ok ? 'Sent.' : (j.reason === 'postal' ? 'Need a postal address first.' :" +
      "j.reason === 'auth' ? 'Wrong password.' : j.reason === 'rate' ? 'Slow down.' :" +
      "j.reason === 'quota' ? 'Resend daily cap.' : j.reason === 'size' ? 'Message is too long.' : 'Could not send.');" +
      "} catch (err) { s.textContent = 'Could not reach the Worker.'; }" +
      "});" +
      "</script>"
  ));
}

async function sendBroadcast(req, env) {
  if (!(await limited(env, "SEND_IP", "send:" + ipOf(req)))) {
    return json({ ok: false, reason: "rate" }, 429);
  }

  const postal = String(env.BROADCAST_POSTAL_ADDRESS || "").trim();
  if (!postal) return json({ ok: false, reason: "postal" }, 403);

  const parsed = await readJson(req, MAX_SEND_BODY);
  if (parsed.err) return parsed.err;
  const data = parsed.data || {};
  const password = String(data.password || "");
  const subject = String(data.subject || "").trim();
  const body = String(data.body || "").trim();

  // An unset secret leaves both sides empty, and two empty strings compare
  // equal, so without this an empty password would authenticate a broadcast.
  const expected = String(env.BROADCAST_PASSWORD || "");
  if (!expected || !timingSafeEqual(password, expected)) {
    return json({ ok: false, reason: "auth" }, 401);
  }
  if (!subject || subject.length > MAX_SUBJECT) return json({ ok: false, reason: "bad" }, 400);
  if (!body || body.length > MAX_BROADCAST) return json({ ok: false, reason: "bad" }, 400);

  const htmlBody =
    '<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#14100C;background:#E5DCC9;padding:28px">' +
    "<p style=\"font-family:'Courier New',monospace;letter-spacing:.05em;text-transform:uppercase;color:#8E1409;font-size:13px\">Paula and Crazy John's Hot Stuff</p>" +
    "<div style=\"white-space:pre-wrap;line-height:1.55\">" + esc(body) + "</div>" +
    "<p style=\"margin-top:28px;font-size:13px;color:#574C3E\">" + esc(postal) + "</p>" +
    '<p style="font-size:13px"><a href="{{{RESEND_UNSUBSCRIBE_URL}}}">Unsubscribe</a></p>' +
    "</div>";

  const r = await fetch("https://api.resend.com/broadcasts", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.RESEND_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      segment_id: env.RESEND_SEGMENT_ID,
      from: env.RESEND_FROM,
      subject,
      html: htmlBody,
      send: true,
    }),
  });

  if (r.status === 429) return json({ ok: false, reason: "quota" }, 429);
  if (!r.ok) return json({ ok: false, reason: "down" }, 502);
  return json({ ok: true }, 200);
}

function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const aa = enc.encode(a);
  const bb = enc.encode(b);
  if (aa.length !== bb.length) return false;
  let out = 0;
  for (let i = 0; i < aa.length; i++) out |= aa[i] ^ bb[i];
  return out === 0;
}

function b64url(bytes) {
  let s = "";
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function makeToken(email, exp, secret) {
  const payload = email + "|" + exp;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return b64url(new TextEncoder().encode(payload)) + "." + b64url(sig);
}

async function verifyToken(token, secret) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  let payload, ok;
  try {
    payload = new TextDecoder().decode(fromB64url(parts[0]));
    const key = await hmacKey(secret);
    ok = await crypto.subtle.verify(
      "HMAC",
      key,
      fromB64url(parts[1]),
      new TextEncoder().encode(payload)
    );
  } catch {
    return null;
  }
  if (!ok) return null;
  const bar = payload.lastIndexOf("|");
  if (bar < 1) return null;
  const email = payload.slice(0, bar);
  const exp = Number(payload.slice(bar + 1));
  if (!emailOk(email) || !Number.isFinite(exp) || Date.now() > exp) return null;
  return email;
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function thinPage(title, inner) {
  return "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
    "<title>" + esc(title) + " · Hot Stuff</title>" +
    "<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Special+Elite&family=Barlow:wght@400;600&display=swap\">" +
    "<style>" +
    ":root{--paper:#E5DCC9;--ink:#14100C;--ink-faint:#8A7C68;--chile:#8E1409;--flame:#B4551D}" +
    "body{margin:0;background:var(--paper);color:var(--ink);font:16.5px/1.6 Barlow,system-ui,sans-serif;padding:48px 20px}" +
    "main{max-width:420px;margin:0 auto}" +
    "h1{font-family:'Special Elite',Courier New,monospace;font-weight:400;font-size:28px;margin:0 0 16px;" +
    "text-shadow:1.4px 1px 0 color-mix(in srgb,var(--chile) 30%,transparent)}" +
    "label{display:block;margin:14px 0 6px;font-size:14px}" +
    "input,textarea{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--ink-faint);" +
    "background:#F1EADB;color:var(--ink);font:inherit;border-radius:2px}" +
    "input:focus-visible,textarea:focus-visible{outline:2px solid var(--flame);outline-offset:2px}" +
    "button{margin-top:18px;background:var(--chile);color:#FFF6F2;border:1px solid var(--chile);" +
    "padding:12px 20px;font:600 15px Barlow,system-ui,sans-serif;cursor:pointer;border-radius:2px}" +
    "button:disabled{opacity:.45;cursor:not-allowed}" +
    ".muted{color:#574C3E;font-size:14.5px}.warn{color:var(--chile)}" +
    "</style></head><body><main><h1>" + esc(title) + "</h1>" + inner + "</main></body></html>";
}

export {
  CONFIRM_TTL_MS,
  MAX_BODY,
  MAX_SEND_BODY,
  emailOk,
  esc,
  makeToken,
  timingSafeEqual,
  verifyToken,
};
