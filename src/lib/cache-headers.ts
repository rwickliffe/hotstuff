/** Cache-Control for on-demand HTML: min(1 hour, seconds until Chicago midnight). */
export function cacheControlForChicago(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "0";
  const h = Number(get("hour"));
  const min = Number(get("minute"));
  const s = Number(get("second"));
  const secondsUntilMidnight = 24 * 3600 - (h * 3600 + min * 60 + s);
  const maxAge = Math.max(1, Math.min(3600, secondsUntilMidnight));
  // No no-transform — Web Analytics injection may need to transform.
  return `public, max-age=${maxAge}`;
}

/** Pathname-only GET key for `/` and `/products`. Skip ?debug so Paula sees live KV. */
export function htmlCacheKey(req: Request): Request | null {
  if (req.method !== "GET") return null;
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path !== "/" && path !== "/products") return null;
  if (url.searchParams.has("debug")) return null;
  return new Request(new URL(path, url.origin));
}
