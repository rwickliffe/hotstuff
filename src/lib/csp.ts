/** Shared Content-Security-Policy strings for Worker HTML and Astro pages.
 *  Keep public/_headers CSP in sync (./check compares them). */

/** /confirm and /compose — no same-origin CSS/JS files. */
export const WORKER_HTML_CSP =
  "default-src 'none'; base-uri 'none'; form-action 'self'; " +
  "img-src 'self' data:; " +
  "style-src 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src https://fonts.gstatic.com; " +
  "script-src 'unsafe-inline' https://static.cloudflareinsights.com; " +
  "connect-src 'self'";

/** On-demand catalogue pages — same family as public/_headers. */
export const SITE_CSP =
  "default-src 'none'; base-uri 'none'; form-action 'self'; " +
  "img-src 'self' data:; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src https://fonts.gstatic.com; " +
  "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; " +
  "connect-src 'self'";
