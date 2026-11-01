// The demo's own tests: a real browser, real taps. `pnpm test:demo` builds the site and runs them.
// The server is scripts/dev.ts on port 8001, at the site's real address /chikyu-earth/: this package's block of ports is 8000 to 8099.
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.TEST_PORT ?? 8001);
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.demo.ts",
  fullyParallel: true,
  forbidOnly: true,
  workers: process.env.CI ? 1 : 3,
  timeout: 60_000,
  reporter: "list",
  use: { baseURL: `http://127.0.0.1:${port}`, reducedMotion: "reduce", locale: "en-US" },
  webServer: {
    command: "node scripts/dev.ts",
    env: { PORT: String(port) },
    url: `http://127.0.0.1:${port}/chikyu-earth/`,
    reuseExistingServer: false,
  },
  projects: [
    { name: "chromium-desk", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "chromium-phone", use: { ...devices["Desktop Chrome"], ...phone } },
  ],
});
