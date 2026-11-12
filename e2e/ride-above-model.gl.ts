// Riding above a satellite with a model: at 150 km the station is drawn as the page's model, as in the follow view, and nothing is drawn at rest. Chromium, drawn in software.
import { expect, test, type Page } from "@playwright/test";
import { routeElements } from "./recorded.ts";

test.use({ reducedMotion: "reduce" });

const SPACE = "chikyu-space";
const stats = (page: Page): Promise<{ draws: number; followModel: { x: number; y: number; shown: boolean; parts: number } | null }> =>
  page.locator(SPACE).evaluate((el) => Reflect.get(el, "stats") as { draws: number; followModel: { x: number; y: number; shown: boolean; parts: number } | null });

test("above at 150 km: the station is drawn as the page's model, in the middle of the picture", async ({ page }) => {
  await routeElements(page);
  await page.goto("/chikyu-earth/?look=space&time=2026-11-02T18:00Z&speed=0&sats=stations&ride=iss&rview=above&light=lit");
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => (await page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { ride: { riding: boolean } }).ride)).riding, { timeout: 30_000 }).toBe(true);
  await page.locator(SPACE).evaluate((el) => {
    const space = el as unknown as { riding: { target: { group: string; index: number } }; ride(ref: unknown, options: unknown): void };
    space.ride(space.riding.target, { view: "above", distanceKm: 150 });
  });
  await expect.poll(async () => (await stats(page)).followModel, { timeout: 60_000, message: "the model is made and drawn above the satellite" }).not.toBeNull();
  const at = (await stats(page)).followModel!;
  expect(at.shown).toBe(true);
  expect(at.parts, "the model has parts").toBeGreaterThan(0);
  const box = (await page.locator(SPACE).boundingBox())!;
  expect(Math.hypot(at.x - box.width / 2, at.y - box.height / 2), "in the middle of the picture").toBeLessThan(3);
});
