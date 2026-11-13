// Finer tiles from NASA's imagery service, answered here by the test: nothing is fetched from the live service. The page asks only when the view is closer than the package's own tiles, a missing or slow tile leaves the coarser picture, and at rest nothing is drawn.
import { crc32, deflateSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { EARTH, NOON, openEarth, pixelAt, statsOf } from "./gl.ts";
import { routeTiles } from "./tiles-fixture.ts";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
});

const MAGENTA: [number, number, number] = [255, 0, 255];
const BLACK: [number, number, number] = [0, 0, 0];

const png = (rgb: [number, number, number]): Buffer => {
  const size = 64;
  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x += 1) row.set(rgb, 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  const chunk = (type: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
};

interface GibsLog {
  urls: string[];
}

/** Answer the imagery service locally. `mode` is what every tile does. */
async function routeGibs(page: Page, mode: "ok" | "missing" | "blank" | "slow"): Promise<GibsLog> {
  const log: GibsLog = { urls: [] };
  const picture = png(mode === "blank" ? BLACK : MAGENTA);
  await page.route("https://gibs.earthdata.nasa.gov/**", async (route) => {
    log.urls.push(route.request().url());
    if (mode === "missing") return route.fulfill({ status: 404, contentType: "text/html", body: "no" });
    if (mode === "slow") await new Promise((resolve) => setTimeout(resolve, 5000));
    return route.fulfill({ status: 200, contentType: "image/png", body: picture, headers: { "access-control-allow-origin": "*" } });
  });
  return log;
}

const zoomFor = async (page: Page, radius: number): Promise<number> => {
  const box = (await page.locator(EARTH).boundingBox())!;
  return radius / (Math.min(box.width, box.height) / 2 / 1.08 - 1);
};

const setView = (page: Page, zoom: number): Promise<void> => page.locator(EARTH).evaluate((el, zoom) => (el as unknown as { setView(v: unknown, final: boolean): void }).setView({ yaw: 0, tilt: 0, zoom, panX: 0, panY: 0 }, true), zoom);

/** Wait until the tile counts have stopped moving, recording the counts in the page so a slow machine cannot split the read from the check. */
const untilStill = async (page: Page): Promise<void> => {
  await page.evaluate(() => Reflect.set(window, "__gibsStill", { mark: "", n: 0 }));
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const earth = document.querySelector("chikyu-earth-realistic") as unknown as { stats: { draws: number; tiles: { loading: number; requested: number; shown: number; fading: boolean } } };
          const tiles = earth.stats.tiles;
          const mark = `${earth.stats.draws}/${tiles.requested}/${tiles.shown}/${tiles.fading}`;
          const held = Reflect.get(window, "__gibsStill") as { mark: string; n: number };
          held.n = tiles.loading === 0 && tiles.fading === false && held.mark === mark ? held.n + 1 : 0;
          held.mark = mark;
          return held.n;
        }),
      { timeout: 30_000, intervals: [50] },
    )
    .toBeGreaterThanOrEqual(4);
};

test("closer than the package's own tiles, the page asks the imagery service and draws it, and at rest it stops", async ({ page }) => {
  const gibs = await routeGibs(page, "ok");
  await routeTiles(page);
  await openEarth(page, `time=${NOON}&center=0,23`);
  await page.locator(EARTH).evaluate((el) => el.setAttribute("tiles-finer", "gibs"));
  await expect.poll(async () => (await statsOf(page)).tiles.ready).toBe(true);
  expect(gibs.urls, "nothing is fetched while the view is no closer than the package's tiles").toEqual([]);
  await setView(page, await zoomFor(page, 8000));
  await expect.poll(async () => (await statsOf(page)).tiles.finer, { timeout: 30_000 }).not.toBeNull();
  await expect.poll(async () => gibs.urls.length, { timeout: 30_000 }).toBeGreaterThan(0);
  await untilStill(page);
  const stats = await statsOf(page);
  expect(stats.tiles.held).toBeLessThanOrEqual(48);
  expect(stats.tiles.heldBytes).toBeLessThanOrEqual(72 * 1024 * 1024);
  expect(gibs.urls.every((url) => url.startsWith("https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/2026-06-20/250m/"))).toBe(true);
  const pixel = await pixelAt(page, page.locator(EARTH), 0.5, 0.5);
  expect(pixel[0]! > 180 && pixel[2]! > 180 && pixel[1]! < 140, `the finer tile is on the screen: ${pixel}`).toBe(true);
  const credit = page.locator(EARTH).locator("#finer-credit");
  await expect(credit).toBeVisible();
  await expect(credit).toContainText("Global Imagery Browse Services");
  const asked = gibs.urls.length;
  const draws = (await statsOf(page)).draws;
  await untilStill(page);
  expect(gibs.urls.length, "at rest, no further tile").toBe(asked);
  expect((await statsOf(page)).draws, "at rest, no further draw").toBe(draws);
});

test("a missing tile and a slow tile leave the coarser picture and are not asked for again", async ({ page }) => {
  const gibs = await routeGibs(page, "missing");
  await routeTiles(page);
  await openEarth(page, `time=${NOON}&center=0,23`);
  await page.locator(EARTH).evaluate((el) => el.setAttribute("tiles-finer", "gibs"));
  await expect.poll(async () => (await statsOf(page)).tiles.ready).toBe(true);
  await setView(page, await zoomFor(page, 8000));
  await expect.poll(async () => (await statsOf(page)).tiles.failed, { timeout: 30_000 }).toBeGreaterThan(0);
  await untilStill(page);
  const asked = gibs.urls.length;
  expect(asked).toBeGreaterThan(0);
  const pixel = await pixelAt(page, page.locator(EARTH), 0.5, 0.5);
  expect(pixel[0]! > 200 && pixel[1]! > 200 && pixel[2]! < 140, `the package's level 5 tile stays: ${pixel}`).toBe(true);
  await expect(page.locator(EARTH).locator("#finer-credit")).toBeHidden();
  await untilStill(page);
  expect(gibs.urls.length, "a failed tile is not asked for again while it stays in view").toBe(asked);
});

test("a tile that does not arrive within two seconds is left, and the coarser picture stays", async ({ page }) => {
  const gibs = await routeGibs(page, "slow");
  await routeTiles(page);
  await openEarth(page, `time=${NOON}&center=0,23`);
  await page.locator(EARTH).evaluate((el) => el.setAttribute("tiles-finer", "gibs"));
  await expect.poll(async () => (await statsOf(page)).tiles.ready).toBe(true);
  await setView(page, await zoomFor(page, 8000));
  await expect.poll(async () => (await statsOf(page)).tiles.failed, { timeout: 20_000 }).toBeGreaterThan(0);
  await untilStill(page);
  const pixel = await pixelAt(page, page.locator(EARTH), 0.5, 0.5);
  expect(pixel[0]! > 200 && pixel[1]! > 200 && pixel[2]! < 140, `the coarser tile stays when the finer one is slow: ${pixel}`).toBe(true);
  const asked = gibs.urls.length;
  await untilStill(page);
  expect(gibs.urls.length).toBe(asked);
});

test("a black tile is treated as no imagery, and the coarser picture stays", async ({ page }) => {
  const gibs = await routeGibs(page, "blank");
  await routeTiles(page);
  await openEarth(page, `time=${NOON}&center=0,23`);
  await page.locator(EARTH).evaluate((el) => el.setAttribute("tiles-finer", "gibs"));
  await expect.poll(async () => (await statsOf(page)).tiles.ready).toBe(true);
  await setView(page, await zoomFor(page, 8000));
  await expect.poll(async () => (await statsOf(page)).tiles.failed, { timeout: 30_000 }).toBeGreaterThan(0);
  await untilStill(page);
  const pixel = await pixelAt(page, page.locator(EARTH), 0.5, 0.5);
  expect(pixel[0]! > 200 && pixel[1]! > 200 && pixel[2]! < 140, `a blank finer tile leaves the coarser one: ${pixel}`).toBe(true);
  const asked = gibs.urls.length;
  await untilStill(page);
  expect(gibs.urls.length).toBe(asked);
});
