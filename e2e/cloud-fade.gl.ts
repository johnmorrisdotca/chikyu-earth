// The clouds fade out when the view is close, so the sharp ground shows: the cloud picture is one whole-Earth map at most 2048 across, drawn over the finer tiles. Whole at the whole-Earth view,
// gone where a pixel is well under a kilometre of ground, kept by `cloud-fade="off"`, moved by a number, and nothing drawn at rest. On both elements, in software GL. In the space view the fade is
// worked out for each point of the clouds by its own distance from the camera: the ground below the ISS goes sharp, the horizon keeps its clouds.
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

  // a texel of the 2048 cloud picture is 32 pixels wide at a radius of 10430 pixels: about 0.6 km of ground a pixel
  await setView(page, await zoomFor(page, 10500));
  await expect.poll(() => shown(page, EARTH), { message: "close: the clouds are gone" }).toBeLessThan(0.01);
  // the tiles let go of the coarser pictures on their own timer: rest is after it
  await page.waitForTimeout(DOWNGRADE_AFTER_MS + 500);
  const rest = await drawsAtRest(page, EARTH);
  await page.waitForTimeout(1000);
  expect((await statsOf(page)).draws, "faded and at rest: nothing is drawn").toBe(rest);

  await setView(page, await zoomFor(page, 4000));
  await expect.poll(() => shown(page, EARTH), { message: "half way in: partly there" }).toBeGreaterThan(0.5);
  expect(await shown(page, EARTH)).toBeLessThan(1);

  await setView(page, await zoomFor(page, 10500));
  await setFade(page, EARTH, "off");
  await expect.poll(() => shown(page, EARTH), { message: "cloud-fade=off keeps them" }).toBe(1);
  await setFade(page, EARTH, "4");
  await setView(page, await zoomFor(page, 1500));
  await expect.poll(() => shown(page, EARTH), { message: "a width of 4 has them gone sooner" }).toBeLessThan(0.3);
  await setFade(page, EARTH, null);
  await expect.poll(() => shown(page, EARTH), { message: "left out, the default again" }).toBeGreaterThan(0.5);
});

// a screen with twice the pixels, as a person has: the fade is counted in device pixels
test.describe("on a screen with twice the pixels", () => {
  test.use({ deviceScaleFactor: 2 });

  test("the space view: whole clouds from far, gone 60 km above the ISS, kept by off, and nothing drawn at rest", async ({ page }) => {
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

    await rideAt(60);
    await expect.poll(() => shown(page, SPACE), { timeout: 30_000, message: "60 km above the ISS: the clouds are gone" }).toBeLessThan(0.01);
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
});

const FIXED = "time=2026-11-03T07:30Z&speed=0&center=25,-31&sats=stations&ride=iss";
const GLOBE = "#globe";

/** The share of pixels that clearly differ between two screenshots, in the rows from `from` to `to` (0 to 1 of the height). */
const changedIn = (page: Page, a: Buffer, b: Buffer, from: number, to: number): Promise<number> =>
  page.evaluate(
    async ([x, y, top, bottom]) => {
      const load = async (data: string): Promise<ImageData> => {
        const img = new Image();
        img.src = `data:image/png;base64,${data}`;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, img.width, img.height);
      };
      const p = await load(x as string);
      const q = await load(y as string);
      let differ = 0;
      let n = 0;
      for (let row = Math.floor(p.height * (top as number)); row < Math.floor(p.height * (bottom as number)); row += 1) {
        for (let col = 0; col < p.width; col += 1) {
          const i = (row * p.width + col) * 4;
          n += 1;
          if (Math.abs(p.data[i]! - q.data[i]!) + Math.abs(p.data[i + 1]! - q.data[i + 1]!) + Math.abs(p.data[i + 2]! - q.data[i + 2]!) > 40) differ += 1;
        }
      }
      return differ / n;
    },
    [a.toString("base64"), b.toString("base64"), from, to] as const,
  );

/** The ride's picture with the fade as it is and with `cloud-fade="off"`, and how much of each band of rows the fade changed. */
async function fadeAgainstOff(page: Page, look: string, bands: [number, number][]): Promise<number[]> {
  await routeElements(page);
  await page.goto(`/chikyu-earth/?look=space&${FIXED}${look}`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => (await page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { ride: { riding: boolean; gliding: boolean } }).ride)), { timeout: 30_000 }).toMatchObject({ riding: true, gliding: false });
  await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { pause(): void }).pause());
  await page.locator(SPACE).evaluate((el) => {
    el.setAttribute("bodies-credit", "off");
    el.setAttribute("air-label", "off");
  });
  await untilArrived(page);
  const faded = await page.locator(GLOBE).screenshot();
  await setFade(page, SPACE, "off");
  await untilArrived(page);
  const whole = await page.locator(GLOBE).screenshot();
  const changed: number[] = [];
  for (const [from, to] of bands) changed.push(await changedIn(page, faded, whole, from, to));
  return changed;
}

test.describe("riding the ISS on a screen with twice the pixels", () => {
  test.use({ deviceScaleFactor: 2 });

  test("looking down the clouds are gone from the ground below", async ({ page }) => {
    const [middle] = await fadeAgainstOff(page, "", [[0.3, 0.7]]);
    expect(middle, "the fade changed about half of the ground below (the clouds over it are gone)").toBeGreaterThan(0.3);
  });

  test("tipped to the horizon the horizon keeps its clouds", async ({ page }) => {
    const [middle, bottom] = await fadeAgainstOff(page, "&rlook=horizon", [[0.3, 0.7], [0.85, 1]]);
    expect(middle, "the horizon band is nearly as it is with the fade off: it keeps its clouds").toBeLessThan(0.1);
    expect(bottom, "while the ground nearest the camera, at the bottom, has lost them").toBeGreaterThan(0.3);
  });
});
