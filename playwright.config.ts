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
    url: origin,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
