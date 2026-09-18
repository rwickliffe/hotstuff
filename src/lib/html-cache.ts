import { secondsUntilMidnight } from "./timezone.ts";

/** Cache-Control for on-demand HTML: min(1 hour, seconds until midnight). */
export function dailyCacheControl(now: Date, timeZone: string): string {
  const maxAge = Math.max(1, Math.min(3600, secondsUntilMidnight(now, timeZone)));
  // No no-transform — Web Analytics injection may need to transform.
  return `public, max-age=${maxAge}`;
}

/** Pathname-only GET key for the given paths. Skip skipParam so that view stays live. */
export function htmlCacheKey(
  req: Request,
  cacheablePaths: string[],
  skipParam: string
): Request | null {
  if (req.method !== "GET") return null;
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const wanted = cacheablePaths.map((p) => p.replace(/\/+$/, "") || "/");
  if (!wanted.includes(path)) return null;
  if (url.searchParams.has(skipParam)) return null;
  return new Request(new URL(path, url.origin));
}
