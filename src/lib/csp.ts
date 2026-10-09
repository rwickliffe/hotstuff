/** Shared Content-Security-Policy strings.
 *  Keep public/_headers CSP in sync (./check compares them). */

/** /confirm and /compose — no same-origin CSS/JS files. */
export const WORKER_CSP =
  "default-src 'none'; base-uri 'none'; form-action 'self'; " +
  "img-src 'self' data:; " +
  "style-src 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src https://fonts.gstatic.com; " +
  "script-src 'unsafe-inline' https://static.cloudflareinsights.com; " +
  "connect-src 'self'";

/** On-demand catalogue pages — same family as public/_headers. */
export const SITE_CSP =
  "default-src 'none'; base-uri 'none'; form-action 'self'; " +
  // i.ytimg.com serves the video poster frames. Images only: the cards link
  // out to YouTube rather than embedding it, so no frame-src is needed.
  "img-src 'self' data: https://i.ytimg.com; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src https://fonts.gstatic.com; " +
  "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; " +
  "connect-src 'self'";
