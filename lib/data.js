// The data functions, with no DOM and no network in them: CSV parsing, the
// date parser and the heat scale. They are the half of the page that can be
// tested by calling it, which is why they live in their own module -
// tools/test-parsing.mjs imports this file and runs exactly what ships.

// One definition of the heat scale. The per-jar word, the filter button and
// the legend all read from this, so they cannot drift apart.
export const BANDS = [
  { key: "all",    range: [0, 9], label: "Everything" },
  { key: "mild",   range: [1, 1], label: "Harmless" },
  { key: "medium", range: [2, 3], label: "Uneasy" },
  { key: "hot",    range: [4, 5], label: "Regrettable" },
  { key: "beyond", range: [6, 6], label: "No survivors" }
];

export function bandByKey(key) {
  for (let i = 0; i < BANDS.length; i++) if (BANDS[i].key === key) return BANDS[i];
  return BANDS[0];
}

export function heatWord(n) {
  for (let i = 1; i < BANDS.length; i++) {
    if (n >= BANDS[i].range[0] && n <= BANDS[i].range[1]) return BANDS[i].label;
  }
  return "";
}

// --- CSV parse: handles quoted fields containing commas and newlines ---
export function parseCSV(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; }
      } else { field += c; }
    } else if (c === '"') { quoted = true; }
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); field = ""; rows.push(row); row = []; }
    else if (c !== "\r") { field += c; }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter(function (r) { return r.some(function (v) { return v.trim() !== ""; }); });
}

export function csvToObjects(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const head = rows[0].map(function (h) { return h.trim().toLowerCase(); });
  return rows.slice(1).map(function (r) {
    const o = {};
    head.forEach(function (h, i) { o[h] = (r[i] || "").trim(); });
    return o;
  }).filter(function (o) { return o.name; });
}

// The sheet is typed by hand, so accept the spellings a person actually
// uses. sold_out and featured are both read through here.
export function isYes(v) {
  return /^(y|yes|true|1|x|sold ?out)$/i.test(String(v || "").trim());
}

export function parseDay(iso) {
  // Split rather than Date.parse: an ISO date string is treated as UTC and
  // can land on the previous day once rendered in a US timezone.
  const bits = String(iso).trim().split("-");
  if (bits.length !== 3) return null;
  const d = new Date(+bits[0], +bits[1] - 1, +bits[2]);
  if (isNaN(d)) return null;
  // Date rolls a bad day forward rather than rejecting it, so Feb 31 comes
  // back as Mar 3 and the market shows up on the wrong day. The sheet is
  // typed by hand, so check the date we got is the date we asked for.
  if (d.getFullYear() !== +bits[0] || d.getMonth() !== +bits[1] - 1 ||
      d.getDate() !== +bits[2]) return null;
  return d;
}
