// The how-to videos. Paula and John film them, YouTube hosts them, and this
// page only lists them: the site never serves a byte of video.
//
// Shape mirrors the catalog — the front page shows a few, /videos shows the
// lot — so there is one idea to learn, not two.

import { selectOrFallback } from "../lib/grid.js";
import { isYes, normalizeDay } from "../lib/csv.js";
import { VIDEOS_MAX } from "../site-config.ts";

export type Video = {
  /** The 11-character YouTube id, already validated. */
  id: string;
  title: string;
  blurb: string;
  /** `YYYY-MM-DD`, or "" when the sheet has nothing usable. */
  posted: string;
  featured: boolean;
};

const BARE_ID = /^[A-Za-z0-9_-]{11}$/;

// Whatever they paste out of the browser bar. Asking two people to extract an
// id by hand is asking for a broken row, so take the whole address instead.
const IN_URL =
  /(?:[?&]v=|\/(?:shorts|embed|live|v)\/|youtu\.be\/)([A-Za-z0-9_-]{11})/;

/** The id in `raw`, or null if there isn't one. Never guesses. */
export function youtubeId(raw: string | undefined): string | null {
  const s = (raw || "").trim();
  if (!s) return null;
  if (BARE_ID.test(s)) return s;
  const m = s.match(IN_URL);
  return m ? m[1] : null;
}

/** The poster frame. `hqdefault` is the largest size that always exists. */
export function thumbnailUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

export function watchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

/**
 * Every usable row, newest first. A row without a readable video is dropped
 * rather than rendered as a dead tile; undated rows sort to the back.
 */
export function videoList(rows: Record<string, string>[] | undefined): Video[] {
  return (rows || [])
    .map((r) => ({
      id: youtubeId(r.video),
      title: (r.title || "").trim(),
      blurb: (r.blurb || "").trim(),
      posted: normalizeDay(r.posted) || "",
      featured: isYes(r.featured),
    }))
    .filter((v): v is Video => Boolean(v.id && v.title))
    .sort((a, b) => (b.posted || "").localeCompare(a.posted || ""));
}

/** What the front page shows: whatever is marked featured, else the newest. */
export function recentVideos(
  rows: Record<string, string>[] | undefined,
): Video[] {
  return selectOrFallback(videoList(rows), (v) => v.featured, VIDEOS_MAX);
}
