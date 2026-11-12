// Riding above a satellite at 150 km: the ground is laid with the finer map tiles of the level that height needs, only those under the camera; high up none are asked for, they are freed when the camera rises again,
// and nothing is drawn at rest. A made-up tile set (every tile one flat colour for its level), nothing is downloaded. Chromium, drawn in software.
import { expect, test, type Page } from "@playwright/test";
import { routeElements } from "./recorded.ts";
import { routeTiles } from "./tiles-fixture.ts";

test.use({ reducedMotion: "reduce" });

const SPACE = "chikyu-space";
interface Tiles {
  ready: boolean;
  level: number | null;
  held: number;
  shown: number;
  requested: number;
}
const tiles = (page: Page): Promise<Tiles> => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { tiles: Tiles }).tiles);
const draws = (page: Page): Promise<number> => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { draws: number }).draws);
async function atRest(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const before = await draws(page);
        await page.evaluate(async () => {
          for (let frame = 0; frame < 30; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
        });
        return (await draws(page)) - before;
      },
      { timeout: 60_000, message: "the view is at rest" },
    )
    .toBe(0);
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
  await expect.poll(async () => (await tiles(page)).ready, { message: "the tile set is read" }).toBe(true);
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
  await expect.poll(async () => (await tiles(page)).held, { timeout: 30_000, message: "and the level 4 tiles are freed" }).toBeLessThan(held.held);
  await atRest(page);
});
