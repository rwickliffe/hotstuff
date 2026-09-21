// Mail, /data, and scheduled(). Imported by the Worker entry and by Node tests.
// Must not import Astro — `@astrojs/cloudflare/handler` pulls in `cloudflare:`,
// which Node's test runner cannot load.

import { SITE } from "../site-config.ts";
import {
  addToList,
  broadcastHtml,
  sendBroadcastToList,
  sendMessage,
  type MailFailure,
} from "./mail.ts";
import { emailOk } from "../lib/email-address.ts";
import { timingSafeEqual } from "./crypto.ts";
import { CONFIRM_TTL_MS, makeToken, verifyToken } from "./tokens.ts";
import { readCatalog, refreshData, refreshMode } from "./catalog.ts";
import {
  cappedTodayPage,
  composePage,
  confirmPromptPage,
  couldNotJoinPage,
  deadLinkPage,
  joinedPage,
  slowDownPage,
  tooBigPage,
} from "./pages.ts";

/** The limiters only, so `limited` cannot be handed the name of a secret. */
type Limiter = "MAIL_IP" | "MAIL_EMAIL" | "SEND_IP";

/** A decoded JSON body. Off the wire, so every field is still unproven. */
type Payload = Record<string, unknown>;

/** Request bodies, in bytes. Exported so the tests can push past them. */
export const MAX_BODY_BYTES = 8192;
export const MAX_SEND_BODY_BYTES = 65536;

const MAX_NAME = 100;
const MAX_ASK = 100;
const MAX_MSG = 2000;
const MAX_SUBJECT = 200;
const MAX_BROADCAST = 8000;

export default {
  async fetch(
    req: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    try {
      if (path === "/data" && req.method === "GET") return dataGet(env, ctx);
      if (path === "/contact" && req.method === "POST")
        return contact(req, env);
      if (path === "/subscribe" && req.method === "POST")
        return subscribe(req, env);
      if (path === "/confirm" && req.method === "GET")
        return confirmGet(url, env);
      if (path === "/confirm" && req.method === "POST")
        return confirmPost(req, env);
      if (path === "/compose" && req.method === "GET")
        return composePage(env, { subject: MAX_SUBJECT, body: MAX_BROADCAST });
      if (path === "/send" && req.method === "POST")
        return sendBroadcast(req, env);
    } catch (e) {
      return json({ ok: false, reason: "down" }, 502);
    }

    return new Response("not found", { status: 404 });
  },

  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ) {
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

function ipOf(req: Request): string {
  return req.headers.get("CF-Connecting-IP") || "unknown";
}

async function limited(
  env: Env,
  binding: Limiter,
  key: string,
): Promise<boolean> {
  const { success } = await env[binding].limit({ key });
  return success;
}

async function readJson(
  req: Request,
  maxBody: number = MAX_BODY_BYTES,
): Promise<{ err?: Response; data?: Payload }> {
  const len = Number(req.headers.get("Content-Length") || "0");
  if (len > maxBody) return { err: json({ ok: false, reason: "size" }, 413) };
  const text = await req.text();
  if (text.length > maxBody)
    return { err: json({ ok: false, reason: "size" }, 413) };
  try {
    return { data: JSON.parse(text) };
  } catch {
    return { err: json({ ok: false, reason: "bad" }, 400) };
  }
}

function honeypot(data: Payload): boolean {
  return !!(data && (data.company || data.website));
}

/** The JSON reply when a send fails. /confirm answers with a page instead. */
function sendFail(reason: MailFailure): Response {
  return reason === "quota"
    ? json({ ok: false, reason: "quota" }, 429)
    : json({ ok: false, reason: "down" }, 502);
}

async function contact(req: Request, env: Env): Promise<Response> {
  const parsed = await readJson(req);
  if (parsed.err) return parsed.err;
  const data = parsed.data || {};
  if (honeypot(data)) return json({ ok: true }, 200);

  const name = String(data.name || "").trim();
  const email = String(data.email || "")
    .trim()
    .toLowerCase();
  const message = String(data.message || "").trim();
  // Optional product name from the ask button — never email or IP.
  const ask = String(data.ask || "").trim();
  if (!name || name.length > MAX_NAME)
    return json({ ok: false, reason: "bad" }, 400);
  if (!emailOk(email)) return json({ ok: false, reason: "bad" }, 400);
  if (!message || message.length > MAX_MSG)
    return json({ ok: false, reason: "bad" }, 400);
  if (ask.length > MAX_ASK) return json({ ok: false, reason: "bad" }, 400);

  if (!(await limited(env, "MAIL_IP", "contact:" + ipOf(req)))) {
    return json({ ok: false, reason: "rate" }, 429);
  }
  if (!(await limited(env, "MAIL_EMAIL", "contact:" + email))) {
    return json({ ok: false, reason: "rate" }, 429);
  }

  const result = await sendMessage(env, {
    to: env.CONTACT_TO,
    replyTo: email,
    // Replacer function, not a string: a plain replacement would treat a
    // visitor typing $& or $` in their name as a substitution pattern.
    subject: SITE.copy.contactSubject.replace("{name}", () => name),
    text: "From: " + name + " <" + email + ">\n\n" + message,
  });
  if (!result.ok) return sendFail(result.reason);
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

  const email = String(data.email || "")
    .trim()
    .toLowerCase();
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

  const result = await sendMessage(env, {
    to: email,
    subject: SITE.copy.confirmSubject,
    text:
      SITE.copy.confirmLead +
      "\n\n" +
      link.toString() +
      "\n\n" +
      SITE.copy.confirmWait +
      "\n\n" +
      SITE.copy.confirmIgnore,
  });
  if (!result.ok) return sendFail(result.reason);
  track(env, "subscribe");
  return json({ ok: true }, 200);
}

async function confirmGet(url: URL, env: Env): Promise<Response> {
  const token = url.searchParams.get("t") || "";
  const email = await verifyToken(token, env.SUBSCRIBE_SIGNING_KEY);
  if (!email) {
    return deadLinkPage();
  }
  return confirmPromptPage(token);
}

async function confirmPost(req: Request, env: Env): Promise<Response> {
  let token = "";
  const ct = req.headers.get("Content-Type") || "";
  if (ct.includes("application/x-www-form-urlencoded")) {
    const body = await req.text();
    if (body.length > MAX_BODY_BYTES) return tooBigPage();
    token = new URLSearchParams(body).get("t") || "";
  } else {
    const parsed = await readJson(req);
    if (parsed.err) return parsed.err;
    token = String((parsed.data && parsed.data.t) || "");
  }

  const email = await verifyToken(token, env.SUBSCRIBE_SIGNING_KEY);
  if (!email) {
    return deadLinkPage();
  }

  if (!(await limited(env, "MAIL_IP", "confirm:" + ipOf(req)))) {
    return slowDownPage();
  }

  const joined = await addToList(env, email);
  if (!joined.ok) {
    return joined.reason === "quota" ? cappedTodayPage() : couldNotJoinPage();
  }

  return joinedPage();
}

async function sendBroadcast(req: Request, env: Env): Promise<Response> {
  if (!(await limited(env, "SEND_IP", "send:" + ipOf(req)))) {
    return json({ ok: false, reason: "rate" }, 429);
  }

  const postal = String(env.BROADCAST_POSTAL_ADDRESS || "").trim();
  if (!postal) return json({ ok: false, reason: "postal" }, 403);

  const parsed = await readJson(req, MAX_SEND_BODY_BYTES);
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
  if (!subject || subject.length > MAX_SUBJECT)
    return json({ ok: false, reason: "bad" }, 400);
  if (!body || body.length > MAX_BROADCAST)
    return json({ ok: false, reason: "bad" }, 400);

  const sent = await sendBroadcastToList(env, {
    subject,
    html: broadcastHtml(body, postal),
  });
  if (!sent.ok) return sendFail(sent.reason);
  return json({ ok: true }, 200);
}
