// The camera of the realistic Earth (MODULES-849): held over the ground, in the stars, or on the Sun's side. The Earth turns beneath the one in the stars, and the day and night line is where the Sun really puts it.
import { expect, test, type Page } from "@playwright/test";
import { settle } from "./gl.ts";

const EARTH = "chikyu-earth-realistic";
const T0 = Date.UTC(2026, 10, 2, 12);
/** The sidereal rate: degrees the Earth turns in an hour against the stars. */
const DEGREES_PER_HOUR = 15.0411;

interface Pose {
  lon: number;
  lat: number;
}
const poseOf = (page: Page): Promise<Pose> => page.locator(EARTH).evaluate((el) => Reflect.get(el, "overlay").pose as Pose);
const stateOf = (page: Page): Promise<{ draws: number }> => page.locator(EARTH).evaluate((el) => Reflect.get(el, "stats") as { draws: number });

async function open(page: Page, camera: string): Promise<void> {
  await page.goto(`/chikyu-earth/?look=realistic&camera=${camera}&time=${new Date(T0).toISOString()}&speed=0&center=10,30`);
  await page.locator(`${EARTH}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => (await stateOf(page)).draws).toBeGreaterThan(0);
  await settle(page);
}

/** Let the clock run for a moment at 6 hours a second, then hold it: the moment the Earth was drawn at is the one it holds. Returns the hours that passed. */
async function runThenHold(page: Page): Promise<number> {
  const before = await page.locator(EARTH).evaluate((el) => Reflect.get(el, "time") as number);
  await page.locator(EARTH).evaluate((el) => Reflect.set(el, "speed", 21_600));
  await page.waitForTimeout(1500);
  await page.locator(EARTH).evaluate((el) => Reflect.set(el, "speed", 0));
  await settle(page, 900);
  const after = await page.locator(EARTH).evaluate((el) => Reflect.get(el, "time") as number);
  return (after - before) / 3_600_000;
}

test("held in the stars, the longitude the camera looks at goes west with the Earth's turn", async ({ page }) => {
  await open(page, "space");
  const start = await poseOf(page);
  expect(start.lon).toBeCloseTo(10, 1);
  const hours = await runThenHold(page);
  expect(hours).toBeGreaterThan(2);
  const end = await poseOf(page);
  const expected = 10 - hours * DEGREES_PER_HOUR;
  const wrap = (degrees: number): number => ((((degrees + 180) % 360) + 360) % 360) - 180;
  expect(Math.abs(wrap(end.lon - expected)), `looks at ${end.lon}, expected ${wrap(expected)} after ${hours} hours`).toBeLessThan(1.5);
  expect(end.lat).toBeCloseTo(30, 1);
});

test("held on the ground, the camera stays over the same place while the clock runs", async ({ page }) => {
  await open(page, "ground");
  await runThenHold(page);
  const end = await poseOf(page);
  expect(end.lon).toBeCloseTo(10, 1);
  expect(end.lat).toBeCloseTo(30, 1);
});

test("held on the Sun's side, the camera follows the Sun's own place and the day and night line stays on the screen", async ({ page }) => {
  await open(page, "sun");
  const start = await poseOf(page);
  await runThenHold(page);
  const end = await poseOf(page);
  // the longitude it looks at goes west with the Sun, 15 degrees an hour
  const moved = (((end.lon - start.lon + 540) % 360) + 360) % 360 - 180;
  expect(Math.abs(moved)).toBeGreaterThan(20);
  const asked = await page.locator(EARTH).evaluate((el) => Reflect.get(el, "camera"));
  expect(asked).toBe("sun");
});

test("the camera is one of three words, and anything else is the camera in the stars", async ({ page }) => {
  await open(page, "nonsense");
  expect(await page.locator(EARTH).evaluate((el) => Reflect.get(el, "camera"))).toBe("space");
  await page.locator(EARTH).evaluate((el) => el.setAttribute("camera", "ground"));
  expect(await page.locator(EARTH).evaluate((el) => Reflect.get(el, "camera"))).toBe("ground");
});
