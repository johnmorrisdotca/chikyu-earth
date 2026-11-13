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

const png = (rgb: [number, number, number], blackLeft = false): Buffer => {
  const size = 64;
  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x += 1) row.set(blackLeft && x < size / 2 ? BLACK : rgb, 1 + x * 3);
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
async function routeGibs(page: Page, mode: "ok" | "missing" | "blank" | "slow" | "swath", days?: (day: string) => boolean): Promise<GibsLog> {
  const log: GibsLog = { urls: [] };
  const picture = png(mode === "blank" ? BLACK : MAGENTA, mode === "swath");
  await page.route("https://gibs.earthdata.nasa.gov/**", async (route) => {
    log.urls.push(route.request().url());
    const day = /\/default\/(\d{4}-\d{2}-\d{2})\//.exec(route.request().url())?.[1];
    if (days && day && !days(day)) return route.fulfill({ status: 404, contentType: "text/html", body: "no" });
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
  expect(gibs.urls.every((url) => url.startsWith("https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2026-06-20/250m/"))).toBe(true);
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
  await page.locator(EARTH).evaluate((el) => {
    el.setAttribute("tiles-finer", "gibs");
    el.setAttribute("tiles-finer-date", "previous-day");
  });
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
  await page.locator(EARTH).evaluate((el) => {
    el.setAttribute("tiles-finer", "gibs");
    el.setAttribute("tiles-finer-date", "previous-day");
  });
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
  await page.locator(EARTH).evaluate((el) => {
    el.setAttribute("tiles-finer", "gibs");
    el.setAttribute("tiles-finer-date", "previous-day");
  });
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

test("the default rule steps back a day at a time, one tile each, to the most recent day with a picture, and shows that day", async ({ page }) => {
  // 2026-06-20 and 2026-06-19 have none; 2026-06-18 has
  const gibs = await routeGibs(page, "ok", (day) => day <= "2026-06-18");
  await routeTiles(page);
  await openEarth(page, `time=${NOON}&center=0,23`);
  await page.locator(EARTH).evaluate((el) => el.setAttribute("tiles-finer", "gibs"));
  await expect.poll(async () => (await statsOf(page)).tiles.ready).toBe(true);
  expect(gibs.urls, "nothing is asked while the view is no closer than the package's tiles").toEqual([]);
  await setView(page, await zoomFor(page, 8000));
  await expect.poll(async () => (await statsOf(page)).tiles.finer, { timeout: 30_000 }).not.toBeNull();
  await expect.poll(async () => gibs.urls.length, { timeout: 30_000 }).toBeGreaterThan(3);
  await untilStill(page);
  const days = gibs.urls.map((url) => /\/default\/(\d{4}-\d{2}-\d{2})\//.exec(url)![1]!);
  expect(days.slice(0, 3), "one tile a day, newest first, one at a time").toEqual(["2026-06-20", "2026-06-19", "2026-06-18"]);
  expect(days.slice(3).every((day) => day === "2026-06-18"), "the tiles are from the day that answered").toBe(true);
  const pixel = await pixelAt(page, page.locator(EARTH), 0.5, 0.5);
  expect(pixel[0]! > 180 && pixel[2]! > 180 && pixel[1]! < 140, `the finer tile is on the screen: ${pixel}`).toBe(true);
  const asked = gibs.urls.length;
  await untilStill(page);
  expect(gibs.urls.length, "at rest, no further ask").toBe(asked);
});

test("with no picture in ten days the page asks ten times, then nothing, and the package's own tiles stay", async ({ page }) => {
  const gibs = await routeGibs(page, "ok", () => false);
  await routeTiles(page);
  await openEarth(page, `time=${NOON}&center=0,23`);
  await page.locator(EARTH).evaluate((el) => el.setAttribute("tiles-finer", "gibs"));
  await expect.poll(async () => (await statsOf(page)).tiles.ready).toBe(true);
  await setView(page, await zoomFor(page, 8000));
  await expect.poll(async () => gibs.urls.length, { timeout: 30_000 }).toBe(10);
  await untilStill(page);
  await setView(page, await zoomFor(page, 9000));
  await untilStill(page);
  expect(gibs.urls.length, "ten asks and no more").toBe(10);
  const pixel = await pixelAt(page, page.locator(EARTH), 0.5, 0.5);
  expect(pixel[0]! > 200 && pixel[1]! > 200 && pixel[2]! < 140, `the package's level 5 tile stays: ${pixel}`).toBe(true);
  await expect(page.locator(EARTH).locator("#finer-credit")).toBeHidden();
});

test("a tile that is partly black, a gap between two passes of the satellite, is shown, and a wholly black one is not", async ({ page }) => {
  const gibs = await routeGibs(page, "swath");
  await routeTiles(page);
  await openEarth(page, `time=${NOON}&center=0,23`);
  await page.locator(EARTH).evaluate((el) => el.setAttribute("tiles-finer", "gibs"));
  await expect.poll(async () => (await statsOf(page)).tiles.ready).toBe(true);
  await setView(page, await zoomFor(page, 8000));
  await expect.poll(async () => (await statsOf(page)).tiles.shown, { timeout: 30_000 }).toBeGreaterThan(0);
  await untilStill(page);
  const stats = await statsOf(page);
  expect(stats.tiles.failed, "no tile of half a picture is turned away").toBe(0);
  expect(gibs.urls.length).toBeGreaterThan(1);
  await expect(page.locator(EARTH).locator("#finer-credit")).toBeVisible();
  // the all-black case is the test above: every tile blank, the coarser picture stays and nothing more is asked once the days are used up
});
