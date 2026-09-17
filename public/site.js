// Client chrome only: heat filter, theme, ask, mail.
// Grids, legend, schedule, data-age, and ?debug come from the Worker.

/** @import { MailResult } from "./types.js" */

// Mail is same-origin (this Worker serves the site). false: forms show
// “not connected” and do not POST.
// LIST_OPEN: false until RESEND_SEGMENT_ID is *their* Resend account (see ops.md).
const MAIL = true;
const LIST_OPEN = false;

// Surfaced only at ?debug. Products/events are server-rendered; this object
// only updates the worker line after a failed POST.
const DIAG = {
  worker: { state: MAIL ? "same-origin" : "off", note: "" }
};

function showDiag() {
  // Hardcoded: this file is served from public/ and cannot import
  // DEBUG_PARAM from src/site-config.ts.
  if (!/(^|[?&])debug(=|&|$)/.test(location.search)) return;
  const el = document.getElementById("diag-worker");
  if (!el) return;
  const live = DIAG.worker.state === "same-origin";
  el.innerHTML =
    '<span style="color:' + (live ? "#5CB84A" : "#E8A87C") + '">' +
    DIAG.worker.state + "</span>" +
    (DIAG.worker.note
      ? '<div style="color:#B0A296;margin-top:2px">' + DIAG.worker.note + "</div>"
      : "");
}

const ASK_PARAM = "ask";

/** Product name from the last Ask click; sent with /contact for Analytics Engine. */
let pendingAsk = "";

/** @param {string} name */
function askLine(name) {
  return 'Is "' + name + '" coming back? I would like some when it is.';
}

// Returns false when this page has no contact form, which is how
// requestProduct knows it has to travel.
//
// Two arrivals, and only one of them needs scrolling. A click further up
// this page glides down to the form. An arrival from the catalog comes in on
// #write, which the browser has already scrolled to, so scrolling again only
// fights it - fill the box and take the caret, nothing more.
/** @param {string} name @param {boolean} travelled @returns {boolean} */
function applyAsk(name, travelled) {
  const box = /** @type {HTMLTextAreaElement | null} */ (
    document.getElementById("contact-message"));
  if (!box) return false;
  if (!box.value.trim()) box.value = askLine(name);
  pendingAsk = name;
  const sec = document.getElementById("write");
  if (sec && !travelled) sec.scrollIntoView({ behavior: "smooth", block: "start" });
  box.focus({ preventScroll: true });
  return true;
}

// On the front page the form is already here. From the catalog it is not, so
// carry the name in the address: it survives the navigation, a reload and a
// browser with storage switched off, none of which sessionStorage manages.
/** @param {string} name */
function requestProduct(name) {
  if (applyAsk(name, false)) return;
  location.href = "/?" + ASK_PARAM + "=" +
                  encodeURIComponent(name) + "#write";
}

function wirePendingAsk() {
  const name = new URLSearchParams(location.search).get(ASK_PARAM);
  if (!name) return;
  // Out of the address bar, so a reload or a forwarded link does not keep
  // re-asking on someone else's behalf.
  history.replaceState(null, "", location.pathname + location.hash);
  // The browser does its own jump to the #write fragment as the page
  // finishes loading. That lands after this script runs and would undo both
  // the scroll and the focus, so wait until it is done.
  if (document.readyState === "complete") { applyAsk(name, true); return; }
  window.addEventListener("load", function () { applyAsk(name, true); });
}

// Heat vocabulary lives on the buttons (data-band / data-range / data-label)
// from BANDS on the server. This only toggles visibility.
function wireFilter() {
  const buttons = /** @type {NodeListOf<HTMLButtonElement>} */ (
    document.querySelectorAll(".filters button"));
  const cards = /** @type {NodeListOf<HTMLElement>} */ (
    document.querySelectorAll('[data-grid="John"] .prod'));
  const empty = document.getElementById("grid-empty");
  if (!buttons.length) return;

  buttons.forEach(function (btn) {
    btn.onclick = function () {
      const parts = (btn.dataset.range || "0,9").split(",");
      const lo = parseInt(parts[0], 10);
      const hi = parseInt(parts[1], 10);
      const range = [
        Number.isFinite(lo) ? lo : 0,
        Number.isFinite(hi) ? hi : 9
      ];
      buttons.forEach(function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
      let shown = 0;
      cards.forEach(function (c) {
        const h = parseInt(c.dataset.heat || "", 10) || 0;
        const fits = h >= range[0] && h <= range[1];
        c.style.display = fits ? "" : "none";
        if (fits) shown++;
      });
      if (empty) empty.style.display = shown ? "none" : "block";
    };
  });
}

// --- theme toggle ---
const root = document.documentElement;
const toggle = document.getElementById("theme-toggle");

function isDark() { return root.getAttribute("data-theme") === "dark"; }

function syncToggleLabel() {
  if (!toggle) return;
  toggle.textContent = isDark() ? "Lights on" : "Lights out";
}

// The page ships lights on. Dark is opt-in via the toggle and remembered.
function wireThemeToggle() {
  if (!toggle) return;
  try {
    const saved = localStorage.getItem("pcj-theme");
    if (saved === "dark" || saved === "light") {
      root.setAttribute("data-theme", saved);
    }
  } catch (e) { /* storage blocked, ship the default */ }

  syncToggleLabel();

  toggle.addEventListener("click", function () {
    const next = isDark() ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("pcj-theme", next); } catch (e) { /* fine */ }
    syncToggleLabel();
  });
}

function wireMailForms() {
  // The markup ships with the list closed, so the failure mode of this script
  // never running is a form nobody can see rather than one nobody can send.
  const listBox = document.getElementById("list-box");
  if (listBox && LIST_OPEN) {
    listBox.hidden = false;
    const grid = /** @type {HTMLElement | null} */ (listBox.closest(".write-grid"));
    if (grid) grid.removeAttribute("data-list-closed");
  } else {
    const sub = document.getElementById("subscribe-form");
    if (sub) sub.remove();
  }

  /** @param {HTMLElement | null} el @param {string} html @param {boolean} isErr */
  function setStatus(el, html, isErr) {
    if (!el) return;
    el.classList.toggle("is-err", !!isErr);
    el.innerHTML = html;
    el.focus();
  }

  function contactFallback() {
    return "Call " +
      '<a href="tel:+15126619723">(512) 661-9723</a> or find us on ' +
      '<a href="https://www.facebook.com/paulassalsa">Facebook</a>.';
  }

  /** @param {string} reason */
  function noteDiag(reason) {
    if (reason === "quota") DIAG.worker.note = "Resend daily cap";
    else if (reason === "down" || reason === "network") DIAG.worker.note = "could not reach";
    else if (!reason) DIAG.worker.note = "";
    showDiag();
  }

  /** @param {string} path @param {unknown} payload @returns {Promise<MailResult>} */
  async function postMail(path, payload) {
    if (!MAIL) return { ok: false, reason: "empty" };
    const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(payload)
    });
    /** @type {{ reason?: string }} */
    let body = {};
    try { body = await r.json(); } catch (e) { body = {}; }
    if (!r.ok) {
      return { ok: false, reason: body.reason || (r.status === 429 ? "rate" : "down") };
    }
    return { ok: true };
  }

  const contact = /** @type {HTMLFormElement | null} */ (
    document.getElementById("contact-form"));
  if (contact) {
    contact.addEventListener("submit", async function (e) {
      e.preventDefault();
      const status = document.getElementById("contact-status");
      if (!MAIL) {
        setStatus(status, "Mail is not connected yet. " + contactFallback(), true);
        return;
      }
      const fd = new FormData(contact);
      const message = String(fd.get("message") || "").trim();
      // Only count when the note still names the jar they asked for.
      const ask =
        pendingAsk && message.includes(pendingAsk) ? pendingAsk : "";
      setStatus(status, "Sending…", false);
      try {
        const result = await postMail("/contact", {
          name: String(fd.get("name") || "").trim(),
          email: String(fd.get("email") || "").trim(),
          message,
          ask,
          company: String(fd.get("company") || "")
        });
        if (result.ok) {
          noteDiag("");
          pendingAsk = "";
          contact.reset();
          setStatus(status, "Sent. We'll get back to you.", false);
        } else if (result.reason === "rate") {
          setStatus(status, "Too many notes from here. Wait a minute. " + contactFallback(), true);
        } else if (result.reason === "quota") {
          noteDiag("quota");
          setStatus(status, "Mail is capped for today. " + contactFallback(), true);
        } else if (result.reason === "bad" || result.reason === "size") {
          setStatus(status, "Check the fields and try again.", true);
        } else {
          noteDiag("down");
          setStatus(status, "Could not send. " + contactFallback(), true);
        }
      } catch (err) {
        noteDiag("network");
        setStatus(status, "Could not send. " + contactFallback(), true);
      }
    });
  }

  const subscribe = /** @type {HTMLFormElement | null} */ (
    document.getElementById("subscribe-form"));
  if (subscribe) {
    subscribe.addEventListener("submit", async function (e) {
      e.preventDefault();
      const status = document.getElementById("subscribe-status");
      if (!MAIL) {
        setStatus(status, "The list is not connected yet.", true);
        return;
      }
      const fd = new FormData(subscribe);
      setStatus(status, "Sending confirm…", false);
      try {
        const result = await postMail("/subscribe", {
          email: String(fd.get("email") || "").trim(),
          company: String(fd.get("company") || "")
        });
        if (result.ok) {
          noteDiag("");
          subscribe.reset();
          setStatus(status, "Check your inbox and confirm. It may be a while before we write.", false);
        } else if (result.reason === "rate") {
          setStatus(status, "Slow down and try again in a minute.", true);
        } else if (result.reason === "quota") {
          noteDiag("quota");
          setStatus(status, "Try again tomorrow.", true);
        } else if (result.reason === "bad" || result.reason === "size") {
          setStatus(status, "That email does not look right.", true);
        } else {
          noteDiag("down");
          setStatus(status, "Could not send. Try again later.", true);
        }
      } catch (err) {
        noteDiag("network");
        setStatus(status, "Could not send. Try again later.", true);
      }
    });
  }
}

function wireAsking() {
  document.addEventListener("click", function (e) {
    const target = /** @type {Element | null} */ (e.target);
    const btn = target && target.closest(".ask[data-ask]");
    if (btn instanceof HTMLElement && btn.dataset.ask) requestProduct(btn.dataset.ask);
  });
}

function init() {
  wireAsking();
  wireFilter();
  wireMailForms();
  wirePendingAsk();
  showDiag();
  wireThemeToggle();
}

init();
