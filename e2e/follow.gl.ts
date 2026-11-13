// follow on the space view: 0 lets the ground drift at the Earth's rate, 1 holds it, a change does not jump the middle, and a stopped clock draws nothing.
import { expect, test, type Page } from "@playwright/test";
import { COUNT_SCRIPT, untilStill } from "./gl.ts";
import { routeElements } from "./recorded.ts";

test.beforeEach(({ page }) => routeElements(page));

const SPACE = "chikyu-space";
const SIDEREAL_DAY = 86_164.0905;

interface Reading {
  time: number;
  lon: number;
  draws: number;
}

const read = (page: Page): Promise<Reading> =>
  page.locator(SPACE).evaluate((el) => {
    const time = Reflect.get(el, "shownTime");
    const lon = Reflect.get(el, "centreLongitude");
    return { time: typeof time === "number" ? time : Number.NaN, lon: typeof lon === "number" ? lon : Number.NaN, draws: (Reflect.get(el, "stats") as { draws: number }).draws };
  });

const apart = (a: number, b: number): number => Math.abs(((((a - b) % 360) + 540) % 360) - 180);

async function open(page: Page): Promise<void> {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/?look=space&time=2026-11-02T18:00Z&speed=0&center=-100,40&follow-ease=0`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await page.locator("kazoku-view-controls").evaluate((el) => {
    const controls = el as HTMLElement & { pause(): void };
    controls.pause();
  });
  await expect.poll(async () => (await read(page)).lon).not.toBeNaN();
  await untilStill(page);
}

test("follow 0 drifts with the Earth, follow 1 holds the ground, and changing it does not jump the middle", async ({ page }) => {
  await open(page);
  await page.locator(SPACE).evaluate((el) => {
    Reflect.set(el, "follow", 0);
    Reflect.set(el, "speed", 86_400);
  });
  const first = await read(page);
  await expect.poll(async () => (await read(page)).time, { timeout: 20_000 }).toBeGreaterThan(first.time + 600_000);
  const second = await read(page);
  const days = (second.time - first.time) / 86_400_000;
  const turned = apart(second.lon, first.lon);
  const rate = turned / ((second.time - first.time) / 1000);
  expect(rate, "the ground drifts at about the Earth's own rate").toBeGreaterThan((360 / SIDEREAL_DAY) * 0.7);
  expect(rate).toBeLessThan((360 / SIDEREAL_DAY) * 1.3);
  expect(days).toBeGreaterThan(0);

  await page.locator(SPACE).evaluate((el) => Reflect.set(el, "speed", 0));
  await untilStill(page);
  const held = await read(page);
  await page.locator(SPACE).evaluate((el) => Reflect.set(el, "follow", 1));
  await expect.poll(async () => (await read(page)).draws, { timeout: 20_000 }).toBeGreaterThan(held.draws);
  const after = await read(page);
  expect(apart(after.lon, held.lon), "changing follow does not jump the middle").toBeLessThan(0.05);

  await page.locator(SPACE).evaluate((el) => Reflect.set(el, "speed", 86_400));
  await expect.poll(async () => (await read(page)).time).toBeGreaterThan(after.time + 600_000);
  const later = await read(page);
  expect(apart(later.lon, after.lon), "follow 1 keeps the longitude under the middle").toBeLessThan(0.2);
});

test("a stopped clock draws nothing once follow has settled", async ({ page }) => {
  await open(page);
  await page.locator(SPACE).evaluate((el) => Reflect.set(el, "follow", 0.4));
  await untilStill(page);
  const drawn = (await read(page)).draws;
  await page.evaluate(async () => {
    for (let frame = 0; frame < 20; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  expect((await read(page)).draws, "nothing is drawn while the clock is stopped").toBe(drawn);
});
