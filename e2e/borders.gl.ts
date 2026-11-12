// The borders on the land (chizu's countries, and a page's regions), in a real browser (Chromium, drawn in software), on the realistic Earth and on the space view: off unless `borders` is set, drawn
// by day and by night, the regions only once the Earth is large enough and only for the countries in view, the element still drawing with no error when the shapes cannot be loaded, and nothing
// drawn at rest.
import { expect, test, type Page } from "@playwright/test";
import { COUNT_SCRIPT, readCounts } from "./gl.ts";

test.describe.configure({ mode: "serial" });
test.use({ reducedMotion: "reduce" });

interface Borders {
  countries: number;
  regions: number;
  shown: { countries: boolean; regions: boolean };
  loaded: string[];
  builds: number;
  failed: boolean;
}
const DAY = "2026-06-21T12:00Z";
const NIGHT = "2026-06-21T00:00Z";
/** Over Germany: by day at noon UTC, by night at midnight. */
const EUROPE = "center=10,50";

const bordersOf = (page: Page, tag: string): Promise<Borders> => page.locator(tag).evaluate((el) => (Reflect.get(el, "stats") as { borders: Borders }).borders);
const drawsOf = (page: Page, tag: string): Promise<number> => page.locator(tag).evaluate((el) => (Reflect.get(el, "stats") as { draws: number }).draws);

async function open(page: Page, look: "realistic" | "space", time: string, errors: string[] = []): Promise<string> {
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/?look=${look}&time=${time}&speed=0&${EUROPE}`);
  const tag = look === "realistic" ? "chikyu-earth-realistic" : "chikyu-space";
  await page.locator(`${tag}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => (await readCounts(page)).draws).toBeGreaterThan(0);
  await still(page, tag);
  return tag;
}

/** Waits until the element has drawn nothing for a second: its pictures are in and the view is still. */
async function still(page: Page, tag: string): Promise<void> {
  let before = await drawsOf(page, tag);
  await expect
    .poll(
      async () => {
        await page.waitForTimeout(1000);
        const now = await drawsOf(page, tag);
        const quiet = now === before;
        before = now;
        return quiet;
      },
      { timeout: 30_000, intervals: [0], message: "the element stops drawing" },
    )
    .toBe(true);
}

const shot = async (page: Page, tag: string): Promise<string> => (await page.locator(tag).screenshot()).toString("base64");

/** The pixels that changed from one picture to the next, and how many of them turned towards the borders' yellow. */
const changed = (page: Page, before: string, after: string): Promise<{ changed: number; warm: number; cooler: number }> =>
  page.evaluate(
    async ([a, b]) => {
      const read = async (data: string): Promise<Uint8ClampedArray> => {
        const img = new Image();
        img.src = `data:image/png;base64,${data}`;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, img.width, img.height).data;
      };
      const one = await read(a);
      const two = await read(b);
      let count = 0;
      let warm = 0;
      let cooler = 0;
      for (let i = 0; i < Math.min(one.length, two.length); i += 4) {
        const diff = Math.abs(one[i]! - two[i]!) + Math.abs(one[i + 1]! - two[i + 1]!) + Math.abs(one[i + 2]! - two[i + 2]!);
        if (diff < 60) continue;
        count += 1;
        // the borders' yellow pulls a pixel towards yellow: its red and green rise against its blue, over the dark night as over bright cloud or desert
        if ((two[i]! + two[i + 1]!) / 2 - two[i + 2]! > (one[i]! + one[i + 1]!) / 2 - one[i + 2]! + 15) warm += 1;
        else if ((one[i]! + one[i + 1]!) / 2 - one[i + 2]! > (two[i]! + two[i + 1]!) / 2 - two[i + 2]! + 15) cooler += 1;
      }
      return { changed: count, warm, cooler };
    },
    [before, after] as const,
  );

const set = (page: Page, tag: string, value: string | null): Promise<void> =>
  page.locator(tag).evaluate((el, v) => (v === null ? el.removeAttribute("borders") : el.setAttribute("borders", v)), value);

for (const [name, look] of [
  ["the realistic Earth", "realistic"],
  ["the space view", "space"],
] as const) {
  test.describe(name, () => {
    for (const [when, time] of [
      ["by day", DAY],
      ["by night", NIGHT],
    ] as const) {
      test(`the countries' borders ${when}: off unless asked for, drawn on the land when switched on, gone when switched off, nothing drawn at rest`, async ({ page }) => {
        const tag = await open(page, look, time);
        expect(await bordersOf(page, tag)).toMatchObject({ countries: 0, regions: 0, builds: 0, shown: { countries: false, regions: false } });
        const plain = await shot(page, tag);
        await set(page, tag, "countries");
        await expect.poll(async () => (await bordersOf(page, tag)).shown.countries, { timeout: 30_000, message: "chizu's countries arrive and are drawn" }).toBe(true);
        await still(page, tag);
        const stats = await bordersOf(page, tag);
        expect(stats.countries, "the land borders of chizu's world").toBeGreaterThan(2000);
        expect(stats.shown.regions).toBe(false);
        const drawn = await changed(page, plain, await shot(page, tag));
        console.log(`${look} ${when}: ${drawn.changed} pixels changed, ${drawn.warm} of them the borders' yellow; ${stats.countries} segments`);
        expect(drawn.changed, "lines over Europe").toBeGreaterThan(400);
        expect(drawn.warm / drawn.changed, "and they are the borders' colour").toBeGreaterThan(0.6);
        // at rest with the borders on, nothing is drawn
        const before = await readCounts(page);
        await page.waitForTimeout(2000);
        expect((await readCounts(page)).draws - before.draws, "no draw at rest").toBe(0);
        await set(page, tag, null);
        await expect.poll(async () => (await bordersOf(page, tag)).shown.countries).toBe(false);
        await still(page, tag);
        expect((await changed(page, plain, await shot(page, tag))).changed, "the picture is as it was").toBeLessThan(40);
      });
    }

    test("when the shapes cannot be loaded (no chizu): no lines, an event with the reason, no error, and the Earth still draws", async ({ page }) => {
      const errors: string[] = [];
      const tag = await open(page, look, DAY, errors);
      const reason = page.locator(tag).evaluate(
        (el) =>
          new Promise<string>((resolve) => {
            el.addEventListener("chikyu-borders-unavailable", (event) => resolve((event as CustomEvent<{ reason: string }>).detail.reason), { once: true });
            Reflect.set(el, "borderData", { countries: () => Promise.reject(new Error("Cannot find module '@johnmorrisdotca/chizu/world-geo'")) });
            el.setAttribute("borders", "");
          }),
      );
      expect(await reason).toContain("chizu");
      await expect.poll(async () => (await bordersOf(page, tag)).failed).toBe(true);
      expect(await bordersOf(page, tag)).toMatchObject({ countries: 0, shown: { countries: false, regions: false } });
      // the Earth goes on: a turn of the view is drawn
      const draws = await drawsOf(page, tag);
      await page.locator(tag).evaluate((el) => (el as unknown as { setView(v: unknown, final: boolean): void }).setView({ yaw: 20, tilt: 0, zoom: 1, panX: 0, panY: 0 }, true));
      await expect.poll(() => drawsOf(page, tag)).toBeGreaterThan(draws);
      expect(await page.locator(tag).getAttribute("data-state")).toBe("live");
      expect(errors, "no error on the console").toEqual([]);
    });
  });
}

test.describe("the regions on the realistic Earth", () => {
  for (const [when, time] of [
    ["by day", DAY],
    ["by night", NIGHT],
  ] as const) {
    test(`${when}: asked of the page's loader only once the Earth is large enough, only for the countries in view, and drawn in their own batch`, async ({ page }) => {
      const tag = await open(page, "realistic", time);
      // Germany cut in two along the 10th meridian, and nothing for the other countries
      await page.locator(tag).evaluate((el) => {
        const asked: string[] = [];
        Reflect.set(window, "askedRegions", asked);
        const half = (code: string, west: number, east: number) => ({ properties: { code }, geometry: { type: "Polygon", coordinates: [[[west, 48], [east, 48], [east, 54], [west, 54], [west, 48]]] } });
        Reflect.set(el, "borderData", {
          regions: async (code: string) => {
            asked.push(code);
            return code === "DE" ? { features: [half("DE-W", 6, 10), half("DE-E", 10, 15)] } : null;
          },
        });
        el.setAttribute("borders", "countries");
      });
      await expect.poll(async () => (await bordersOf(page, tag)).shown.countries, { timeout: 30_000 }).toBe(true);
      await page.locator(tag).evaluate((el) => el.setAttribute("borders", "countries regions"));
      await still(page, tag);
      expect(await page.evaluate(() => Reflect.get(window, "askedRegions") as string[]), "the whole Earth is too small for regions: none asked for").toEqual([]);
      expect((await bordersOf(page, tag)).shown.regions).toBe(false);
      // zoom until the Earth's radius on the screen is 1000 pixels
      const box = (await page.locator(tag).boundingBox())!;
      const zoom = 1000 / (Math.min(box.width, box.height) / 2 / 1.08 - 1);
      await page.locator(tag).evaluate((el, z) => (el as unknown as { setView(v: unknown, final: boolean): void }).setView({ yaw: 0, tilt: 0, zoom: z, panX: 0, panY: 0 }, true), zoom);
      await expect.poll(async () => (await bordersOf(page, tag)).shown.regions, { timeout: 30_000, message: "Germany's regions arrive and are drawn" }).toBe(true);
      await still(page, tag);
      const asked = await page.evaluate(() => Reflect.get(window, "askedRegions") as string[]);
      expect(asked).toContain("DE");
      for (const far of ["JP", "BR", "AU", "US"]) expect(asked, `${far} is not in view`).not.toContain(far);
      const stats = await bordersOf(page, tag);
      expect(stats.loaded).toEqual(["DE"]);
      expect(stats.regions, "the 10th meridian from 48 to 54 degrees north, a degree a piece").toBe(6);
      const both = await shot(page, tag);
      await page.locator(tag).evaluate((el) => el.setAttribute("borders", "countries"));
      await expect.poll(async () => (await bordersOf(page, tag)).shown.regions).toBe(false);
      await still(page, tag);
      const drawn = await changed(page, await shot(page, tag), both);
      console.log(`regions ${when}: ${drawn.changed} pixels changed, ${drawn.warm} towards yellow, ${drawn.cooler} away from it`);
      expect(drawn.changed, "the line between the two halves").toBeGreaterThan(150);
      expect(drawn.warm / drawn.changed).toBeGreaterThan(0.6);
      // zoomed out again, the regions are put away and nothing more is asked for
      await page.locator(tag).evaluate((el) => el.setAttribute("borders", "countries regions"));
      await page.locator(tag).evaluate((el) => (el as unknown as { setView(v: unknown, final: boolean): void }).setView({ yaw: 0, tilt: 0, zoom: 1, panX: 0, panY: 0 }, true));
      await expect.poll(async () => (await bordersOf(page, tag)).shown.regions).toBe(false);
      expect(await page.evaluate(() => (Reflect.get(window, "askedRegions") as string[]).length)).toBe(asked.length);
    });
  }
});
