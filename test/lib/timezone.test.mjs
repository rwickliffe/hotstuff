import assert from "node:assert/strict";
import test from "node:test";

import { calendarDay, secondsUntilMidnight } from "../../src/lib/timezone.ts";
import { MARKET_TZ } from "../../src/site-config.ts";

// 16 Sep 2026 is CDT (UTC-5). Times below are wall-clock in MARKET_TZ.

test("calendar day is still the 16th at 23:59", () => {
  // 23:59:59 CDT 16 Sep = 04:59:59 UTC 17 Sep. UTC midnight would already
  // have dropped a 16 Sep market.
  const now = new Date("2026-09-17T04:59:59.000Z");
  assert.equal(calendarDay(now, MARKET_TZ), "2026-09-16");
});

test("midnight is a new calendar day", () => {
  assert.equal(
    calendarDay(new Date("2026-09-17T05:00:00.000Z"), MARKET_TZ),
    "2026-09-17"
  );
});

test("seconds until midnight at noon is twelve hours", () => {
  assert.equal(
    secondsUntilMidnight(new Date("2026-09-16T17:00:00.000Z"), MARKET_TZ),
    12 * 3600
  );
});

test("seconds until midnight in the last minute", () => {
  assert.equal(
    secondsUntilMidnight(new Date("2026-09-17T04:59:01.000Z"), MARKET_TZ),
    59
  );
  assert.equal(
    secondsUntilMidnight(new Date("2026-09-17T04:59:59.000Z"), MARKET_TZ),
    1
  );
});
