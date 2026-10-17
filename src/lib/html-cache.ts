import { secondsUntilMidnight } from "./timezone.ts";

/** Cache-Control for on-demand HTML: min(1 hour, seconds until midnight). */
export function dailyCacheControl(now: Date, timeZone: string): string {
  const maxAge = Math.max(
    1,
    Math.min(3600, secondsUntilMidnight(now, timeZone)),
  );
  // No no-transform — Web Analytics injection may need to transform.
  return `public, max-age=${maxAge}`;
}

/**
 * The normalized path when this request may be served from the HTML cache,
 * or null. Separate from the key so a caller can skip reading its version
 * pointer for requests that would never be cached.
 */
export function cacheablePath(
  req: Request,
  cacheablePaths: string[],
  skipParam: string,
): string | null {
  if (req.method !== "GET") return null;
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const wanted = cacheablePaths.map((p) => p.replace(/\/+$/, "") || "/");
  if (!wanted.includes(path)) return null;
  if (url.searchParams.has(skipParam)) return null;
  return path;
}

/**
 * Cache key for one version of one page. The version is the data the page was
 * rendered from, so a write makes every older key unreachable in every data
 * center — no purge, and no assumption about when the next write lands.
 */
export function htmlCacheKey(
  origin: string,
  path: string,
  version: string,
): Request {
  const url = new URL(path, origin);
  url.searchParams.set("v", version);
  return new Request(url);
}
