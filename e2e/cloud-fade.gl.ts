// The clouds fade out when the view is close, so the sharp ground shows: the cloud picture is one whole-Earth map at most 2048 across, drawn over the finer tiles. Whole at the whole-Earth view,
// gone where a pixel is about a kilometre of ground, kept by `cloud-fade="off"`, moved by a number, and nothing drawn at rest. On both elements, in software GL.
import { expect, test, type Page } from "@playwright/test";
import { DOWNGRADE_AFTER_MS } from "../src/realistic/textures.ts";
import { MOON_KEEP_MS } from "../src/space/scene.ts";
import { drawsAtRest, EARTH, NOON, openEarth, statsOf, untilArrived } from "./gl.ts";
import { routeElements } from "./recorded.ts";
import { routeTiles } from "./tiles-fixture.ts";

test.describe.configure({ mode: "serial" });

const SPACE = "chikyu-space";
const shown = (page: Page, element: string): Promise<number> => page.locator(element).evaluate((el) => (Reflect.get(el, "stats") as { cloudFade: number }).cloudFade);
const setFade = (page: Page, element: string, value: string | null): Promise<void> =>
  page.locator(element).evaluate((el, fade) => (fade === null ? el.removeAttribute("cloud-fade") : el.setAttribute("cloud-fade", fade)), value);

const setView = (page: Page, zoom: number): Promise<void> =>
  page.locator(EARTH).evaluate((el, v) => (el as unknown as { setView(v: unknown, final: boolean): void }).setView(v, true), { yaw: 0, tilt: 0, zoom, panX: 0, panY: 0 });
/** The zoom that gives the disc this radius in CSS pixels (the pixel ratio is 1 here). */
const zoomFor = async (page: Page, radius: number): Promise<number> => {
  const box = (await page.locator(EARTH).boundingBox())!;
  return radius / (Math.min(box.width, box.height) / 2 / 1.08 - 1);
};

test("the realistic Earth: whole clouds far, gone close, kept by off, moved by a number, and nothing drawn at rest", async ({ page }) => {
  await routeTiles(page);
  await openEarth(page, `time=${NOON}&center=0,23`);
  expect(await shown(page, EARTH), "the whole Earth: the clouds are whole").toBe(1);

  // a texel of the 2048 cloud picture is 16 pixels wide at a radius of 5215 pixels: about 1.2 km of ground a pixel
  await setView(page, await zoomFor(page, 5200));
  await expect.poll(() => shown(page, EARTH), { message: "close: the clouds are gone" }).toBeLessThan(0.01);
  const rest = await drawsAtRest(page, EARTH);
  await page.waitForTimeout(1000);
  expect((await statsOf(page)).draws, "faded and at rest: nothing is drawn").toBe(rest);

  await setView(page, await zoomFor(page, 1500));
  await expect.poll(() => shown(page, EARTH), { message: "half way in: partly there" }).toBeGreaterThan(0.5);
  expect(await shown(page, EARTH)).toBeLessThan(1);

  await setView(page, await zoomFor(page, 5200));
  await setFade(page, EARTH, "off");
  await expect.poll(() => shown(page, EARTH), { message: "cloud-fade=off keeps them" }).toBe(1);
  await setFade(page, EARTH, "4");
  await setView(page, await zoomFor(page, 1500));
  await expect.poll(() => shown(page, EARTH), { message: "a width of 4 has them gone sooner" }).toBeLessThan(0.3);
  await setFade(page, EARTH, null);
  await expect.poll(() => shown(page, EARTH), { message: "left out, the default again" }).toBeGreaterThan(0.5);
});

test("the space view: whole clouds from far, gone 150 km up, kept by off, and nothing drawn at rest", async ({ page }) => {
  await routeTiles(page);
  await routeElements(page);
  await page.goto("/chikyu-earth/?look=space&time=2026-11-02T18:00Z&speed=0&sats=stations&ride=iss&rview=above&light=lit");
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => (await page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { ride: { riding: boolean } }).ride)).riding, { timeout: 30_000 }).toBe(true);
  const rideAt = (km: number): Promise<void> =>
    page.locator(SPACE).evaluate((el, distanceKm) => {
      const space = el as unknown as { riding: { target: { group: string; index: number } }; ride(ref: unknown, options: unknown): void };
      space.ride(space.riding.target, { view: "above", distanceKm });
    }, km);

  await rideAt(30_000);
  await expect.poll(() => shown(page, SPACE), { timeout: 30_000, message: "30,000 km up: the clouds are whole" }).toBe(1);

  await rideAt(150);
  await expect.poll(() => shown(page, SPACE), { timeout: 30_000, message: "150 km up: the clouds are gone" }).toBeLessThan(0.01);
  // the glide over, and the larger pictures it no longer needs let go on their own timers: only then is it at rest
  await expect.poll(async () => (await page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { ride: { gliding: boolean } }).ride)).gliding, { timeout: 30_000 }).toBe(false);
  await page.waitForTimeout(Math.max(DOWNGRADE_AFTER_MS, MOON_KEEP_MS) + 500);
  await untilArrived(page);
  const before = await page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { draws: number }).draws);
  await page.waitForTimeout(1500);
  expect(await page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { draws: number }).draws), "faded and at rest: nothing is drawn").toBe(before);

  await setFade(page, SPACE, "off");
  await expect.poll(() => shown(page, SPACE), { message: "cloud-fade=off keeps them" }).toBe(1);
  await setFade(page, SPACE, null);
  await expect.poll(() => shown(page, SPACE), { message: "left out, they are gone again" }).toBeLessThan(0.01);
  await untilArrived(page);
});
