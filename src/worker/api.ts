// Mail, /data, and scheduled(). Imported by the Worker entry and by Node tests.
// Must not import Astro — `@astrojs/cloudflare/handler` pulls in `cloudflare:`,
// which Node's test runner cannot load.

import { WORKER_HTML_CSP } from "../lib/csp.ts";
import {
  CONFIRM_TTL_MS,
  MAX_BODY,
  MAX_SEND_BODY,
  emailOk,
  esc,
  makeToken,
  timingSafeEqual,
  verifyToken,
} from "./mail-helpers.ts";
import { readCatalog, refreshData, refreshMode } from "./catalog.ts";

// ---------------------------------------------------------------- the site
// Everything that identifies this client: their names, the copy that mentions
// them, the palette. Nothing below this block names a business. The generic
// strings down there - error titles, button labels - would serve any of them,
// but read them before reusing this: they carry a voice.
const SITE = {
  name: "Hot Stuff",                            // page titles
  masthead: "Paula and Crazy John's Hot Stuff", // top of the newsletter
  list: "The list",                             // what a subscriber joined

  copy: {
    contactSubject: "Hot Stuff note from {name}",
    confirmSubject: "Confirm you're on The list",
    confirmLead: "Click to join Paula and Crazy John's list:",
    confirmWait:
      "It may be a while before you hear from us. We write when there is " +
      "something to say, and the first letter waits until we have a PO box " +
      "we can print.",
    confirmIgnore: "If you did not ask for this, ignore it.",
    joinedTitle: "You're on the list",
    joinedBody:
      "We'll write when there is something to say. It may be a while — " +
      "the first letter waits on a PO box we can print.",
  },

  // The Worker serves two thin pages of its own (confirm, compose) plus the
  // newsletter wrapper. They cannot share the site's stylesheet, so the few
  // values that keep them recognisable are repeated here.
  theme: {
    paper: "#E5DCC9", ink: "#14100C", inkFaint: "#8A7C68",
    chile: "#8E1409", flame: "#B4551D", card: "#F1EADB", quiet: "#574C3E",
    display: "'Special Elite',Courier New,monospace",
    body: "Barlow,system-ui,sans-serif",
    fonts: "https://fonts.googleapis.com/css2?family=Special+Elite" +
           "&family=Barlow:wght@400;600&display=swap",
  },
};

/** CSP for Worker HTML (/confirm, /compose). Site pages use SITE_CSP in fetch. */
const HTML_CSP = WORKER_HTML_CSP;


/** The limiters only, so `limited` cannot be handed the name of a secret. */
type Limiter = "MAIL_IP" | "MAIL_EMAIL" | "SEND_IP";

/** A decoded JSON body. Off the wire, so every field is still unproven. */
type Payload = Record<string, unknown>;

const MAX_NAME = 100;
const MAX_MSG = 2000;
const MAX_SUBJECT = 200;
const MAX_BROADCAST = 8000;

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    try {
      if (path === "/data" && req.method === "GET") return dataGet(env, ctx);
      if (path === "/contact" && req.method === "POST") return contact(req, env);
      if (path === "/subscribe" && req.method === "POST") return subscribe(req, env);
      if (path === "/confirm" && req.method === "GET") return confirmGet(url, env);
      if (path === "/confirm" && req.method === "POST") return confirmPost(req, env);
      if (path === "/compose" && req.method === "GET") return composePage(env);
      if (path === "/send" && req.method === "POST") return sendBroadcast(req, env);
    } catch (e) {
      return json({ ok: false, reason: "down" }, 502);
    }

    return new Response("not found", { status: 404 });
  },


  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
    // Await so Past Events records success/failure of the refresh itself.
    await refreshData(env);
  },
};

async function dataGet(env: Env, ctx: ExecutionContext): Promise<Response> {
  let catalog = await readCatalog(env);
  // Cold and stale must not both fire: isStale is true when fetchedAt is null.
  const mode = refreshMode(catalog);
  if (mode === "cold") {
    catalog = await refreshData(env);
  } else if (mode === "stale") {
    ctx.waitUntil(refreshData(env));
  }
  return new Response(JSON.stringify(catalog), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60",
    },
  });
}

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

/** Custom events → Analytics Engine. blob1 = event, blob2 = optional detail. */
function track(env: Env, event: string, detail = "", n = 1): void {
  env.METRICS.writeDataPoint({
    blobs: [event, detail],
    doubles: [n],
    indexes: [event],
  });
}

function html(body: string, status?: number): Response {
  return new Response(body, {
    status: status || 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": HTML_CSP,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });
}

function ipOf(req: Request): string {
  return req.headers.get("CF-Connecting-IP") || "unknown";
}

async function limited(env: Env, binding: Limiter, key: string): Promise<boolean> {
  const { success } = await env[binding].limit({ key });
  return success;
}

async function readJson(req: Request, maxBody: number = MAX_BODY): Promise<{ err?: Response; data?: Payload }> {
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

function honeypot(data: Payload): boolean {
  return !!(data && (data.company || data.website));
}

async function resendSend(env: Env, payload: unknown): Promise<{ ok?: true; reason?: string }> {
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

function resendFail(reason: string | undefined): Response {
  if (reason === "quota") return json({ ok: false, reason: "quota" }, 429);
  return json({ ok: false, reason: "down" }, 502);
}

async function contact(req: Request, env: Env): Promise<Response> {
  const parsed = await readJson(req);
  if (parsed.err) return parsed.err;
  const data = parsed.data || {};
  if (honeypot(data)) return json({ ok: true }, 200);

  const name = String(data.name || "").trim();
  const email = String(data.email || "").trim().toLowerCase();
  const message = String(data.message || "").trim();
  // Optional product name from the ask button — never email or IP.
  const ask = String(data.ask || "").trim();
  if (!name || name.length > MAX_NAME) return json({ ok: false, reason: "bad" }, 400);
  if (!emailOk(email)) return json({ ok: false, reason: "bad" }, 400);
  if (!message || message.length > MAX_MSG) return json({ ok: false, reason: "bad" }, 400);
  if (ask.length > MAX_NAME) return json({ ok: false, reason: "bad" }, 400);

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
    // Replacer function, not a string: a plain replacement would treat a
    // visitor typing $& or $` in their name as a substitution pattern.
    subject: SITE.copy.contactSubject.replace("{name}", () => name),
    text: "From: " + name + " <" + email + ">\n\n" + message,
  });
  if (!result.ok) return resendFail(result.reason);
  track(env, "contact");
  // Demand signal: product name only — never email or IP.
  if (ask) track(env, "ask", ask);
  return json({ ok: true }, 200);
}

async function subscribe(req: Request, env: Env): Promise<Response> {
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
    subject: SITE.copy.confirmSubject,
    text:
      SITE.copy.confirmLead + "\n\n" +
      link.toString() + "\n\n" +
      SITE.copy.confirmWait + "\n\n" +
      SITE.copy.confirmIgnore,
  });
  if (!result.ok) return resendFail(result.reason);
  track(env, "subscribe");
  return json({ ok: true }, 200);
}

async function confirmGet(url: URL, env: Env): Promise<Response> {
  const token = url.searchParams.get("t") || "";
  const email = await verifyToken(token, env.SUBSCRIBE_SIGNING_KEY);
  if (!email) {
    return html(thinPage("That link is dead", "<p>Ask again from the site if you still want on the list.</p>"), 400);
  }
  return html(thinPage(
    "One more click",
    "<p>Confirm you want on " + esc(SITE.list) + ". Prefetchers stop here.</p>" +
      "<form method=\"POST\" action=\"/confirm\">" +
      "<input type=\"hidden\" name=\"t\" value=\"" + esc(token) + "\">" +
      "<button type=\"submit\">Put me on the list</button>" +
      "</form>" +
      "<p class=\"muted\">It may be a while before you hear from us.</p>"
  ));
}

async function confirmPost(req: Request, env: Env): Promise<Response> {
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

  // Contacts are global in Resend; a Segment is a named group of them, listed
  // under Audience in the dashboard. A Broadcast targets a Segment, so that is
  // the id this needs.
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
    SITE.copy.joinedTitle,
    "<p>" + esc(SITE.copy.joinedBody) + "</p>"
  ));
}

function composePage(env: Env): Response {
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

async function sendBroadcast(req: Request, env: Env): Promise<Response> {
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
  if (!expected || !(await timingSafeEqual(password, expected))) {
    return json({ ok: false, reason: "auth" }, 401);
  }
  if (!subject || subject.length > MAX_SUBJECT) return json({ ok: false, reason: "bad" }, 400);
  if (!body || body.length > MAX_BROADCAST) return json({ ok: false, reason: "bad" }, 400);

  const htmlBody =
    '<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:' +
    SITE.theme.ink + ";background:" + SITE.theme.paper + ';padding:28px">' +
    '<p style="font-family:' + SITE.theme.display + ";letter-spacing:.05em;" +
    "text-transform:uppercase;color:" + SITE.theme.chile + ';font-size:13px">' +
    esc(SITE.masthead) + "</p>" +
    "<div style=\"white-space:pre-wrap;line-height:1.55\">" + esc(body) + "</div>" +
    '<p style="margin-top:28px;font-size:13px;color:' + SITE.theme.quiet + '">' +
    esc(postal) + "</p>" +
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

function thinPage(title: string, inner: string): string {
  return "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
    "<title>" + esc(title) + " · " + esc(SITE.name) + "</title>" +
    '<link rel="stylesheet" href="' + SITE.theme.fonts + '">' +
    "<style>" +
    ":root{--paper:" + SITE.theme.paper + ";--ink:" + SITE.theme.ink +
    ";--ink-faint:" + SITE.theme.inkFaint + ";--chile:" + SITE.theme.chile +
    ";--flame:" + SITE.theme.flame + ";--card:" + SITE.theme.card +
    ";--quiet:" + SITE.theme.quiet + "}" +
    "body{margin:0;background:var(--paper);color:var(--ink);font:16.5px/1.6 " +
    SITE.theme.body + ";padding:48px 20px}" +
    "main{max-width:420px;margin:0 auto}" +
    "h1{font-family:" + SITE.theme.display + ";font-weight:400;font-size:28px;margin:0 0 16px;" +
    "text-shadow:1.4px 1px 0 color-mix(in srgb,var(--chile) 30%,transparent)}" +
    "label{display:block;margin:14px 0 6px;font-size:14px}" +
    "input,textarea{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--ink-faint);" +
    "background:var(--card);color:var(--ink);font:inherit;border-radius:2px}" +
    "input:focus-visible,textarea:focus-visible{outline:2px solid var(--flame);outline-offset:2px}" +
    "button{margin-top:18px;background:var(--chile);color:#FFF6F2;border:1px solid var(--chile);" +
    "padding:12px 20px;font:600 15px " + SITE.theme.body + ";cursor:pointer;border-radius:2px}" +
    "button:disabled{opacity:.45;cursor:not-allowed}" +
    ".muted{color:var(--quiet);font-size:14.5px}.warn{color:var(--chile)}" +
    "</style></head><body><main><h1>" + esc(title) + "</h1>" + inner + "</main></body></html>";
}
