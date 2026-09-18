/* Checks on the pure CSV functions.
 *
 * These are the real shipped functions, imported rather than copied, so there
 * is no second version to drift. Rename one and this file stops resolving.
 *
 * Only pure functions belong here: no DOM, no fetch, no clock.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { csvToObjects, isYes, normalizeDay, parseCSV, parseDay } from "../../src/lib/csv.js";

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

test("keeps rows with no name", () =>
  assert.deepEqual(csvToObjects("name,heat\n,4\nVerde,3\n"),
    [{ name: "", heat: "4" }, { name: "Verde", heat: "3" }]));

test("sold out is not a yes", () =>
  assert.equal(isYes("sold out"), false));

test("returns nothing for a header alone", () =>
  assert.deepEqual(csvToObjects("name,heat\n"), []));

test("returns nothing for junk", () => assert.deepEqual(csvToObjects(""), []));

// --- normalizeDay / parseDay ----------------------------------------------
// The bug this guards: Date.parse("2026-03-01") is UTC midnight, which renders
// as Feb 28 anywhere west of Greenwich. Everyone reading this page is.
test("lands on the stated day, not the one before", () => {
  const d = parseDay("2026-03-01");
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 2);
  assert.equal(d.getDate(), 1);
});

test("normalizeDay zero-pads and returns the same day", () =>
  assert.equal(normalizeDay("2026-3-1"), "2026-03-01"));

test("ignores surrounding whitespace", () =>
  assert.equal(parseDay("  2026-03-01 ").getDate(), 1));

test("rejects the wrong shape", () => {
  assert.equal(parseDay("03/01/2026"), null);
  assert.equal(parseDay("2026-03"), null);
  assert.equal(parseDay(""), null);
  assert.equal(normalizeDay("03/01/2026"), null);
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
  assert.equal(normalizeDay("2026-02-31"), null);
});
