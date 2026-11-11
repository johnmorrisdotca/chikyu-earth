// The data door on the realistic Earth, in a real browser (Chromium, drawn in software): a source of the day layer that a page hands in is drawn in place of the package's tiles, its credit is on the page in English and in
// Japanese with its licence, switching it off (the call, and `data=own` in the address) brings the first picture back, frees its tiles and aborts its loads, a bad source is refused or counted and never drawn, and at rest the
// door sends nothing. The package's own tiles are the made-up set of tiles-fixture.ts (flat magenta at level 3); the source of the page is made in the page, as the README shows, and draws flat green.
import { expect, test, type Page } from "@playwright/test";
import { EARTH, NOON, openEarth, pixelAt, statsOf } from "./gl.ts";
import { routeTiles } from "./tiles-fixture.ts";

test.describe.configure({ mode: "serial" });

type Credit = { id: string; own: boolean; used: number };
const creditsOf = (page: Page): Promise<Credit[]> =>
  page.locator(EARTH).evaluate((el) => (el as unknown as { credits(): { source: { id: string }; own: boolean; used: number }[] }).credits().map((c) => ({ id: c.source.id, own: c.own, used: c.used })));
const line = (page: Page) => page.getByTestId("door-credit");
const middle = async (page: Page): Promise<[number, number, number]> => (await pixelAt(page, page.locator(EARTH), 0.5, 0.5)).slice(0, 3) as [number, number, number];
const magenta = (c: number[]): boolean => c[0]! > 200 && c[1]! < 60 && c[2]! > 200;
const green = (c: number[]): boolean => c[1]! > 200 && c[0]! < 60 && c[2]! < 60;

const setView = (page: Page, zoom: number): Promise<void> =>
  page.locator(EARTH).evaluate((el, z) => (el as unknown as { setView(v: unknown, final: boolean): void }).setView({ yaw: 0, tilt: 0, zoom: z, panX: 0, panY: 0 }, true), zoom);
/** The zoom that gives the disc this radius in CSS pixels (the pixel ratio is 1 here). */
const zoomFor = async (page: Page, radius: number): Promise<number> => {
  const box = (await page.locator(EARTH).boundingBox())!;
  return radius / (Math.min(box.width, box.height) / 2 / 1.08 - 1);
};

/** Zooms in to level 3 and waits for the package's own tiles to be on the middle of the Earth. */
async function closeIn(page: Page): Promise<void> {
  await expect.poll(async () => (await statsOf(page)).tiles.ready, { message: "the folder's manifest is read" }).toBe(true);
  await setView(page, await zoomFor(page, 1000));
  await expect.poll(async () => magenta(await middle(page)), { timeout: 60_000, message: "the package's own level 3 tile is on the middle" }).toBe(true);
}

/**
 * A source of the day layer made in the page: every tile one green square on the package's pyramid, levels 3 and 4. `how` makes it misbehave: `hang` never answers until it is aborted, `throw` fails every tile.
 * The calls and the aborts are kept in `window.__mine`.
 */
async function addMine(page: Page, how: "ok" | "hang" | "throw" = "ok", id = "mine"): Promise<void> {
  await page.locator(EARTH).evaluate(
    (el, [mode, sourceId]) => {
      const calls: string[] = [];
      const aborted: string[] = [];
      Reflect.set(window, "__mine", { calls, aborted });
      const source = {
        kind: "tiles",
        layer: "day",
        info: {
          id: sourceId,
          name: { en: "My maps", ja: "私の地図" },
          credit: { en: "Maps: mine, A. Person (2026)", ja: "地図：私の（A. Person、2026年）" },
          licence: { name: "CC BY-NC 4.0", url: "https://creativecommons.org/licenses/by-nc/4.0/", nonCommercial: true },
          url: "https://example.org/mine",
          retrieved: "2026-11-11",
        },
        levels: () => ({ tileSize: 512, levels: [3, 4].map((level) => ({ level, width: 1024 * 2 ** level })) }),
        need(place: { lonMin: number; latMax: number }, detail: number) {
          const level = Math.round(Math.log2(detail / 1024));
          const col = Math.floor(((place.lonMin + 180) / 360) * 2 ** (level + 1) + 1e-6);
          const row = Math.floor(((90 - place.latMax) / 180) * 2 ** level + 1e-6);
          return [`${sourceId}/${level}/${col}/${row}`];
        },
        async load(key: string, signal: AbortSignal) {
          calls.push(key);
          if (mode === "throw") throw new Error(`no tile ${key}`);
          if (mode === "hang") {
            await new Promise<void>((_resolve, reject) =>
              signal.addEventListener("abort", () => {
                aborted.push(key);
                reject(new DOMException("aborted", "AbortError"));
              }),
            );
          }
          const canvas = new OffscreenCanvas(512, 512);
          const context = canvas.getContext("2d")!;
          context.fillStyle = "#00ff00";
          context.fillRect(0, 0, 512, 512);
          return { width: 512, height: 512, image: await createImageBitmap(canvas) };
        },
        bytes: (tile: { width: number; height: number }) => Math.ceil(tile.width * tile.height * 4 * (4 / 3)),
      };
      (el as unknown as { addSource(s: unknown): void }).addSource(source);
    },
    [how, id] as const,
  );
}
const mineOf = (page: Page): Promise<{ calls: string[]; aborted: string[] }> => page.evaluate(() => Reflect.get(window, "__mine") as { calls: string[]; aborted: string[] });

test("with no source the Earth is drawn from the package's own tiles, and credits its pictures, and its tiles once a window of them is in view", async ({ page }) => {
  await routeTiles(page);
  await openEarth(page, `time=${NOON}&center=0,23`);
  expect((await creditsOf(page)).map((c) => c.id), "only the pictures before any tile is in view").toEqual(["chikyu-pictures"]);
  await closeIn(page);
  const credits = await creditsOf(page);
  expect(credits.map((c) => [c.id, c.own])).toEqual([["chikyu-pictures", true], ["chikyu-tiles", true]]);
  expect(credits[1]!.used).toBe((await statsOf(page)).tiles.used["chikyu-tiles"]);
  await expect(line(page)).toContainText("NASA Earth Observatory");
  await expect(line(page)).toContainText("Public domain");
});

test("a source of the day layer is drawn in place of the folder, exactly its tiles, and its credit has its licence in English and in Japanese", async ({ page }) => {
  const log = await routeTiles(page);
  await openEarth(page, `time=${NOON}&center=0,23`);
  await closeIn(page);
  const folderTiles = log.tiles.length;
  await addMine(page);
  await expect.poll(async () => green(await middle(page)), { timeout: 60_000, message: "the source's tile is on the middle, in place of the folder's" }).toBe(true);
  const mine = await mineOf(page);
  expect(mine.calls.length).toBeGreaterThan(3);
  expect(mine.calls.every((key) => /^mine\/3\/\d+\/\d+$/.test(key)), "keys in the source's own form, level 3").toBe(true);
  expect(log.tiles.length, "the folder is not asked for more once the source covers the layer").toBe(folderTiles);
  const credits = await creditsOf(page);
  expect(credits.map((c) => [c.id, c.own])).toEqual([["chikyu-pictures", true], ["mine", false]]);
  expect(credits[1]!.used).toBe((await statsOf(page)).tiles.used["mine"]);
  await expect(line(page)).toContainText("Maps: mine, A. Person (2026) (CC BY-NC 4.0; non-commercial)");
  await expect(line(page)).toContainText("Earth pictures: NASA Earth Observatory");
});

test("in Japanese the credit line is in Japanese, with the licence and 非営利のみ", async ({ page }) => {
  await routeTiles(page);
  await openEarth(page, `time=${NOON}&center=0,23&lang=ja`);
  await closeIn(page);
  await addMine(page);
  await expect.poll(async () => green(await middle(page)), { timeout: 60_000 }).toBe(true);
  await expect(line(page)).toContainText("地図：私の（A. Person、2026年）（CC BY-NC 4.0、非営利のみ）");
  await expect(line(page)).toContainText("地球の画像：NASA Earth Observatory");
});

test("remove() brings the folder's picture back, and the credit goes", async ({ page }) => {
  await routeTiles(page);
  await openEarth(page, `time=${NOON}&center=0,23`);
  await closeIn(page);
  await addMine(page);
  await expect.poll(async () => green(await middle(page)), { timeout: 60_000 }).toBe(true);
  await page.locator(EARTH).evaluate((el) => (el as unknown as { removeSource(id: string): boolean }).removeSource("mine"));
  await expect.poll(async () => magenta(await middle(page)), { timeout: 60_000, message: "the package's own tile is back" }).toBe(true);
  expect((await creditsOf(page)).map((c) => c.id)).not.toContain("mine");
  await expect(line(page)).not.toContainText("mine");
  expect(await page.locator(EARTH).evaluate((el) => (el as unknown as { sources: unknown[] }).sources.length)).toBe(0);
});

test("switching a source off aborts the loads still running and frees what it held; on again, it is read again", async ({ page }) => {
  await routeTiles(page);
  await openEarth(page, `time=${NOON}&center=0,23`);
  await closeIn(page);
  await addMine(page, "hang");
  await expect.poll(async () => (await mineOf(page)).calls.length, { message: "tiles are being asked of the source" }).toBeGreaterThan(0);
  const started = (await mineOf(page)).calls.length;
  expect(started, "at most six at once").toBeLessThanOrEqual(6);
  await page.locator(EARTH).evaluate((el) => (el as unknown as { enableSource(id: string, on: boolean): void }).enableSource("mine", false));
  await expect.poll(async () => (await mineOf(page)).aborted.length, { message: "every load is aborted" }).toBe(started);
  await expect.poll(async () => magenta(await middle(page)), { timeout: 60_000, message: "the folder's tile is back" }).toBe(true);
  expect((await statsOf(page)).tiles.used["mine"]).toBeUndefined();
});

test("data=own in the address ignores a source of the page: no tile is asked of it and the folder is drawn", async ({ page }) => {
  await routeTiles(page);
  await openEarth(page, `time=${NOON}&center=0,23&data=own`);
  await closeIn(page);
  await addMine(page);
  const asked = (await statsOf(page)).tiles.requested;
  await page.locator(EARTH).evaluate((el) => el.setAttribute("zoom-max", "20"));
  await setView(page, await zoomFor(page, 1010));
  await expect.poll(async () => (await statsOf(page)).tiles.requested, { message: "the view moved and asked the folder" }).toBeGreaterThanOrEqual(asked);
  expect((await mineOf(page)).calls, "nothing was asked of the ignored source").toEqual([]);
  expect(magenta(await middle(page))).toBe(true);
  expect((await creditsOf(page)).map((c) => c.id)).not.toContain("mine");
  // and the page can take the switch away: the source is then used
  await page.locator(EARTH).evaluate((el) => el.removeAttribute("data"));
  await expect.poll(async () => green(await middle(page)), { timeout: 60_000 }).toBe(true);
});

test("a source that is refused throws at once and is not kept; a source whose tiles fail is counted and never drawn", async ({ page }) => {
  await routeTiles(page);
  await openEarth(page, `time=${NOON}&center=0,23`);
  await closeIn(page);
  const refusal = await page.locator(EARTH).evaluate((el) => {
    const earth = el as unknown as { addSource(s: unknown): void; sources: unknown[] };
    const info = { id: "empty", name: { en: "x", ja: "x" }, credit: { en: "", ja: "" }, licence: { name: "CC0", url: "https://creativecommons.org/publicdomain/zero/1.0/" }, url: "https://example.org", retrieved: "2026-11-11" };
    try {
      earth.addSource({ kind: "tiles", layer: "day", info, need: () => [], load: async () => ({}), bytes: () => 0 });
      return "not refused";
    } catch (error) {
      return `${(error as Error).name}: ${earth.sources.length} kept`;
    }
  });
  expect(refusal).toBe("TypeError: 0 kept");
  await addMine(page, "throw", "broken");
  await expect.poll(async () => (await statsOf(page)).tiles.failed, { timeout: 30_000, message: "the failed tiles are counted" }).toBeGreaterThan(0);
  expect((await statsOf(page)).tiles.shown, "nothing of it is drawn").toBe(0);
  expect((await creditsOf(page)).map((c) => c.id)).not.toContain("broken");
});

test("at rest the door sends nothing: tiles asked for and frames drawn stay where they are, whatever the source", async ({ page }) => {
  await routeTiles(page);
  await openEarth(page, `time=${NOON}&center=0,23`);
  await closeIn(page);
  await addMine(page);
  await expect.poll(async () => green(await middle(page)), { timeout: 60_000 }).toBe(true);
  const settled = async (): Promise<[number, number, number]> => {
    const stats = await statsOf(page);
    return [stats.tiles.requested, stats.tiles.loading, stats.draws];
  };
  await expect.poll(async () => (await settled())[1], { message: "every tile has arrived" }).toBe(0);
  const before = await settled();
  const mineBefore = (await mineOf(page)).calls.length;
  // thirty frames of the page's own: whatever would be sent at rest would be sent in these
  await page.evaluate(async () => {
    for (let frame = 0; frame < 30; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  expect(await settled()).toEqual(before);
  expect((await mineOf(page)).calls.length).toBe(mineBefore);
});
