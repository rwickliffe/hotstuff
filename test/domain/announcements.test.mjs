import assert from "node:assert/strict";
import test from "node:test";

import { announcementFor } from "../../src/domain/announcements.ts";

const now = Date.parse("2026-10-08T12:00:00Z");
const row = (o) => ({ posted: "2026-10-01", headline: "Something", ...o });

test("nothing to say shows nothing", () => {
  assert.equal(announcementFor([], "home", now), null);
  assert.equal(announcementFor(undefined, "home", now), null);
});

test("a row with no headline is not an announcement", () => {
  assert.equal(announcementFor([row({ headline: "   " })], "home", now), null);
});

test("blank priority is an ordinary announcement", () => {
  assert.equal(announcementFor([row({})], "home", now).priority, "normal");
});

test("an unrecognised priority falls back to normal, not urgent", () => {
  const a = announcementFor([row({ priority: "URGENT!!" })], "home", now);
  assert.equal(a.priority, "normal");
});

test("priority is case and space insensitive", () => {
  const a = announcementFor([row({ priority: " Urgent " })], "home", now);
  assert.equal(a.priority, "urgent");
});

test("the loudest row wins, not the newest", () => {
  const a = announcementFor(
    [
      row({
        posted: "2026-10-07",
        headline: "Quiet but new",
        priority: "quiet",
      }),
      row({
        posted: "2026-10-02",
        headline: "Loud but old",
        priority: "urgent",
      }),
    ],
    "home",
    now,
  );
  assert.equal(a.headline, "Loud but old");
});

test("at equal priority the newest wins", () => {
  const a = announcementFor(
    [
      row({ posted: "2026-10-02", headline: "Older" }),
      row({ posted: "2026-10-06", headline: "Newer" }),
    ],
    "home",
    now,
  );
  assert.equal(a.headline, "Newer");
});

test("only urgent reaches pages beyond home", () => {
  const rows = [row({ headline: "Normal" })];
  assert.equal(announcementFor(rows, "home", now).headline, "Normal");
  assert.equal(announcementFor(rows, "everywhere", now), null);

  const loud = [row({ headline: "Urgent", priority: "urgent" })];
  assert.equal(announcementFor(loud, "everywhere", now).headline, "Urgent");
});

test("a past expiry date drops the row", () => {
  assert.equal(
    announcementFor([row({ expires: "2026-10-07" })], "home", now),
    null,
  );
});

test("expiry covers the whole of its last day", () => {
  const a = announcementFor([row({ expires: "2026-10-08" })], "home", now);
  assert.equal(a.headline, "Something");
});

test("blank or unreadable expiry never expires", () => {
  assert.equal(
    announcementFor([row({ expires: "" })], "home", now).posted,
    "2026-10-01",
  );
  assert.equal(
    announcementFor([row({ expires: "whenever" })], "home", now).posted,
    "2026-10-01",
  );
});

test("an expired loud row does not block a live quiet one", () => {
  const a = announcementFor(
    [
      row({ headline: "Gone", priority: "urgent", expires: "2026-10-01" }),
      row({ headline: "Still here", priority: "quiet" }),
    ],
    "home",
    now,
  );
  assert.equal(a.headline, "Still here");
});

test("expiry runs to the end of the day in Texas, not in UTC", () => {
  // 02:00Z on the 9th is still the evening of the 8th at the booth.
  const texasEvening = Date.parse("2026-10-09T02:00:00Z");
  const a = announcementFor(
    [row({ expires: "2026-10-08" })],
    "home",
    texasEvening,
  );
  assert.equal(a.headline, "Something");
});
