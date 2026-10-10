import { defineConfig, devices } from "@playwright/test";

const port = 8787;
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: origin,
    trace: "off",
  },
  webServer: {
    command: `npm run build && npx wrangler dev --port ${port} --ip 127.0.0.1`,
    // The Cloudflare adapter resolves the environment at build time and writes
    // a flattened dist/server/wrangler.json, so `--env` on wrangler is a no-op
    // here. Picking staging is what gives local dev a KV preview_id.
    env: { CLOUDFLARE_ENV: "staging" },
    url: origin,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
