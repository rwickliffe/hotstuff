// Short date pieces for the page.
//
// Intl rather than a hand-kept table of month names: the runtime already
// ships them, and timezone.ts formats dates through Intl too. Both formatters
// render in the runtime's own zone, which is why callers build their Date with
// parseDay — local components in, local names out, no UTC shift on the way.

const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const MONTH = new Intl.DateTimeFormat("en-US", { month: "short" });

/** `Sat` */
export function shortWeekday(d: Date): string {
  return WEEKDAY.format(d);
}

/** `Sep` */
export function shortMonth(d: Date): string {
  return MONTH.format(d);
}
