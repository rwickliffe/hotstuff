// Pages the Worker renders itself: /confirm and /compose, plus the thin
// replies the mail flow needs. Astro serves the site; these are outside it,
// so they are built here as strings and carry their own CSP.

import { WORKER_CSP } from "../lib/csp.ts";
import { SITE } from "../site-config.ts";
import { esc } from "./mail-helpers.ts";

function html(body: string, status?: number): Response {
  return new Response(body, {
    status: status || 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": WORKER_CSP,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });
}

function thinPage(title: string, inner: string): string {
  return (
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    "<title>" +
    esc(title) +
    " · " +
    esc(SITE.name) +
    "</title>" +
    '<link rel="stylesheet" href="' +
    SITE.theme.fonts +
    '">' +
    "<style>" +
    ":root{--paper:" +
    SITE.theme.paper +
    ";--ink:" +
    SITE.theme.ink +
    ";--ink-faint:" +
    SITE.theme.inkFaint +
    ";--chile:" +
    SITE.theme.chile +
    ";--flame:" +
    SITE.theme.flame +
    ";--card:" +
    SITE.theme.card +
    ";--quiet:" +
    SITE.theme.quiet +
    "}" +
    "body{margin:0;background:var(--paper);color:var(--ink);font:16.5px/1.6 " +
    SITE.theme.body +
    ";padding:48px 20px}" +
    "main{max-width:420px;margin:0 auto}" +
    "h1{font-family:" +
    SITE.theme.display +
    ";font-weight:400;font-size:28px;margin:0 0 16px;" +
    "text-shadow:1.4px 1px 0 color-mix(in srgb,var(--chile) 30%,transparent)}" +
    "label{display:block;margin:14px 0 6px;font-size:14px}" +
    "input,textarea{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--ink-faint);" +
    "background:var(--card);color:var(--ink);font:inherit;border-radius:2px}" +
    "input:focus-visible,textarea:focus-visible{outline:2px solid var(--flame);outline-offset:2px}" +
    "button{margin-top:18px;background:var(--chile);color:#FFF6F2;border:1px solid var(--chile);" +
    "padding:12px 20px;font:600 15px " +
    SITE.theme.body +
    ";cursor:pointer;border-radius:2px}" +
    "button:disabled{opacity:.45;cursor:not-allowed}" +
    ".muted{color:var(--quiet);font-size:14.5px}.warn{color:var(--chile)}" +
    "</style></head><body><main><h1>" +
    esc(title) +
    "</h1>" +
    inner +
    "</main></body></html>"
  );
}

/** The broadcast form. `limits` are the validator's, so the form cannot
 *  advertise a maximum the endpoint would reject. */
export function composePage(
  env: Env,
  limits: { subject: number; body: number },
): Response {
  const ready = !!(
    env.BROADCAST_POSTAL_ADDRESS && String(env.BROADCAST_POSTAL_ADDRESS).trim()
  );
  const gate = ready
    ? '<p class="muted">Broadcasts go to the whole list. Preview only until you hit send.</p>'
    : '<p class="warn">Broadcasts are off until BROADCAST_POSTAL_ADDRESS is set (a PO box you will print).</p>';
  return html(
    thinPage(
      "Compose",
      gate +
        '<form id="f">' +
        '<label>Password <input type="password" name="password" required autocomplete="current-password"></label>' +
        '<label>Subject <input name="subject" required maxlength="' +
        limits.subject +
        '"></label>' +
        '<label>Body <textarea name="body" rows="12" required maxlength="' +
        limits.body +
        '"></textarea></label>' +
        '<button type="submit"' +
        (ready ? "" : " disabled") +
        ">Send</button>" +
        '<p id="status" role="status" aria-live="polite"></p>' +
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
        "</script>",
    ),
  );
}

/** Wrong, expired, or replayed confirmation link. */
export const deadLinkPage = () =>
  html(
    thinPage(
      "That link is dead",
      "<p>Ask again from the site if you still want on the list.</p>",
    ),
    400,
  );

/** GET /confirm: a button, so prefetchers cannot subscribe anyone. */
export const confirmPromptPage = (token: string) =>
  html(
    thinPage(
      "One more click",
      "<p>Confirm you want on " +
        esc(SITE.list) +
        ". Prefetchers stop here.</p>" +
        '<form method="POST" action="/confirm">' +
        '<input type="hidden" name="t" value="' +
        esc(token) +
        '">' +
        '<button type="submit">Put me on the list</button>' +
        "</form>" +
        '<p class="muted">It may be a while before you hear from us.</p>',
    ),
  );

export const tooBigPage = () => html(thinPage("Too big", ""), 413);

export const slowDownPage = () =>
  html(thinPage("Slow down", "<p>Try again in a minute.</p>"), 429);

export const cappedTodayPage = () =>
  html(thinPage("Mail is capped today", "<p>Try again tomorrow.</p>"), 429);

export const couldNotJoinPage = () =>
  html(thinPage("Could not join", "<p>Try again later.</p>"), 502);

export const joinedPage = () =>
  html(
    thinPage(SITE.copy.joinedTitle, "<p>" + esc(SITE.copy.joinedBody) + "</p>"),
  );
