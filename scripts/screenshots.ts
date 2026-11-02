// The README and docs pictures: `pnpm screenshots` builds the demo, serves it on 8202 and saves docs/images/*.png.
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const port = 8202;
const server = spawn(process.execPath, ["scripts/dev.ts"], { env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
const out = (name: string) => new URL(`../docs/images/${name}.png`, import.meta.url).pathname;

try {
  await new Promise((resolve) => setTimeout(resolve, 800));
  const browser = await chromium.launch();
  const shots: [string, { width: number; height: number }, string][] = [
    ["line-desk", { width: 1280, height: 900 }, ""],
    ["line-phone", { width: 390, height: 844 }, ""],
  ];
  for (const [name, viewport, query] of shots) {
    const context = await browser.newContext({ viewport, reducedMotion: "reduce", deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/chikyu-earth/${query}`);
    await page.locator("chikyu-earth").evaluate((el) => el.setAttribute("center", "10,30"));
    await page.waitForSelector("chikyu-earth svg");
    await page.waitForTimeout(400);
    await page.screenshot({ path: out(name) });
    await context.close();
  }
  await browser.close();
} finally {
  server.kill();
}
