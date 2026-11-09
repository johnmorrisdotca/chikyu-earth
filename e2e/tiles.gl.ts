// The finer map tiles, in a real browser with a made-up tile set (every tile a flat colour for its level): which tiles are asked for, that they are drawn over the package's
// pictures, that they are freed when the zoom drops, and that everything the page keeps stays small. Nothing is downloaded from NASA.
import { expect, test, type Page } from "@playwright/test";
import { alive, counts, EARTH, NOON, openEarth, pixelAt, settle, statsOf } from "./gl.ts";
import { routeNoTiles, routeTiles } from "./tiles-fixture.ts";

test.describe.configure({ mode: "serial" });

const setView = (page: Page, zoom: number, yaw = 0, tilt = 0): Promise<void> =>
  page.locator(EARTH).evaluate((el, v) => (el as unknown as { setView(v: unknown, final: boolean): void }).setView(v, true), { yaw, tilt, zoom, panX: 0, panY: 0 });

/** The zoom that gives the disc this radius in CSS pixels (the pixel ratio is 1 here). */
const zoomFor = async (page: Page, radius: number): Promise<number> => {
  const box = (await page.locator(EARTH).boundingBox())!;
  return radius / (Math.min(box.width, box.height) / 2 / 1.08 - 1);
};

const middle = async (page: Page): Promise<[number, number, number]> => (await pixelAt(page, page.locator(EARTH), 0.5, 0.5)).slice(0, 3) as [number, number, number];
const magenta = (c: number[]): boolean => c[0]! > 200 && c[1]! < 60 && c[2]! > 200;
const cyan = (c: number[]): boolean => c[0]! < 60 && c[1]! > 200 && c[2]! > 200;
const level = (tile: string): number => Number(tile.split("/")[1]);

test("a zoom that needs finer pictures asks for the tiles in view, at the level it needs, and draws them over the package's picture", async ({ page }) => {
  const log = await routeTiles(page);
  await openEarth(page, `time=${NOON}&center=0,23`);
  await expect.poll(async () => (await statsOf(page)).tiles.ready, { message: "the manifest is read" }).toBe(true);
  const before = await middle(page);
  expect(magenta(before) || cyan(before), "the package's own picture is on the screen to begin with").toBe(false);
  expect((await statsOf(page)).tiles).toMatchObject({ level: null, held: 0, requested: 0 });
  expect(log.tiles, "nothing is fetched while the package's pictures are sharp enough").toEqual([]);
  expect(await page.locator("kazoku-view-controls").getAttribute("zoom-max"), "the tiles lift the zoom limit").toBe("20");

  const base = alive(await counts(page), "Texture");
  await setView(page, await zoomFor(page, 1000));
  await expect.poll(async () => (await statsOf(page)).tiles.level).toBe(3);
  await expect.poll(async () => (await statsOf(page)).tiles.shown, { timeout: 30_000 }).toBeGreaterThan(3);
  await settle(page, 1000);
  expect(log.tiles.length, "tiles were asked for").toBeGreaterThan(3);
  expect(log.tiles.every((tile) => tile.startsWith("day/3/")), "day tiles of level 3 only, the middle of the Earth is in the Sun").toBe(true);
  expect(log.tiles.length, "only what is in view, within the limit").toBeLessThanOrEqual(48);
  expect(new Set(log.tiles).size, "no tile asked for twice").toBe(log.tiles.length);
  expect(magenta(await middle(page)), `the level 3 tile is on the screen: ${await middle(page)}`).toBe(true);
  expect(alive(await counts(page), "Texture"), "one texture a tile").toBeLessThanOrEqual(base + 48);
  expect((await statsOf(page)).tiers.day, "the package's picture stays under the tiles").toBeGreaterThanOrEqual(2048);

  // nothing is drawn at rest, though the tiles are all on the sphere
  const rest = await counts(page);
  const draws = (await statsOf(page)).draws;
  await page.waitForTimeout(2500);
  expect((await counts(page)).draws, "GL draw calls at rest").toBe(rest.draws);
  expect((await statsOf(page)).draws).toBe(draws);
  expect((await counts(page)).rafRequests - rest.rafRequests, "frames asked for at rest").toBeLessThanOrEqual(1);

  const level3 = log.tiles.length;
  await setView(page, await zoomFor(page, 2600));
  await expect.poll(async () => (await statsOf(page)).tiles.level).toBe(4);
  await expect.poll(async () => cyan(await middle(page)), { timeout: 30_000, message: "the level 4 tile is drawn over the level 3 one" }).toBe(true);
  expect(log.tiles.slice(level3).every((tile) => level(tile) === 4)).toBe(true);
  const held = (await statsOf(page)).tiles.held;
  expect(held, "held tiles stay within the limit").toBeLessThanOrEqual(48);

  // zoom out: the tiles are let go, a few seconds later, and the textures with them
  await setView(page, 1);
  await expect.poll(async () => (await statsOf(page)).tiles, { timeout: 15_000 }).toMatchObject({ level: null, held: 0, shown: 0 });
  await settle(page, 2500);
  expect(alive(await counts(page), "Texture"), "every tile's texture is freed").toBe(base);
  expect((await statsOf(page)).assets.entries, "and out of the shared cache").toBeLessThanOrEqual(4);
  expect(magenta(await middle(page)) || cyan(await middle(page)), "the package's picture is on the screen again").toBe(false);
});

test("tiles of a place left are kept a few seconds, so going back asks for nothing, and are freed after", async ({ page }) => {
  const log = await routeTiles(page);
  await openEarth(page, `time=${NOON}&center=0,23`);
  await expect.poll(async () => (await statsOf(page)).tiles.ready).toBe(true);
  const zoom = await zoomFor(page, 2600);
  await setView(page, zoom);
  await expect.poll(async () => (await statsOf(page)).tiles, { timeout: 30_000 }).toMatchObject({ loading: 0, held: expect.any(Number) });
  await expect.poll(async () => (await statsOf(page)).tiles.shown, { timeout: 30_000 }).toBeGreaterThan(2);
  const here = (await statsOf(page)).tiles.held;
  await setView(page, zoom, 25);
  await expect.poll(async () => (await statsOf(page)).tiles.requested, { timeout: 30_000 }).toBeGreaterThan(here);
  await expect.poll(async () => (await statsOf(page)).tiles.loading, { timeout: 30_000 }).toBe(0);
  await expect.poll(async () => (await statsOf(page)).tiles.shown, { timeout: 30_000 }).toBeGreaterThan(2);
  const away = (await statsOf(page)).tiles;
  expect(away.held, "the place left is still held").toBeGreaterThan(away.shown);
  expect(away.held, "within the limit").toBeLessThanOrEqual(48);

  await setView(page, zoom, 0);
  await expect.poll(async () => (await statsOf(page)).tiles.shown, { timeout: 5_000 }).toBeGreaterThan(2);
  const asked = log.tiles.length;
  await settle(page, 800);
  expect(log.tiles.length, "back at the first place its tiles were still held, nothing is fetched").toBe(asked);

  await setView(page, zoom, 25);
  await expect.poll(async () => (await statsOf(page)).tiles, { timeout: 15_000, message: "the place left is freed after its time" }).toMatchObject({ held: away.shown, shown: away.shown });
  expect(new Set(log.tiles).size, "a tile is fetched once while it is held").toBe(asked);
});

test("the dark side loads night tiles, which are drawn where the city lights are", async ({ page }) => {
  const log = await routeTiles(page);
  await openEarth(page, `time=${NOON}&center=180,0`);
  await expect.poll(async () => (await statsOf(page)).tiles.ready).toBe(true);
  await setView(page, await zoomFor(page, 1000));
  await expect.poll(async () => (await statsOf(page)).tiles.shown, { timeout: 30_000 }).toBeGreaterThan(3);
  await expect.poll(async () => log.tiles.some((tile) => tile.startsWith("night/")), { timeout: 30_000 }).toBe(true);
  await expect.poll(async () => (await middle(page))[1], { timeout: 30_000 }).toBeGreaterThan(150);
  const [r, g, b] = await middle(page);
  expect(g, `the night tile (green) is the colour on the dark side: ${r},${g},${b}`).toBeGreaterThan(r + 100);
  expect(log.tiles.filter((tile) => tile.startsWith("night/")).every((tile) => level(tile) === 3)).toBe(true);
  expect(new Set(log.tiles).size).toBe(log.tiles.length);
});

test("without a tile set, or with a tile that fails, the Earth stays as it was and nothing is shown to the reader", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await routeNoTiles(page);
  await openEarth(page, `time=${NOON}&center=0,23`);
  await setView(page, await zoomFor(page, 2600));
  await settle(page, 1500);
  expect((await statsOf(page)).tiles).toMatchObject({ ready: false, held: 0, requested: 0 });
  expect(await page.locator("kazoku-view-controls").getAttribute("zoom-max"), "no tiles, no extra zoom").toBe("5");
  await expect(page.locator(EARTH)).toHaveAttribute("data-state", "live");
  expect(errors).toEqual([]);
});

test("a tile that fails is left out: the picture under it shows, the others are drawn, and it is not asked for again at once", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const log = await routeTiles(page, (tile) => tile.startsWith("day/3/") && Number(tile.split("/")[3]) % 2 === 0);
  await openEarth(page, `time=${NOON}&center=0,23`);
  await expect.poll(async () => (await statsOf(page)).tiles.ready).toBe(true);
  await setView(page, await zoomFor(page, 1000));
  await expect.poll(async () => (await statsOf(page)).tiles.failed, { timeout: 30_000 }).toBeGreaterThan(0);
  await expect.poll(async () => (await statsOf(page)).tiles.shown, { timeout: 30_000 }).toBeGreaterThan(0);
  await settle(page, 1500);
  const asked = log.tiles.length;
  await setView(page, (await zoomFor(page, 1000)) * 1.01);
  await settle(page, 1500);
  expect(new Set(log.tiles).size, "a tile that failed is not asked for again at the next draw").toBe(log.tiles.length);
  expect(log.tiles.length - asked).toBeLessThanOrEqual(6);
  await expect(page.locator(EARTH)).toHaveAttribute("data-state", "live");
  expect(errors).toEqual([]);
});

test("a lost WebGL context is recovered with the tiles still on the sphere", async ({ page }) => {
  const log = await routeTiles(page);
  await openEarth(page, `time=${NOON}&center=0,23`);
  await expect.poll(async () => (await statsOf(page)).tiles.ready).toBe(true);
  await setView(page, await zoomFor(page, 1000));
  await expect.poll(async () => magenta(await middle(page)), { timeout: 30_000 }).toBe(true);
  const asked = log.tiles.length;
  await page.locator(EARTH).evaluate((el) => {
    const canvas = el.shadowRoot!.querySelector("canvas")!;
    const ext = (canvas.getContext("webgl2") as WebGL2RenderingContext).getExtension("WEBGL_lose_context")!;
    Reflect.set(window, "__lose", ext);
    ext.loseContext();
  });
  await expect(page.locator(EARTH)).toHaveAttribute("data-state", "lost");
  await page.evaluate(() => (Reflect.get(window, "__lose") as { restoreContext(): void }).restoreContext());
  await expect(page.locator(EARTH)).toHaveAttribute("data-state", "live");
  await setView(page, (await zoomFor(page, 1000)) * 1.02);
  await expect.poll(async () => magenta(await middle(page)), { timeout: 30_000, message: "the tiles are drawn again" }).toBe(true);
  expect(log.tiles.length - asked, "the held tiles are drawn again, not fetched again").toBeLessThanOrEqual(4);
});

test("tiles that arrive one after another are a few draws, not a draw each, and never more than 30 a second", async ({ page }) => {
  await routeTiles(page);
  await openEarth(page, `time=${NOON}&center=0,23`);
  await expect.poll(async () => (await statsOf(page)).tiles.ready).toBe(true);
  const start = await statsOf(page);
  const t0 = Date.now();
  await setView(page, await zoomFor(page, 1000));
  await expect.poll(async () => (await statsOf(page)).tiles.loading, { timeout: 30_000 }).toBe(0);
  await expect.poll(async () => (await statsOf(page)).tiles.shown).toBeGreaterThan(3);
  await settle(page, 600);
  const end = await statsOf(page);
  const seconds = (Date.now() - t0) / 1000;
  expect(end.draws - start.draws, "draws while the tiles arrived").toBeLessThanOrEqual(Math.ceil(30 * seconds) + 1);
  expect(end.draws - start.draws, "fewer draws than tiles").toBeLessThan(end.tiles.requested + 3);
});
