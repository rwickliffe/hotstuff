/**
 * HTML escaping, for wherever a string is concatenated into markup.
 *
 * This is exactly what the `escape-html` package does — verified identical on
 * every case tried, including already-escaped input and non-strings — and it
 * stays inline to keep a runtime dependency out of the Worker bundle. Swap in
 * that package if you would rather have it; do not reach for `he`, which
 * entity-encodes every non-ASCII character and would mangle "café".
 *
 * Order matters: `&` is escaped first, or the entities below it get escaped
 * again. The test pins that.
 */
export function esc(s: unknown): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
