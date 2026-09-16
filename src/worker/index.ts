// Worker entry. Mail / /data / cron live in api.ts; HTML goes through Astro.
// This module only exports `default` (Static Assets rejects named exports).

import { handle } from "@astrojs/cloudflare/handler";
import { cacheControlForChicago } from "../lib/cache-headers.ts";
import { SITE_CSP } from "../lib/csp.ts";
import api from "./api.ts";

const API = new Set([
  "/data",
  "/contact",
  "/subscribe",
  "/confirm",
  "/compose",
  "/send",
]);

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const path = new URL(req.url).pathname.replace(/\/+$/, "") || "/";
    if (API.has(path)) return api.fetch(req, env, ctx);

    const astroResponse = await handle(req, env, ctx);
    return withSiteHtmlHeaders(astroResponse);
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    return api.scheduled(controller, env, ctx);
  },
};

/** CSP + midnight Cache-Control on Astro HTML only — never on CSS/images. */
function withSiteHtmlHeaders(astroResponse: Response): Response {
  const ct = astroResponse.headers.get("Content-Type") || "";
  if (!ct.includes("text/html")) return astroResponse;

  const apply = (target: Response) => {
    target.headers.set("Content-Security-Policy", SITE_CSP);
    target.headers.set("Cache-Control", cacheControlForChicago());
    target.headers.set("X-Content-Type-Options", "nosniff");
    target.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  };
  try {
    apply(astroResponse);
    return astroResponse;
  } catch {
    const cloned = new Response(astroResponse.body, astroResponse);
    apply(cloned);
    return cloned;
  }
}
