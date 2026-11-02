// The embed page on the realistic look: one WebGL context, a canvas inside its budget, nothing drawn once it rests.
import { expect, test } from "@playwright/test";
import { COUNT_SCRIPT, counts, EARTH, NOON, settle, statsOf } from "./gl.ts";

test("the realistic embed is one context, a capped canvas, and rests", async ({ page }) => {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/embed.html?look=realistic&time=${NOON}&center=10,20`);
  await page.locator(`${EARTH}[data-state=live]`).waitFor();
  await expect.poll(async () => (await statsOf(page)).draws).toBeGreaterThan(0);
  await settle(page);
  const stats = await statsOf(page);
  expect(stats.contexts).toBe(1);
  expect(stats.canvas.width).toBeLessThanOrEqual(4096);
  expect(stats.canvas.height).toBeLessThanOrEqual(4096);
  expect(stats.canvas.pixels).toBeLessThanOrEqual(6_000_000);
  expect(await page.locator("canvas").count()).toBeLessThanOrEqual(2);
  const drawn = stats.draws;
  await page.waitForTimeout(1500);
  expect((await statsOf(page)).draws).toBe(drawn);
  expect((await counts(page)).contexts).toBeLessThanOrEqual(1);
});
