// Everything that talks to the mail provider. The exported names say what the
// site needs — send a message, add someone to the list, send a broadcast — and
// Resend is an implementation detail behind them. Swapping providers means
// rewriting this file, not hunting for api.resend.com across the Worker.
//
// No interface type: there is one implementation, and a port with a single
// plug is ceremony. Introduce one when a second provider exists to shape it.

import { esc } from "./mail-helpers.ts";
import { SITE } from "../site-config.ts";

/** Why a call failed, in the site's vocabulary rather than the provider's. */
export type MailFailure = "quota" | "down";
export type MailResult = { ok: true } | { ok: false; reason: MailFailure };

const ok = { ok: true } as const;
const fail = (reason: MailFailure): MailResult => ({ ok: false, reason });

function auth(env: Env): Record<string, string> {
  return {
    Authorization: "Bearer " + env.RESEND_API_KEY,
    "Content-Type": "application/json",
  };
}

/** 429 is the daily cap; anything else non-2xx is "the provider is unwell". */
function classify(status: number): MailFailure {
  return status === 429 ? "quota" : "down";
}

export async function sendMessage(
  env: Env,
  message: { to: string; replyTo?: string; subject: string; text: string },
): Promise<MailResult> {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: auth(env),
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: [message.to],
      ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      subject: message.subject,
      text: message.text,
    }),
  });
  return r.ok ? ok : fail(classify(r.status));
}

/**
 * Add a confirmed address to the list.
 *
 * Contacts are global in Resend; a Segment is a named group of them, listed
 * under Audience in the dashboard. A Broadcast targets a Segment, so that is
 * the id this needs. A 409 means the contact already exists globally and
 * still needs adding to this Segment — which does not change their global
 * unsubscribe state if an old link is replayed.
 */
export async function addToList(env: Env, email: string): Promise<MailResult> {
  const created = await fetch("https://api.resend.com/contacts", {
    method: "POST",
    headers: auth(env),
    body: JSON.stringify({ email, segments: [{ id: env.RESEND_SEGMENT_ID }] }),
  });
  if (created.ok) return ok;
  if (created.status !== 409) return fail(classify(created.status));

  const added = await fetch(
    "https://api.resend.com/contacts/" +
      encodeURIComponent(email) +
      "/segments/" +
      encodeURIComponent(env.RESEND_SEGMENT_ID),
    { method: "POST", headers: auth(env) },
  );
  if (added.ok || added.status === 409) return ok;
  return fail(classify(added.status));
}

/** The newsletter wrapper. The unsubscribe token is the provider's. */
export function broadcastHtml(body: string, postal: string): string {
  return (
    '<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:' +
    SITE.theme.ink +
    ";background:" +
    SITE.theme.paper +
    ';padding:28px">' +
    '<p style="font-family:' +
    SITE.theme.display +
    ";letter-spacing:.05em;" +
    "text-transform:uppercase;color:" +
    SITE.theme.chile +
    ';font-size:13px">' +
    esc(SITE.masthead) +
    "</p>" +
    '<div style="white-space:pre-wrap;line-height:1.55">' +
    esc(body) +
    "</div>" +
    '<p style="margin-top:28px;font-size:13px;color:' +
    SITE.theme.quiet +
    '">' +
    esc(postal) +
    "</p>" +
    '<p style="font-size:13px"><a href="{{{RESEND_UNSUBSCRIBE_URL}}}">Unsubscribe</a></p>' +
    "</div>"
  );
}

export async function sendBroadcastToList(
  env: Env,
  broadcast: { subject: string; html: string },
): Promise<MailResult> {
  const r = await fetch("https://api.resend.com/broadcasts", {
    method: "POST",
    headers: auth(env),
    body: JSON.stringify({
      segment_id: env.RESEND_SEGMENT_ID,
      from: env.RESEND_FROM,
      subject: broadcast.subject,
      html: broadcast.html,
      send: true,
    }),
  });
  return r.ok ? ok : fail(classify(r.status));
}
