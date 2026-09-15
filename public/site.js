import {
  bandByKey,
  featuredFrom,
  forMaker,
  heatWord,
  parseDay,
} from "./lib/data.js";
import { fillHeatPips, productCard } from "./lib/render.js";

// ===================================================================
// Live catalog/schedule come from GET /data (Worker → KV). Sheet URLs
// live only on the Worker (wrangler.jsonc vars). The bake in the HTML
// is the floor when /data is empty or unreachable.
// ===================================================================

// Mail is same-origin (this Worker serves the site). false: forms show
// “not connected” and do not POST — for a static preview without wrangler.
// LIST_OPEN: false until RESEND_SEGMENT_ID is *their* Resend account (see ops.md).
const MAIL = true;
const LIST_OPEN = false;


// Where each dataset actually came from. Surfaced only at ?debug, because a
// customer should never see "our spreadsheet is broken" on a salsa website,
// but Paula needs a way to check that an edit actually landed.
const DIAG = {
  products: { state: "built-in list", rows: 0, note: "" },
  events:   { state: "built-in dates", rows: 0, note: "" },
  worker:   { state: MAIL ? "same-origin" : "off", note: "" }
};

function showDiag() {
  if (!/(^|[?&])debug(=|&|$)/.test(location.search)) return;
  const box = document.getElementById("diag") || document.createElement("div");
  box.id = "diag";
  box.style.cssText =
    "position:fixed;right:12px;bottom:12px;z-index:9999;max-width:340px;" +
    "background:#14100E;color:#F0E7DC;border:1px solid #46392F;border-radius:4px;" +
    "padding:12px 14px;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;" +
    "box-shadow:0 6px 24px rgba(0,0,0,.4)";
  /** @param {string} name @param {Source} source */
  function sourceLine(name, source) {
    const live = /^live/.test(source.state) || source.state === "same-origin";
    const rows =
      source.rows != null ? " (" + source.rows + " rows)" : "";
    return '<div style="margin-top:6px"><b>' + name + '</b> ' +
           '<span style="color:' + (live ? "#5CB84A" : "#E8A87C") + '">' +
           source.state + "</span>" + rows +
           (source.note ? '<div style="color:#B0A296;margin-top:2px">' + source.note + "</div>" : "") +
           "</div>";
  }
  box.innerHTML = '<div style="color:#B0A296">data sources</div>' +
                  sourceLine("products", DIAG.products) +
                  sourceLine("events", DIAG.events) +
                  sourceLine("worker", DIAG.worker);
  if (!box.parentNode) document.body.appendChild(box);
}


/** @import { MailResult, Product, Source } from "./types.js" */




const ASK_PARAM = "ask";

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




/** @param {Product[]} products */
function renderProducts(products) {
  // A grid marked data-featured leads with the picks; a plain one carries
  // the lot. That is the whole difference between the front page and the
  // catalog, so both run the same render.
  const grids = /** @type {NodeListOf<HTMLElement>} */ (
    document.querySelectorAll("[data-grid]"));
  grids.forEach(function (grid) {
    const who = (grid.dataset.grid || "").toLowerCase();
    const mine = forMaker(products, who);
    const shown = "featured" in grid.dataset ? featuredFrom(mine) : mine;
    grid.innerHTML = "";
    shown.forEach(function (p) { grid.appendChild(productCard(p)); });
  });

  wireFilter();
}

// --- heat filter over John's grid ---
function wireFilter() {
  const buttons = /** @type {NodeListOf<HTMLButtonElement>} */ (
    document.querySelectorAll(".filters button"));
  const cards = /** @type {NodeListOf<HTMLElement>} */ (
    document.querySelectorAll('[data-grid="John"] .prod'));
  const empty = document.getElementById("grid-empty");
  if (!buttons.length) return;

  buttons.forEach(function (btn) {
    btn.textContent = bandByKey(btn.dataset.band || "").label;
    btn.onclick = function () {
      const range = bandByKey(btn.dataset.band || "").range;
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

// --- the legend above the grid: one sample jar per band ---
function fillScaleKey() {
  const samples = /** @type {NodeListOf<HTMLElement>} */ (
    document.querySelectorAll(".heat[data-key]"));
  samples.forEach(function (sample) {
    const key = sample.dataset.key || "";
    fillHeatPips(sample, key);
    const caption = sample.parentElement && sample.parentElement.querySelector("small");
    if (caption) caption.textContent = heatWord(parseInt(key, 10));
  });
}

// --- schedule, rendered into our own markup so it matches the page ---
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];


/** @param {Product[]} rows */
function renderEvents(rows) {
  const host = document.getElementById("cal-rows");
  if (!host) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  /** @type {{ row: Product, when: Date }[]} */
  const upcoming = [];
  rows.forEach(function (r) {
    const when = parseDay(r.date);
    if (when && when >= today) upcoming.push({ row: r, when: when });
  });
  upcoming.sort(function (a, b) { return a.when.getTime() - b.when.getTime(); });
  upcoming.splice(30);

  host.innerHTML = "";

  if (!upcoming.length) {
    const none = document.createElement("p");
    none.className = "cal-empty";
    none.textContent = "Nothing on the books right now. Facebook has the latest.";
    host.appendChild(none);
  }

  upcoming.forEach(function (e) {
    const cells = e.row;
    const row = document.createElement("div");
    row.className = "cal-row";

    const when = document.createElement("span");
    when.className = "cal-when";
    when.textContent = DAYS[e.when.getDay()] + " " + e.when.getDate() + " " +
                       MONTHS[e.when.getMonth()];

    const what = document.createElement("span");
    what.className = "cal-what";
    what.appendChild(document.createTextNode(cells.name || ""));

    if (cells.time) {
      const t = document.createElement("small");
      t.textContent = cells.time;
      what.appendChild(t);
    }

    if (cells.address) {
      const a = document.createElement("a");
      a.className = "cal-map";
      a.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(cells.address);
      a.textContent = cells.address;
      what.appendChild(a);
    }

    row.appendChild(when);
    row.appendChild(what);
    host.appendChild(row);
  });
}

// Seed rows first so the page is never empty, then try /data and swap in
// live rows when present. Products and events share one payload.
function loadCatalog() {
  fetch("/data", { cache: "no-store" })
    .then(function (response) {
      if (!response.ok) throw new Error(String(response.status));
      return response.json();
    })
    .then(function (data) {
      const products = Array.isArray(data.products) ? data.products : [];
      const events = Array.isArray(data.events) ? data.events : [];
      if (products.length) {
        renderProducts(products);
        DIAG.products.state = "live /data";
        DIAG.products.rows = products.length;
        DIAG.products.note = "";
      } else {
        DIAG.products.note = "No products in /data. Baked-in list left in place.";
      }
      if (events.length) {
        renderEvents(events);
        DIAG.events.state = "live /data";
        DIAG.events.rows = events.length;
        DIAG.events.note = "";
      } else {
        DIAG.events.note = "No events in /data. No dates shown.";
      }
      if (data.lastError) {
        if (data.lastError.products) {
          DIAG.products.note = (DIAG.products.note ? DIAG.products.note + " " : "") +
            "lastError: " + data.lastError.products;
        }
        if (data.lastError.events) {
          DIAG.events.note = (DIAG.events.note ? DIAG.events.note + " " : "") +
            "lastError: " + data.lastError.events;
        }
      }
      if (data.fetchedAt) {
        DIAG.products.note = (DIAG.products.note ? DIAG.products.note + " · " : "") +
          "fetchedAt " + data.fetchedAt;
        showDataAge(data.fetchedAt);
      }
      showDiag();
    })
    .catch(function (error) {
      const why = location.protocol === "file:"
        ? "Opened from a file:// path. Use wrangler dev instead."
        : String(error);
      DIAG.products.note = "Could not reach /data. " + why;
      DIAG.events.note = DIAG.products.note;
      console.warn("Could not reach /data", why);
      showDiag();
    });
}

// Quiet line under the grids when the live catalog is older than six hours.
// Hidden otherwise — customers should not see freshness chrome every visit.
const DATA_AGE_MS = 6 * 60 * 60 * 1000;

/** @param {string} fetchedAt */
function showDataAge(fetchedAt) {
  const el = document.getElementById("data-age");
  if (!el) return;
  const t = Date.parse(fetchedAt);
  if (!Number.isFinite(t) || Date.now() - t < DATA_AGE_MS) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  const hours = Math.round((Date.now() - t) / (60 * 60 * 1000));
  el.textContent = "List last refreshed about " + hours + " hours ago.";
  el.hidden = false;
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
      setStatus(status, "Sending…", false);
      try {
        const result = await postMail("/contact", {
          name: String(fd.get("name") || "").trim(),
          email: String(fd.get("email") || "").trim(),
          message: String(fd.get("message") || "").trim(),
          company: String(fd.get("company") || "")
        });
        if (result.ok) {
          noteDiag("");
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

// Delegated, so it covers the cards tools/make-catalog.mjs baked into the page
// as well as any this script renders later from the live sheet.
function wireAsking() {
  document.addEventListener("click", function (e) {
    const target = /** @type {Element | null} */ (e.target);
    const btn = target && target.closest(".ask[data-ask]");
    if (btn instanceof HTMLElement && btn.dataset.ask) requestProduct(btn.dataset.ask);
  });
}

function init() {
  fillScaleKey();
  wireAsking();
  loadCatalog();
  wireMailForms();
  wirePendingAsk();
  showDiag();
  wireThemeToggle();
}

init();
