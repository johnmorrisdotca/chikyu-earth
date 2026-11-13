// Riding above a satellite at 150 km: the ground is laid with the finer map tiles of the level that height needs, only those under the camera; high up none are asked for, they are freed when the camera rises again,
// and nothing is drawn at rest. A made-up tile set (every tile one flat colour for its level), nothing is downloaded. Chromium, drawn in software.
import { expect, test, type Page } from "@playwright/test";
import { untilArrived } from "./gl.ts";
import { routeElements } from "./recorded.ts";
import { routeTiles } from "./tiles-fixture.ts";

test.use({ reducedMotion: "reduce" });

const SPACE = "chikyu-space";
interface Tiles {
  ready: boolean;
  level: number | null;
  held: number;
  shown: number;
  loading: number;
  requested: number;
}
const tiles = (page: Page): Promise<Tiles> => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { tiles: Tiles }).tiles);
async function atRest(page: Page): Promise<void> {
  // a view's bodies are made after the draw that showed them and each picture that arrives is a draw of its own (gathered to one a second for less motion): rest is after the last, which the page says (MODULES-1192)
  await untilArrived(page);
}
const rideAt = (page: Page, distanceKm: number): Promise<void> =>
  page.locator(SPACE).evaluate((el, km) => {
    const space = el as unknown as { riding: { target: { group: string; index: number } }; ride(ref: unknown, options: unknown): void };
    space.ride(space.riding.target, { view: "above", distanceKm: km });
  }, distanceKm);

test("the whole Earth in view asks for no tile: the package's own picture is sharp enough", async ({ page }) => {
  const log = await routeTiles(page);
  await routeElements(page);
  await page.goto("/chikyu-earth/?look=space&time=2026-11-02T18:00Z&speed=0");
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => (await tiles(page)).ready, { timeout: 30_000, message: "the tile set is read" }).toBe(true);
  await atRest(page);
  expect((await tiles(page)).level).toBeNull();
  expect(log.tiles, "nothing is fetched").toEqual([]);
});

test("above the station the ground is laid with the tiles under the camera at the level its height needs, and they are freed when it rises", async ({ page }) => {
  const log = await routeTiles(page);
  await routeElements(page);
  await page.goto("/chikyu-earth/?look=space&time=2026-11-02T18:00Z&speed=0&sats=stations&ride=iss&rview=above&light=lit");
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => (await page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { ride: { riding: boolean } }).ride)).riding, { timeout: 30_000 }).toBe(true);
  expect(await page.locator(SPACE).evaluate((el) => (el as unknown as { tiles: string | null }).tiles), "the demo points the view at its tiles").toBe("tiles/");
  // 3,000 km above it a pixel is about 3 km of ground: more than the package's own picture has, less than the finest tiles
  await expect.poll(async () => (await tiles(page)).level, { timeout: 30_000 }).toBe(3);
  await expect.poll(async () => (await tiles(page)).shown, { timeout: 30_000 }).toBeGreaterThan(0);
  await atRest(page);
  expect(log.tiles.filter((tile) => tile.startsWith("day/")).every((tile) => tile.startsWith("day/3/")), "level 3 day tiles only").toBe(true);
  // every tile this view needs is in: what the view holds at level 3, to be held again when it comes back to level 3 and not more
  await expect.poll(async () => (await tiles(page)).loading, { timeout: 30_000, message: "the level 3 tiles are in" }).toBe(0);
  const level3 = (await tiles(page)).held;

  const before = log.tiles.length;
  await rideAt(page, 150);
  await expect.poll(async () => (await tiles(page)).level, { timeout: 30_000, message: "150 km up needs the finest level" }).toBe(4);
  await expect.poll(async () => (await tiles(page)).shown, { timeout: 30_000, message: "the tiles under the camera are on the ground" }).toBeGreaterThan(0);
  await atRest(page);
  const day = log.tiles.slice(before).filter((tile) => tile.startsWith("day/"));
  expect(day.length, "a few tiles, not the Earth").toBeGreaterThan(0);
  expect(day.length).toBeLessThanOrEqual(4);
  expect(day.every((tile) => tile.startsWith("day/4/")), `only level 4 day tiles: ${day.join(" ")}`).toBe(true);
  const held = await tiles(page);
  await page.waitForTimeout(1500);
  expect((await tiles(page)).requested, "nothing more is fetched at rest").toBe(held.requested);

  await rideAt(page, 3000);
  await expect.poll(async () => (await tiles(page)).level, { timeout: 30_000, message: "back up, level 3 again" }).toBe(3);
  // the level 3 tiles the view lets go four seconds after it needs no more of them, and asks for again when it comes back: by then the view holds what it held at level 3 before, and the level 4 tiles are not among them. (A count against the level 4 view's own
  // is not it: that view may or may not still hold the level 3 tiles it let go of, according to how long the test took to get there.)
  await expect
    .poll(async () => {
      const now = await tiles(page);
      return now.loading === 0 ? now.held : Infinity;
    }, { timeout: 30_000, message: "and the level 4 tiles are freed" })
    .toBeLessThanOrEqual(level3);
  await atRest(page);
});
