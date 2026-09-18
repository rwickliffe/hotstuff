function partsInZone(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value || "0";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
  };
}

/** YYYY-MM-DD in the given IANA timezone. */
export function calendarDay(now: Date, timeZone: string): string {
  const p = partsInZone(now, timeZone);
  return p.year + "-" + p.month + "-" + p.day;
}

/** Seconds remaining until midnight in the given IANA timezone. */
export function secondsUntilMidnight(now: Date, timeZone: string): number {
  const p = partsInZone(now, timeZone);
  return 24 * 3600 - (p.hour * 3600 + p.minute * 60 + p.second);
}
