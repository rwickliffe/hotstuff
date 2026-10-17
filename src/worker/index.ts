// Worker entry. Mail / /data / cron live in api.ts; HTML goes through Astro.
// This module only exports `default` (Static Assets rejects named exports).

import { handle } from "@astrojs/cloudflare/handler";
import {
  cacheablePath,
  dailyCacheControl,
  htmlCacheKey,
} from "../lib/html-cache.ts";
import { SITE_CSP } from "../lib/csp.ts";
import { CACHEABLE_PATHS, DEBUG_PARAM, MARKET_TZ } from "../site-config.ts";
import { readCatalog, type CatalogContext } from "./catalog.ts";
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
  async fetch(
    req: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const path = new URL(req.url).pathname.replace(/\/+$/, "") || "/";
    if (API.has(path)) return api.fetch(req, env, ctx);

    // The key carries both things that can make cached HTML wrong: the
    // catalog generation, moved by a refresh, and the deployed version id,
    // moved by a deploy. Either one retires every older entry in every data
    // center at once. The generation is the fetchedAt of the very catalog the
    // page then renders from (handed over on the context), never a second KV
    // key: KV does not order reads across keys, so a pointer can run ahead of
    // the payload it names. Only cacheable paths pay the KV lookup.
    const cachePath = cacheablePath(req, CACHEABLE_PATHS, DEBUG_PARAM);
    let cacheKey: Request | null = null;
    if (cachePath) {
      try {
        const catalog = await readCatalog(env);
        const code = env.CF_VERSION_METADATA.id;
        cacheKey = htmlCacheKey(
          new URL(req.url).origin,
          cachePath,
          `${code}:${catalog.fetchedAt ?? "none"}`,
        );
        // The adapter's createLocals hands this very object to the page as
        // locals.cfContext, so a property on it is the whole handover.
        (ctx as CatalogContext).catalog = catalog;
      } catch {
        // KV or the version binding unreachable: render rather than risk
        // pinning HTML under a key no refresh will move.
        cacheKey = null;
      }
      if (cacheKey) {
        const hit = await caches.default.match(cacheKey);
        if (hit) return hit;
      }
    }

    const astroResponse = withSiteHtmlHeaders(await handle(req, env, ctx));
    if (cacheKey && astroResponse.ok) {
      ctx.waitUntil(caches.default.put(cacheKey, astroResponse.clone()));
    }
    return astroResponse;
  },

  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    return api.scheduled(controller, env, ctx);
  },
};

/** CSP + midnight Cache-Control on Astro HTML only — never on CSS/images. */
function withSiteHtmlHeaders(astroResponse: Response): Response {
  const ct = astroResponse.headers.get("Content-Type") || "";
  if (!ct.includes("text/html")) return astroResponse;

  const apply = (target: Response) => {
    target.headers.set("Content-Security-Policy", SITE_CSP);
    target.headers.set(
      "Cache-Control",
      dailyCacheControl(new Date(), MARKET_TZ),
    );
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
