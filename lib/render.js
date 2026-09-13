// Building a product card, in one place. site.js calls this in the browser
// and tools/make-catalog.mjs calls it in Node against a DOM shim, so the
// markup a visitor without JavaScript sees is made by the same function as
// the markup everyone else sees. Nothing here reads the document: pass in
// what it needs and it returns detached nodes.

/** @import { Product } from "../types.js" */
import { heatWord, isYes } from "./data.js";

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
  // No listener here. Cards are also written into the page ahead of time by
  // tools/make-catalog.mjs, and markup cannot carry one, so site.js listens
  // once at the document and reads the name back off this attribute.
  b.dataset.ask = name;
  return b;
}

export { fillHeatPips, productCard, askButton };
