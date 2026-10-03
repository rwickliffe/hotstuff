// How old a timestamp is, and whether that is old enough to say so on the
// page. The catalog's fetchedAt is the only caller today; the wording lives
// in components/DataAge.astro, which is where "List last refreshed" belongs.

/** Old enough to admit it. Well past the hourly cron, so a late run is quiet. */
export const DATA_AGE_STALE_MS = 6 * 60 * 60 * 1000;

export function dataAge(
  fetchedAt: string | null,
  now = Date.now(),
): { stale: boolean; hours: number } {
  if (!fetchedAt) return { stale: false, hours: 0 };
  const t = Date.parse(fetchedAt);
  // No data yet, or a timestamp we cannot read, is not the same as old data.
  if (!Number.isFinite(t)) return { stale: false, hours: 0 };
  const age = now - t;
  return {
    stale: age >= DATA_AGE_STALE_MS,
    hours: Math.round(age / (60 * 60 * 1000)),
  };
}
