/* Checks on the pure data functions in index.html.
 *
 *     node --test tools/ worker/
 *
 * The page is deliberately one self-contained file, so rather than keep a
 * second copy of these functions to test, this lifts them out of index.html by
 * name and runs the real shipped source. Rename one and the extraction fails
 * loudly rather than testing something that no longer exists.
 *
 * Only pure functions belong here: no DOM, no fetch, no clock.
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, "..", "index.html"), "utf8");

function lift(name, opener) {
  const start = src.indexOf(opener);
  assert.notEqual(start, -1, `${name} not found in index.html - renamed?`);
  // Balance whichever bracket the declaration opens with: a function body is
  // {...}, the heat table is [...].
  const open = /[[{]/.exec(src.slice(start))[0];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  for (let j = src.indexOf(open, start); j < src.length; j++) {
    if (src[j] === open) depth++;
    else if (src[j] === close && --depth === 0) return src.slice(start, j + 1);
  }
  throw new Error(`unbalanced ${open} while lifting ${name}`);
}

const sandbox = [
  lift("BANDS", "const BANDS = ["),
  lift("bandByKey", "function bandByKey("),
  lift("heatWord", "function heatWord("),
  lift("parseCSV", "function parseCSV("),
  lift("csvToObjects", "function csvToObjects("),
  lift("parseDay", "function parseDay("),
  "return { BANDS, bandByKey, heatWord, parseCSV, csvToObjects, parseDay };"
].join("\n");
// new Function, not eval: a direct eval would hoist these declarations into
// this module's scope and collide with the bindings below.
const { BANDS, bandByKey, heatWord, parseCSV, csvToObjects, parseDay } =
  new Function(sandbox)();


// --- parseCSV -------------------------------------------------------------
test("splits plain rows", () =>
  assert.deepEqual(parseCSV("a,b\n1,2\n"), [["a", "b"], ["1", "2"]]));

test("keeps commas inside quotes", () =>
  assert.deepEqual(parseCSV('name,note\nSalsa,"hot, very"\n'),
    [["name", "note"], ["Salsa", "hot, very"]]));

test("keeps newlines inside quotes", () =>
  assert.deepEqual(parseCSV('a\n"line one\nline two"\n'),
    [["a"], ["line one\nline two"]]));

test("unescapes doubled quotes", () =>
  assert.deepEqual(parseCSV('a\n"she said ""hi"""\n'),
    [["a"], ['she said "hi"']]));

test("tolerates CRLF", () =>
  assert.deepEqual(parseCSV("a,b\r\n1,2\r\n"), [["a", "b"], ["1", "2"]]));

test("keeps a last row with no trailing newline", () =>
  assert.deepEqual(parseCSV("a,b\n1,2"), [["a", "b"], ["1", "2"]]));

test("drops blank rows", () =>
  assert.deepEqual(parseCSV("a,b\n\n , \n1,2\n"), [["a", "b"], ["1", "2"]]));

// --- csvToObjects ---------------------------------------------------------
test("maps headers onto rows", () =>
  assert.deepEqual(csvToObjects("name,heat\nVerde,3\n"),
    [{ name: "Verde", heat: "3" }]));

test("normalises header case and padding", () =>
  assert.deepEqual(csvToObjects("  Name , HEAT \nVerde,3\n"),
    [{ name: "Verde", heat: "3" }]));

test("fills missing trailing cells", () =>
  assert.deepEqual(csvToObjects("name,heat,price\nVerde,3\n"),
    [{ name: "Verde", heat: "3", price: "" }]));

test("drops rows with no name", () =>
  assert.deepEqual(csvToObjects("name,heat\n,4\nVerde,3\n"),
    [{ name: "Verde", heat: "3" }]));

test("returns nothing for a header alone", () =>
  assert.deepEqual(csvToObjects("name,heat\n"), []));

test("returns nothing for junk", () => assert.deepEqual(csvToObjects(""), []));

// --- parseDay -------------------------------------------------------------
// The bug this guards: Date.parse("2026-03-01") is UTC midnight, which renders
// as Feb 28 anywhere west of Greenwich. Everyone reading this page is.
test("lands on the stated day, not the one before", () => {
  const d = parseDay("2026-03-01");
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 2);
  assert.equal(d.getDate(), 1);
});

test("ignores surrounding whitespace", () =>
  assert.equal(parseDay("  2026-03-01 ").getDate(), 1));

test("rejects the wrong shape", () => {
  assert.equal(parseDay("03/01/2026"), null);
  assert.equal(parseDay("2026-03"), null);
  assert.equal(parseDay(""), null);
});

test("rejects a non-date", () => assert.equal(parseDay("no-such-day"), null));

test("rejects a day that does not exist", () => {
  // Date rolls these forward instead of failing, so an unchecked Feb 31 puts
  // a market on Mar 3. The sheet is typed by hand; typos are the normal case.
  assert.equal(parseDay("2026-02-31"), null);
  assert.equal(parseDay("2026-13-01"), null);
  assert.equal(parseDay("2026-00-10"), null);
  assert.equal(parseDay("2025-02-29"), null);      // 2025 is not a leap year
  assert.equal(parseDay("2024-02-29").getDate(), 29); // 2024 is
});

// --- the heat scale -------------------------------------------------------
test("every level has a word, and 0 has none", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(heatWord),
    ["Harmless", "Uneasy", "Uneasy", "Regrettable", "Regrettable", "No survivors"]);
  assert.equal(heatWord(0), "");
  assert.equal(heatWord(7), "");
});

test("jar words and filter labels come from one table", () => {
  // the drift this prevents: a jar reading "Hot" under a button reading "Spicy"
  for (const word of [1, 2, 3, 4, 5, 6].map(heatWord)) {
    const band = BANDS.find((b) => b.label === word);
    assert.ok(band, `jar word "${word}" matches no filter button`);
    assert.equal(bandByKey(band.key).label, word);
  }
});

test("every band except All covers a real heat level", () => {
  for (const band of BANDS.filter((b) => b.key !== "all")) {
    const covered = [1, 2, 3, 4, 5, 6].filter(
      (n) => n >= band.range[0] && n <= band.range[1]);
    assert.ok(covered.length, `${band.label} filters to an empty range`);
    for (const n of covered) assert.equal(heatWord(n), band.label);
  }
});

test("an unknown band key falls back to everything", () => {
  assert.equal(bandByKey("nope").key, "all");
  assert.deepEqual(bandByKey("all").range, [0, 9]);
});
