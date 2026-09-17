// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  // No Astro Sessions — do not auto-provision a SESSION KV namespace.
  session: false,
  adapter: cloudflare({
    // No Cloudflare Images binding; we do not transform photos.
    imageService: "passthrough",
  }),
  // Global CSS stays one file — no scoped styles (see phase 4 plan).
});
