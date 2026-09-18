import assert from "node:assert/strict";
import test from "node:test";

import {
  HEAT_BANDS,
  heatBandByKey,
  heatWord,
} from "../../src/domain/heat-scale.js";

test("every level has a word, and 0 has none", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(heatWord), [
    "Harmless",
    "Uneasy",
    "Uneasy",
    "Regrettable",
    "Regrettable",
    "No survivors",
  ]);
  assert.equal(heatWord(0), "");
  assert.equal(heatWord(7), "");
});

test("jar words and filter labels come from one table", () => {
  // the drift this prevents: a jar reading "Hot" under a button reading "Spicy"
  for (const word of [1, 2, 3, 4, 5, 6].map(heatWord)) {
    const band = HEAT_BANDS.find((b) => b.label === word);
    assert.ok(band, `jar word "${word}" matches no filter button`);
    assert.equal(heatBandByKey(band.key).label, word);
  }
});

test("every band except All covers a real heat level", () => {
  for (const band of HEAT_BANDS.filter((b) => b.key !== "all")) {
    const covered = [1, 2, 3, 4, 5, 6].filter(
      (n) => n >= band.range[0] && n <= band.range[1],
    );
    assert.ok(covered.length, `${band.label} filters to an empty range`);
    for (const n of covered) assert.equal(heatWord(n), band.label);
  }
});

test("an unknown band key falls back to everything", () => {
  assert.equal(heatBandByKey("nope").key, "all");
  assert.deepEqual(heatBandByKey("all").range, [0, 9]);
});
