/**
 * @param {string} text
 * @returns {string[][]} rows of raw cells, blank rows dropped.
 */
export function parseCSV(text) {
  const rows = [];
  let row = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter(function (r) {
    return r.some(function (v) {
      return v.trim() !== "";
    });
  });
}

/**
 * Rows keyed by the header line, lowercased. Every value is a string: it came
 * out of a spreadsheet, so nothing is a number until something parses it.
 * @param {string} text
 * @returns {Record<string, string>[]}
 */
export function csvToObjects(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const head = rows[0].map(function (h) {
    return h.trim().toLowerCase();
  });
  return rows.slice(1).map(function (r) {
    const o = /** @type {Record<string, string>} */ ({});
    head.forEach(function (h, i) {
      o[h] = (r[i] || "").trim();
    });
    return o;
  });
}

/**
 * The sheet is typed by hand, so accept the spellings a person actually uses.
 * @param {unknown} v
 * @returns {boolean}
 */
export function isYes(v) {
  return /^(y|yes|true|1|x)$/i.test(String(v || "").trim());
}

/**
 * @param {unknown} iso a `YYYY-MM-DD` cell.
 * @returns {string | null} zero-padded date, or null if it is not that exact day.
 */
export function normalizeDay(iso) {
  const bits = String(iso).trim().split("-");
  if (bits.length !== 3) return null;
  const y = +bits[0],
    m = +bits[1],
    day = +bits[2];
  const d = new Date(y, m - 1, day);
  if (isNaN(d.getTime())) return null;
  if (d.getFullYear() !== y || d.getMonth() !== m - 1 || d.getDate() !== day)
    return null;
  const pad = (n) => (n < 10 ? "0" : "") + n;
  return y + "-" + pad(m) + "-" + pad(day);
}

/**
 * @param {unknown} iso a `YYYY-MM-DD` cell.
 * @returns {Date | null} null for anything that is not that exact date.
 */
export function parseDay(iso) {
  // Split rather than Date.parse: an ISO date string is treated as UTC and
  // can land on the previous day once rendered in a US timezone.
  const day = normalizeDay(iso);
  if (!day) return null;
  const bits = day.split("-");
  return new Date(+bits[0], +bits[1] - 1, +bits[2]);
}
