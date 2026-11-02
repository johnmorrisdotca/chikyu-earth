// The demo's own tests: a real browser, real taps. `pnpm test:demo` builds the site and runs them.
// The server is scripts/dev.ts on port 8201, at the site's real address /chikyu-earth/: this package's block of ports is 8200 to 8299.
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.TEST_PORT ?? 8201);
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.demo.{ts,mjs}",
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
    // The realistic Earth: Chromium only (WebGL in software), with precise memory readings and gc() for the leak checks. `pnpm test:soak` runs the long one.
    {
      name: "chromium-gl",
      testMatch: "*.gl.ts",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 }, launchOptions: { args: ["--enable-precise-memory-info", "--js-flags=--expose-gc"] } },
    },
    {
      name: "soak",
      testMatch: "*.soak.ts",
      timeout: (Number(process.env.SOAK_MINUTES ?? 10) + 4) * 60_000,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 }, launchOptions: { args: ["--enable-precise-memory-info", "--js-flags=--expose-gc"] } },
    },
    { name: "chromium-desk", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "chromium-phone", use: { ...devices["Desktop Chrome"], ...phone } },
    // WebKit on a desktop viewport with touch: `isMobile` is Chromium's to honour.
    { name: "webkit-desk", use: { ...devices["Desktop Safari"], viewport: { width: 1280, height: 900 } } },
    { name: "webkit-phone", use: { ...devices["Desktop Safari"], viewport: phone.viewport, hasTouch: true } },
  ],
});
