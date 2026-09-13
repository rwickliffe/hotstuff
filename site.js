import {
  bandByKey,
  csvToObjects,
  heatWord,
  isYes,
  parseDay,
} from "./lib/data.js";

// ===================================================================
// Paste the Google Sheet's "Publish to web -> CSV" address here.
// Leave it empty and the page just uses the seed list below.
// ===================================================================
const PRODUCTS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vThGdNSBT7_ydyWCHyQUuvYu8gBaow8xgqiLPkyAAmT1AcVnCe0ttgpdvqIlA0rp7UGs-uQL-Sx4k3z/pub?gid=685501268&single=true&output=csv";

// ===================================================================
// Schedule. Second tab of the same spreadsheet, published as CSV.
// Columns: date (YYYY-MM-DD), name, time, address
// Empty leaves the sample dates below in place.
// ===================================================================
const EVENTS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vThGdNSBT7_ydyWCHyQUuvYu8gBaow8xgqiLPkyAAmT1AcVnCe0ttgpdvqIlA0rp7UGs-uQL-Sx4k3z/pub?gid=1952117961&single=true&output=csv";

// Mail Worker. Empty: forms show a short “not connected” note and do not POST.
// LIST_OPEN: false until RESEND_SEGMENT_ID is *their* Resend account (see ops.md).
const WORKER_URL = "https://hotstuff-mail.rwickliffe.workers.dev";
const LIST_OPEN = false;

// How many jars the front page leads with per maker. The catalog shows the
// lot. Six tiles evenly at one, two, three and six columns, which is every
// width the grid actually settles on.
const FEATURED_MAX = 6;

// Where each dataset actually came from. Surfaced only at ?debug, because a
// customer should never see "our spreadsheet is broken" on a salsa website,
// but Paula needs a way to check that an edit actually landed.
// FALLBACK CATALOG AND SCHEDULE.
// What every page shows when no live sheet is configured, or when one is
// configured and cannot be reached. It doubles as the column format, and is
// the same content as data/products.csv and data/events.csv. It lives here
// rather than in a page so the front page and the catalog cannot drift.
const SEED_PRODUCTS = `maker,name,description,heat,price,price_quart,sold_out,featured
Paula,Mild Smoked Jalapeño Salsa,"Tomato, smoked jalapeños, smoked bell pepper, cilantro, garlic, onion and lime juice.",1,10,,,
Paula,Jalapeño Salsa,"Tomato, jalapeños, serrano pepper, cilantro, garlic, onion and lime juice.",2,10,,,yes
Paula,Tropical Fire Salsa,"Mango, papaya, strawberry, habanero, jalapeño, serrano, bell pepper, cilantro and lime.",4,10,,,yes
Paula,Smoked Ghostly Salsa,"Tomato, smoked habanero, smoked serrano, garlic, onion, lime juice and cider vinegar.",5,10,,,
Paula,Cowboy Candy,"Candied jalapeños with sugar, spices and cider vinegar. Sweet first, then not.",2,10,,,yes
Paula,Pineapple Cowboy Candy,"Pineapple, jalapeños, sugar, ginger, spices and cider vinegar.",2,10,,,
Paula,What's Yer Garlicky Dill,"Cucumber, garlic, onion and bell pepper. The one that disappears first.",1,10,15,,yes
Paula,Spicy Bread n Butter,"Cucumber, onion, sugar, bell pepper and spices, with a little heat behind it.",2,10,15,,
Paula,Chow Chow,Made the old way. Back when the cabbage is ready.,1,10,,yes,
John,Vampire Killer,"Red jalapeño, garlic, lemon juice, onion, cilantro, olive oil and white vinegar.",2,10,,,yes
John,Honey Jalapeño,"Jalapeño, honey, lemon juice, garlic, onion, olive oil and cider vinegar.",2,10,,,
John,Tropical Scotch Bonnet,"Scotch bonnet, pineapple, garlic, onion, cilantro, olive oil and lemon juice.",4,10,,,yes
John,Smoked Dragon's Breath,"Smoked habanero, garlic, onion, cilantro, olive oil and cider vinegar.",5,10,,,
John,Ghostly Blackberry,"Ghost pepper, blackberries, garlic, onion, cilantro and cider vinegar.",5,10,,,yes
John,Reaper's Luscious Peaches,"Carolina reaper, peaches, lime juice, avocado oil, whiskey and spices.",6,10,,,
John,Insanity,"Carolina reaper, ghost pepper, garlic, onion, cilantro and cider vinegar.",6,10,,,yes
John,Blueberry Fields of Death,"Carolina reaper, blueberries, onion, cilantro, olive oil and cider vinegar.",6,10,,,
John,Strawberry Fields of Ultra Insanity,"Strawberries, Carolina reaper, scorpion pepper, ghost pepper, garlic, onion and cilantro.",6,10,,,`;

const SEED_EVENTS = `date,name,time,address
2026-09-06,Elgin Farmers Market,8:00am to 1:00pm,"Main St, Elgin, TX 78621"
2026-09-13,Fall Festival,10:00am to 4:00pm,"Courthouse Square, Elgin, TX 78621"
2026-09-21,Makers Market,11:00am to 5:00pm,`;

const DIAG = {
  products: { state: "built-in list", rows: 0, note: "" },
  events:   { state: "built-in dates", rows: 0, note: "" },
  worker:   { state: WORKER_URL ? "set" : "empty", note: "" }
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
    const live = /^live/.test(source.state) || source.state === "set";
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


/**
 * One row of the products sheet. It came out of a spreadsheet, so every field
 * is a string and nothing is a number until something parses it.
 * @typedef {Record<string, string>} Product
 */

/**
 * What the ?debug panel prints about one data source.
 * @typedef {{ state: string, rows?: number | null, note?: string }} Source
 */

/**
 * A tab of the spreadsheet, and everything needed to render it.
 * @typedef {{ label: string, url: string, seed: string, source: Source,
 *   render: (rows: Product[], isLive: boolean) => void,
 *   hint: string, fallback: string }} Sheet
 */

/** What postMail answers with. @typedef {{ ok: boolean, reason?: string }} MailResult */

// --- pepper / skull pips ---
/** @param {Element} into @param {string | number} heat */
function fillHeatPips(into, heat) {
  const n = Math.max(0, Math.min(6, parseInt(String(heat), 10) || 0));
  into.innerHTML = "";
  for (let i = 1; i <= 6; i++) {
    const on = i <= n;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 20 24");
    svg.setAttribute("aria-hidden", "true");
    if (on) { svg.setAttribute("class", "heat-on heat-" + n); }
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    // One sprite file, shared by every page. It carries no fill, so the
    // pip takes its colour from the heat class on the <svg> above it.
    use.setAttribute("href", "flame.svg#i-flame");
    svg.appendChild(use);
    into.appendChild(svg);
  }
  into.setAttribute("role", "img");
  into.setAttribute("aria-label", n + " out of 6, " + (heatWord(n) || "unrated"));
}


/** @param {Product} p @returns {HTMLElement} */
function productCard(p) {
  const heat = parseInt(p.heat, 10) || 0;
  const soldOut = isYes(p.sold_out);
  const el = document.createElement("article");
  el.className = "prod" + (heat ? " heat-" + heat : "") +
                 (soldOut ? " sold-out" : "");
  el.dataset.heat = String(heat);

  const h3 = document.createElement("h3");
  h3.textContent = p.name;

  const made = document.createElement("p");
  made.className = "prod-made";
  made.textContent = p.description || "";

  const foot = document.createElement("div");
  foot.className = "prod-foot";

  const left = document.createElement("div");
  const scale = document.createElement("span");
  scale.className = "heat";
  fillHeatPips(scale, heat);
  const word = document.createElement("div");
  word.className = "heat-word";
  word.textContent = heatWord(heat);
  left.appendChild(scale);
  left.appendChild(word);

  // A jar that is out has no price to show, so the ask takes that slot
  // rather than adding a row: the card keeps the shape of every other card.
  let tail;
  if (soldOut) {
    tail = askButton(p.name);
  } else {
    tail = document.createElement("span");
    tail.className = "price";
    tail.textContent = p.price ? "$" + p.price : "";
    if (p.price_quart) {
      const qt = document.createElement("small");
      qt.className = "price-qt";
      qt.textContent = "$" + p.price_quart + " qt";
      tail.appendChild(qt);
    }
  }

  foot.appendChild(left);
  foot.appendChild(tail);
  el.appendChild(h3);
  el.appendChild(made);
  el.appendChild(foot);
  return el;
}

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
  location.href = "index.html?" + ASK_PARAM + "=" +
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

// Stock rotates, so a gap is ordinary rather than a mistake. Asking routes
// into the contact form, which means requests can be counted in an inbox
// without this page needing anywhere to keep them.
/** @param {string} name @returns {HTMLButtonElement} */
function askButton(name) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "ask";
  b.textContent = "Ask for this";
  // "Ask for this" repeated down a page names nothing, and the card's only
  // remaining sign that the jar is out is that it looks faded. Both are
  // fixed by spelling it out here.
  b.setAttribute("aria-label", "Ask for " + name + ", all gone");
  b.addEventListener("click", function () { requestProduct(name); });
  return b;
}

/** @param {Product[]} products @param {string} who @returns {Product[]} */
function forMaker(products, who) {
  return products.filter(function (p) {
    return (p.maker || "").trim().toLowerCase() === who;
  });
}

/** @param {Product[]} mine @returns {Product[]} */
function featuredFrom(mine) {
  const picked = mine.filter(function (p) { return isYes(p.featured); });
  // Nobody has ticked the column yet: lead with the top of their list rather
  // than an empty shelf.
  return (picked.length ? picked : mine).slice(0, FEATURED_MAX);
}

/** @param {Product[]} products */
function renderProducts(products) {
  // A grid marked data-featured leads with the picks; a plain one carries
  // the lot. That is the whole difference between the front page and the
  // catalog, so both run the same render.
  /** @type {Record<string, number>} */
  const shownPerMaker = {};
  const grids = /** @type {NodeListOf<HTMLElement>} */ (
    document.querySelectorAll("[data-grid]"));
  grids.forEach(function (grid) {
    const who = (grid.dataset.grid || "").toLowerCase();
    const mine = forMaker(products, who);
    const shown = "featured" in grid.dataset ? featuredFrom(mine) : mine;
    shownPerMaker[who] = shown.length;
    grid.innerHTML = "";
    shown.forEach(function (p) { grid.appendChild(productCard(p)); });
  });

  // The count only exists once a sheet has landed, so the link is written
  // here rather than guessed at in the markup, and hides itself when there
  // is nothing further to see.
  const links = /** @type {NodeListOf<HTMLElement>} */ (
    document.querySelectorAll("[data-see-all]"));
  links.forEach(function (link) {
    const who = (link.dataset.seeAll || "").toLowerCase();
    const total = forMaker(products, who).length;
    link.textContent = "See all " + total + " of " + link.dataset.whose;
    link.hidden = total <= (shownPerMaker[who] || 0);
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


/** @param {Product[]} rows @param {boolean} isLive */
function renderEvents(rows, isLive) {
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

  if (isLive) {
    const badge = document.getElementById("cal-badge");
    if (badge) badge.remove();
  }
}

// Seed rows first so the page is never empty, then try the live sheet and
// swap it in if it has anything usable. Both tabs follow the same sequence;
// only the target markup and the wording differ. A renderer takes
// (rows, isLive) - products ignores isLive, events uses it to drop the
// "sample dates" badge.
/** @param {Sheet} sheet */
function loadSheet(sheet) {
  const seedRows = csvToObjects(sheet.seed);
  sheet.render(seedRows, false);
  sheet.source.rows = seedRows.length;

  if (!sheet.url) return;

  fetch(sheet.url, { cache: "no-store" })
    .then(function (response) {
      if (!response.ok) throw new Error(String(response.status));
      return response.text();
    })
    .then(function (text) {
      const live = csvToObjects(text);
      if (live.length) {
        sheet.render(live, true);
        sheet.source.state = "live sheet";
        sheet.source.rows = live.length;
        sheet.source.note = "";
      } else {
        // Reachable but useless is the failure mode that looks like success:
        // a "publish to web" HTML url answers 200 with a page, not rows.
        sheet.source.note = "Sheet reachable but no usable rows. " + sheet.hint;
        console.warn(sheet.label + " sheet returned no usable rows. " +
                     sheet.hint + " " + sheet.fallback);
      }
      showDiag();
    })
    .catch(function (error) {
      const why = location.protocol === "file:"
        ? "Opened from a file:// path, which blocks requests to Google. " +
          "Serve the folder instead: python3 -m http.server 8765"
        : String(error);
      sheet.source.note = "Could not reach the sheet. " + why;
      console.warn("Could not reach the " + sheet.label + " sheet, " +
                   sheet.fallback.toLowerCase(), why);
      showDiag();
    });
}

const SHEETS = [
  {
    label: "products",
    url: PRODUCTS_CSV_URL,
    seed: SEED_PRODUCTS,
    source: DIAG.products,
    render: renderProducts,
    hint: "Is the URL the CSV one, ending in output=csv?",
    fallback: "Built-in list left in place."
  },
  {
    label: "events",
    url: EVENTS_CSV_URL,
    seed: SEED_EVENTS,
    source: DIAG.events,
    render: renderEvents,
    hint: "Check the date column reads YYYY-MM-DD.",
    fallback: "Sample dates left in place."
  }
];

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
  const listBox = document.getElementById("list-box");
  if (listBox && !LIST_OPEN) {
    listBox.hidden = true;
    const sub = document.getElementById("subscribe-form");
    if (sub) sub.remove();
    const grid = /** @type {HTMLElement | null} */ (listBox.closest(".write-grid"));
    if (grid) grid.style.gridTemplateColumns = "1fr";
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
    if (!WORKER_URL) return { ok: false, reason: "empty" };
    const r = await fetch(WORKER_URL.replace(/\/+$/, "") + path, {
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
      if (!WORKER_URL) {
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
      if (!WORKER_URL) {
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

function init() {
  fillScaleKey();
  SHEETS.forEach(loadSheet);
  wireMailForms();
  wirePendingAsk();
  showDiag();
  wireThemeToggle();
}

init();
