// The full-screen page (MODULES-843, 849): the realistic Earth filling the window on a dark page, the wheel zooming, every satellite group at once inside the frame budget.
import { checkGestures } from "@johnmorrisdotca/kazoku-ui/testing";
import { expect, test, type Page } from "@playwright/test";
import { ATMOSPHERE_OUTER, discRadius } from "../src/realistic/earth.ts";
import { COUNT_SCRIPT, readCounts, settle } from "./gl.ts";

const EARTH = "chikyu-earth-realistic";
const NOV10 = "2026-11-10T04:00Z";
interface Stats {
  state: string;
  draws: number;
  contexts: number;
  canvas: { width: number; height: number; pixels: number };
  satellites: { groups: number; placed: number; maxUpdateMs: number; averageUpdateMs: number };
}
const statsOf = (page: Page): Promise<Stats> => page.locator(EARTH).evaluate((el) => Reflect.get(el, "stats") as Stats);
const zoomOf = (page: Page): Promise<number> => page.locator("kazoku-view-controls").evaluate((el) => (Reflect.get(el, "state") as { zoom: number }).zoom);

async function open(page: Page, query: string): Promise<void> {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/fullscreen.html?${query}`);
  await page.locator(`${EARTH}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => (await statsOf(page)).draws).toBeGreaterThan(0);
  await settle(page);
}

test("the element fills the window in any shape, and the glow of the air is inside it at Fit", async ({ page }) => {
  for (const [width, height] of [
    [1280, 900],
    [900, 1280],
  ] as const) {
    await page.setViewportSize({ width, height });
    await open(page, `time=${NOV10}&speed=0`);
    const box = (await page.locator(EARTH).boundingBox())!;
    expect([box.width, box.height]).toEqual([width, height]);
    // the disc and its glow fit the shorter side
    expect(discRadius(width, height, 1) * ATMOSPHERE_OUTER).toBeLessThanOrEqual(Math.min(width, height) / 2);
  }
});

test("a plain wheel zooms the view and never scrolls the page; Ctrl and the wheel still zoom as the family's hands say", async ({ page }) => {
  await open(page, `time=${NOV10}&speed=0`);
  const box = (await page.locator(EARTH).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const before = await zoomOf(page);
  await page.mouse.wheel(0, -300);
  await expect.poll(() => zoomOf(page)).toBeGreaterThan(before * 1.2);
  const zoomed = await zoomOf(page);
  await page.mouse.wheel(0, 600);
  await expect.poll(() => zoomOf(page)).toBeLessThan(zoomed);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const now = await zoomOf(page);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await expect.poll(() => zoomOf(page)).toBeGreaterThan(now);
});

test("a drag anywhere on the full-screen view turns it", async ({ page }) => {
  await open(page, `time=${NOV10}&speed=0&camera=ground&center=0,0`);
  const turned = (): Promise<number> => page.locator("kazoku-view-controls").evaluate((el) => (Reflect.get(el, "state") as { yaw: number }).yaw);
  const before = await turned();
  // from a corner, far from the Earth's disc
  await page.mouse.move(60, 200);
  await page.mouse.down();
  await page.mouse.move(260, 200, { steps: 8 });
  await page.mouse.up();
  await expect.poll(turned).not.toBe(before);
});

test("the family's gesture check is green on the full-screen page", async ({ page }) => {
  // thirteen gestures one after another, each with screenshots drawn in software GL: a minute on a loaded runner is its normal length, so the test is given room, and a slow run is not read as failed gestures
  test.setTimeout(240_000);
  await open(page, `time=${NOV10}&speed=0&camera=ground&center=-100,40`);
  const report = await checkGestures(page, EARTH, { lacks: { "wheel-pan": "in a full-screen view the plain wheel zooms (the immersive mode); the wheel's pan is the family's rule for a view inside a page" } });
  expect(report.filter((r) => r.result === "lacks").map((r) => r.gesture)).toEqual(["wheel-pan"]);
});

test("every satellite group at once: one context, a capped canvas, and the placing inside the frame budget", async ({ page }) => {
  await open(page, `time=${NOV10}&speed=0&sats=all`);
  await expect.poll(async () => (await statsOf(page)).satellites.groups, { timeout: 60_000 }).toBeGreaterThanOrEqual(10);
  await expect.poll(async () => (await statsOf(page)).satellites.placed, { timeout: 60_000 }).toBeGreaterThan(3000);
  await settle(page, 1500);
  const stats = await statsOf(page);
  expect((await readCounts(page)).contexts).toBe(1);
  expect(stats.canvas.pixels).toBeLessThanOrEqual(6_000_000);
  // a draw's placing of every satellite fits the 33 ms of a 30 frame second (the first one makes the batch)
  expect(stats.satellites.averageUpdateMs, "the average placing").toBeLessThan(33);
});

test("with every group shown and the clock running the page draws at most 30 times a second, and a held clock draws nothing", async ({ page }) => {
  await open(page, `time=${NOV10}&speed=60&sats=all`);
  await expect.poll(async () => (await statsOf(page)).satellites.placed, { timeout: 60_000 }).toBeGreaterThan(3000);
  await settle(page, 1000);
  const a = (await statsOf(page)).draws;
  await page.waitForTimeout(3000);
  const b = (await statsOf(page)).draws;
  expect((b - a) / 3, "draws a second").toBeLessThanOrEqual(31);
  await page.locator("#play").click();
  await settle(page, 1200);
  const held = (await statsOf(page)).draws;
  await page.waitForTimeout(2500);
  expect((await statsOf(page)).draws, "nothing drawn while held").toBe(held);
});
