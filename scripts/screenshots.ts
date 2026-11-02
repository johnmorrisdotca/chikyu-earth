// The README and docs pictures: `pnpm screenshots` builds the demo, serves it on 8202 and saves docs/images/*.png.
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const port = 8202;
const server = spawn(process.execPath, ["scripts/dev.ts"], { env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
const out = (name: string) => new URL(`../docs/images/${name}.png`, import.meta.url).pathname;

try {
  await new Promise((resolve) => setTimeout(resolve, 800));
  const browser = await chromium.launch();
  const shots: [string, { width: number; height: number }, string, string?][] = [
    ["line-desk", { width: 1280, height: 900 }, ""],
    ["line-phone", { width: 390, height: 844 }, ""],
    ["realistic-desk", { width: 1280, height: 900 }, "?look=realistic&time=2026-11-02T04:30Z&center=125,30"],
    ["realistic-phone", { width: 390, height: 844 }, "?look=realistic&time=2026-06-21T10:40Z&center=20,10"],
    ["realistic-zoom", { width: 1280, height: 900 }, "?look=realistic&time=2026-11-02T04:30Z&center=139.7,35.7&zoom=3"],
    ["markers-desk", { width: 1280, height: 900 }, "?look=realistic&time=2026-06-21T10:30Z&center=12,46&zoom=2.4"],
    ["markers-flat", { width: 1280, height: 900 }, "?center=12,46&zoom=2.4&look=thick"],
    ["space-earth", { width: 1280, height: 900 }, "?look=space&time=2026-11-02T14:00Z&speed=0&center=-100,40"],
    ["space-moon", { width: 1280, height: 900 }, "?look=space&time=2026-11-02T14:00Z&speed=0&center=-100,40", "Moon"],
    ["space-solar", { width: 1280, height: 900 }, "?look=space&time=2026-11-02T14:00Z&speed=0&center=-100,40", "Solar system"],
    ["space-true", { width: 1280, height: 900 }, "?look=space&time=2026-11-02T14:00Z&speed=0&center=-100,40&scale=true", "Moon"],
    ["realistic-night", { width: 1280, height: 900 }, "?look=realistic&time=2026-11-02T22:00Z&center=10,45&zoom=1.4"],
  ];
  for (const [name, viewport, query, jump] of shots) {
    const context = await browser.newContext({ viewport, reducedMotion: "reduce", deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/chikyu-earth/${query}`);
    if (query === "") {
      await page.locator("chikyu-earth").evaluate((el) => el.setAttribute("center", "10,30"));
      await page.waitForSelector("chikyu-earth svg");
    } else if (name.startsWith("space")) {
      await page.waitForSelector("chikyu-space[data-state=live]");
      if (jump) await page.getByRole("button", { name: jump, exact: true }).click();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(2500);
    } else if (name === "markers-flat") {
      await page.waitForSelector("chikyu-earth svg");
    } else {
      await page.waitForSelector("chikyu-earth-realistic[data-state=live]");
      await page.waitForTimeout(2500);
    }
    await page.waitForTimeout(400);
    await page.screenshot({ path: out(name) });
    await context.close();
  }
  await browser.close();
} finally {
  server.kill();
}
