// A satellite's path painted on the Earth: the ISS at an hour a second grows the trail, rest stops it, and Clear or another satellite empties it. Chromium, drawn in software.
import { expect, test, type Page } from "@playwright/test";
import { settle } from "./gl.ts";
import { routeElements } from "./recorded.ts";

test.describe.configure({ mode: "serial" });

const SPACE = "chikyu-space";
const paintPixels = (page: Page): Promise<number> => page.locator(SPACE).evaluate((el) => Reflect.get(el, "paintPixels") as number);
const draws = (page: Page): Promise<number> => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { draws: number }).draws);

async function open(page: Page): Promise<void> {
  await routeElements(page);
  await page.goto("/chikyu-earth/?look=space&time=2026-11-02T18:00Z&speed=0&center=-100,40&sats=stations");
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { satellites: { groups: number } }).satellites.groups), { timeout: 20_000 }).toBe(1);
  await settle(page);
}

const setSpeed = async (page: Page, speed: number): Promise<void> => {
  await page.locator(SPACE).evaluate((el, value) => Reflect.set(el, "speed", value), speed);
};

test("painting the ISS at an hour a second grows the trail, rest stops it, and Clear or another satellite empties it", async ({ page }) => {
  await open(page);
  const before = await draws(page);
  await page.locator(SPACE).evaluate((el) => Reflect.set(el, "paint", { id: "25544", length: "1d" }));
  await expect.poll(() => paintPixels(page), { timeout: 20_000 }).toBeGreaterThan(10);
  const filled = await paintPixels(page);
  await setSpeed(page, 3600);
  await expect.poll(() => paintPixels(page), { timeout: 20_000 }).toBeGreaterThan(filled);
  const moving = await paintPixels(page);
  await setSpeed(page, 0);
  await settle(page);
  const held = await paintPixels(page);
  const drawn = await draws(page);
  await page.waitForTimeout(1000);
  expect(await paintPixels(page), "at rest the trail stops growing").toBe(held);
  expect(await draws(page), "at rest nothing is drawn").toBe(drawn);
  await page.locator(SPACE).evaluate((el) => (el as unknown as { clearPaint(): void }).clearPaint());
  expect(await paintPixels(page)).toBe(0);
  const cleared = await page.locator(SPACE).evaluate((el) => {
    Reflect.set(el, "paint", { id: "stations:1", length: "1d" });
    return Reflect.get(el, "paintPixels") as number;
  });
  expect(cleared, "switching satellite clears the trail before the next frame").toBe(0);
  await setSpeed(page, 3600);
  await expect.poll(() => paintPixels(page), { timeout: 20_000 }).toBeGreaterThan(0);
  expect(moving).toBeGreaterThan(filled);
  expect(before).toBeGreaterThan(0);
});
