// The demo's own tests: a real browser, real taps. `pnpm test:demo` builds the site and runs them.
// The server is scripts/dev.ts on port 8201, at the site's real address /chikyu-earth/: this package's block of ports is 8200 to 8299.
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.TEST_PORT ?? 8201);
// WebGL is drawn in software, never on the machine's graphics card (the family's rule). kazoku-ui 0.9.1 exports these as `SOFTWARE_GL_ARGS` from `/testing`; this is that list.
const SOFTWARE_GL = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
// The page's own pictures (the line globe, a map, text) are drawn by the CPU, not by the software GPU. With only SOFTWARE_GL, Chromium rasterizes them on the emulated GPU as well, and on the passes page the world map
// alone took 5 to 10 seconds of that GPU's time, in which the page drew no frame and answered no click (MODULES-804: a click took 6 s, and the 5 s waits ran out). WebGL is still drawn in software, by the flags above.
const CPU_RASTER = "--disable-gpu-rasterization";
const COST = "*-cost.gl.ts";
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

export default defineConfig({
  testDir: "e2e",
  globalSetup: "@johnmorrisdotca/kazoku-ui/testing/global-setup",
  // CI splits the Chromium desk and phone suite: DEMO_SET=freeze is the graphics-memory file alone (15 minutes of the 20 the first half took), DEMO_SET=rest is every other file. Left out, every file runs.
  testMatch: process.env.DEMO_SET === "freeze" ? /[\\/]freeze\.demo\.ts$/ : process.env.DEMO_SET === "rest" ? /^(?!.*[\\/]freeze\.demo\.ts$).*\.demo\.(ts|mjs)$/ : "*.demo.{ts,mjs}",
  fullyParallel: true,
  forbidOnly: true,
  workers: process.env.CI ? 1 : 3,
  timeout: 60_000,
  reporter: "list",
  use: { baseURL: `http://127.0.0.1:${port}`, reducedMotion: "reduce", locale: "en-US" },
  webServer: {
    command: "node scripts/dev.ts",
    env: { PORT: String(port), WITHOUT_TILES: "1" },
    url: `http://127.0.0.1:${port}/chikyu-earth/`,
    reuseExistingServer: false,
  },
  projects: [
    // The realistic Earth: Chromium only (WebGL in software), with precise memory readings and gc() for the leak checks. `pnpm test:soak` runs the long one.
    // The page's own pictures are drawn by the CPU here too (CPU_RASTER): the line globe's drag tests took 45 s of their 60 on a busy Mac with them on the emulated GPU, and 12 s with them on the CPU.
    {
      name: "chromium-gl",
      testMatch: "*.gl.ts",
      // the update-cost check is the next project's, so that it runs alone
      testIgnore: COST,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 }, launchOptions: { args: [...SOFTWARE_GL, CPU_RASTER, "--enable-precise-memory-info", "--js-flags=--expose-gc"] } },
    },
    // What the satellites cost a frame in JavaScript, timed by the page's wall clock: run it with nothing beside it (`--workers=1`, after the other projects: `pnpm test:demo`, and its own job in CI), or another browser's drawing takes its CPU and the reading doubles (MODULES-1585).
    {
      name: "chromium-cost",
      testMatch: COST,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 }, launchOptions: { args: [...SOFTWARE_GL, CPU_RASTER, "--enable-precise-memory-info", "--js-flags=--expose-gc"] } },
    },
    {
      name: "soak",
      testMatch: "*.soak.ts",
      timeout: (Number(process.env.SOAK_MINUTES ?? 10) + 4) * 60_000,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 }, launchOptions: { args: [...SOFTWARE_GL, "--enable-precise-memory-info", "--js-flags=--expose-gc"] } },
    },
    { name: "chromium-desk", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 }, launchOptions: { args: [...SOFTWARE_GL, CPU_RASTER] } } },
    { name: "chromium-phone", use: { ...devices["Desktop Chrome"], ...phone, launchOptions: { args: [...SOFTWARE_GL, CPU_RASTER] } } },
    // WebKit on a desktop viewport with touch: `isMobile` is Chromium's to honour.
    { name: "webkit-desk", use: { ...devices["Desktop Safari"], viewport: { width: 1280, height: 900 } } },
    { name: "webkit-phone", use: { ...devices["Desktop Safari"], viewport: phone.viewport, hasTouch: true } },
  ],
});
