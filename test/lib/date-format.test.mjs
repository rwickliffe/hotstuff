import assert from "node:assert/strict";
import test from "node:test";

import { shortMonth, shortWeekday } from "../../src/lib/date-format.ts";

// These names are read off the page, so a locale or ICU change that quietly
// turned "Sep" into "Sept" would be a visible regression. Pin both tables.
test("months are the three-letter forms the page expects", () => {
  const names = Array.from({ length: 12 }, (_, m) =>
    shortMonth(new Date(2026, m, 15)),
  );
  assert.deepEqual(names, [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ]);
});

test("weekdays are the three-letter forms the page expects", () => {
  // 2026-02-01 is a Sunday.
  const names = Array.from({ length: 7 }, (_, i) =>
    shortWeekday(new Date(2026, 1, 1 + i)),
  );
  assert.deepEqual(names, ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
});

test("formatting reads the local calendar date, not UTC", () => {
  // Built from local components, so late-evening dates must not roll back.
  const lateEvening = new Date(2026, 8, 30, 23, 30);
  assert.equal(shortMonth(lateEvening), "Sep");
});
