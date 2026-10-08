// What Paula and John put at the top of the page, and how loudly.
//
// One row shows at a time. `priority` is the only lever on how visible it is,
// and it moves two things at once: how the band is painted, and how far it
// reaches. Anything the sheet does not recognise is an ordinary announcement,
// so a typo is quiet rather than loud.

import { calendarDay } from "../lib/timezone.ts";
import { MARKET_TZ } from "../site-config.ts";

export type Priority = "quiet" | "normal" | "urgent";

export type Announcement = {
  headline: string;
  posted: string;
  link: string;
  /** Wording for the link, when the sheet gives one. */
  linkText: string;
  priority: Priority;
};

/** Loudest first. The order is the tie-breaker, so it has to be explicit. */
const RANK: Record<Priority, number> = { urgent: 2, normal: 1, quiet: 0 };

/** `urgent` is the only one that follows you off the home page. */
const EVERYWHERE: Priority = "urgent";

function priorityOf(raw: string | undefined): Priority {
  const v = (raw || "").trim().toLowerCase();
  return v === "quiet" || v === "urgent" ? v : "normal";
}

/**
 * Blank never expires. An unparseable date is treated as blank, not as past:
 * a typo should not silently take a notice down.
 *
 * A bare YYYY-MM-DD is compared as text against today's date in Texas, so a
 * notice lives through the end of the day it names. Parsing it instead would
 * make it UTC midnight, which is early evening at the booth — the rain notice
 * would disappear while the market was still rained out.
 */
function live(
  row: Record<string, string>,
  now: number,
  today: string,
): boolean {
  const raw = (row.expires || "").trim();
  if (!raw) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw >= today;
  const end = Date.parse(raw);
  return Number.isFinite(end) ? end >= now : true;
}

/**
 * The row to show on `page`, or null. Loudest unexpired row wins; ties go to
 * the most recently posted, so pushing a second urgent row replaces the first
 * without anyone having to delete it.
 */
export function announcementFor(
  rows: Record<string, string>[] | undefined,
  page: "home" | "other",
  now = Date.now(),
): Announcement | null {
  const today = calendarDay(new Date(now), MARKET_TZ);
  const showing = (rows || [])
    .filter((r) => r.headline?.trim() && live(r, now, today))
    .map((r) => ({
      headline: r.headline.trim(),
      posted: (r.posted || "").trim(),
      link: (r.link || "").trim(),
      linkText: (r.link_text || "").trim() || "More",
      priority: priorityOf(r.priority),
    }))
    .filter((a) => page === "home" || a.priority === EVERYWHERE);

  if (!showing.length) return null;
  showing.sort(
    (a, b) =>
      RANK[b.priority] - RANK[a.priority] ||
      (Date.parse(b.posted) || 0) - (Date.parse(a.posted) || 0),
  );
  return showing[0];
}
