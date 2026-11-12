// The grid and the names of the countries, in a real browser (Chromium, drawn in software), on the realistic Earth and on the space view: off unless asked for, the grid drawn on the Earth by day and
// by night and finer when the Earth is large, the names at their countries in the page's language, never on the far side, on the Earth's disc, never over one another or over the names of
// cities, places, stars and bodies, and nothing drawn at rest.
import { expect, test, type Page } from "@playwright/test";
import { COUNT_SCRIPT, readCounts } from "./gl.ts";

test.describe.configure({ mode: "serial" });
test.use({ reducedMotion: "reduce" });

interface Grid {
  shown: boolean;
  fine: boolean;
  segments: number;
  builds: number;
  failed: boolean;
}
interface Names {
  on: boolean;
  max: number;
  countries: number;
  names: number;
  renders: number;
  failed: boolean;
}
interface Box {
  kind: string;
  text: string;
  l: number;
  t: number;
  r: number;
  b: number;
}
const DAY = "2026-06-21T12:00Z";
const NIGHT = "2026-06-21T00:00Z";
/** Over the Sahara: Europe, Africa and the Middle East in sight, the Americas' west and Australia not. */
const OVER = "center=15,30";

const statsOf = <T>(page: Page, tag: string, key: string): Promise<T> => page.locator(tag).evaluate((el, k) => (Reflect.get(el, "stats") as Record<string, T>)[k]!, key);
const drawsOf = (page: Page, tag: string): Promise<number> => page.locator(tag).evaluate((el) => (Reflect.get(el, "stats") as { draws: number }).draws);
const setAttr = (page: Page, tag: string, name: string, value: string | null): Promise<void> =>
  page.locator(tag).evaluate((el, [n, v]) => (v === null ? el.removeAttribute(n!) : el.setAttribute(n!, v)), [name, value] as const);

async function open(page: Page, look: "realistic" | "space", time: string, query = "", errors: string[] = []): Promise<string> {
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/?look=${look}&time=${time}&speed=0&${OVER}${query}`);
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

/** How many pixels changed from one picture to the next. */
const changed = (page: Page, before: string, after: string): Promise<number> =>
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
      for (let i = 0; i < Math.min(one.length, two.length); i += 4) {
        if (Math.abs(one[i]! - two[i]!) + Math.abs(one[i + 1]! - two[i + 1]!) + Math.abs(one[i + 2]! - two[i + 2]!) >= 40) count += 1;
      }
      return count;
    },
    [before, after] as const,
  );

/** Every name shown over the element, as the page draws it: countries, cities, places, stars and constellations, and the space view's bodies. */
const names = (page: Page, tag: string): Promise<Box[]> =>
  page.locator(tag).evaluate((el) => {
    const out: { kind: string; text: string; l: number; t: number; r: number; b: number }[] = [];
    for (const [kind, selector] of [
      ["country", "#co-names .co-name"],
      ["city", "#cn-names .cn-name"],
      ["place", ".pl-name"],
      ["sky", "#sk-names > *"],
      ["body", ".sp-label"],
      ["marker", ".cm-label"],
    ] as const) {
      for (const node of el.shadowRoot!.querySelectorAll<HTMLElement>(selector)) {
        if (node.hidden || node.closest("[hidden]") || node.classList.contains("pl-measure") || !node.textContent) continue;
        const box = node.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        out.push({ kind, text: node.textContent, l: box.left, t: box.top, r: box.right, b: box.bottom });
      }
    }
    return out;
  });

const zoom = (page: Page, tag: string, value: number): Promise<void> =>
  page.locator(tag).evaluate((el, z) => (el as unknown as { setView(v: unknown, final: boolean): void }).setView({ yaw: 0, tilt: 0, zoom: z, panX: 0, panY: 0 }, true), value);

for (const [name, look] of [
  ["the realistic Earth", "realistic"],
  ["the space view", "space"],
] as const) {
  test.describe(name, () => {
    for (const [when, time] of [
      ["by day", DAY],
      ["by night", NIGHT],
    ] as const) {
      test(`the grid ${when}: off unless asked for, drawn when switched on, finer on a large Earth, gone when switched off, nothing drawn at rest`, async ({ page }) => {
        const tag = await open(page, look, time);
        expect(await statsOf<Grid>(page, tag, "grid")).toMatchObject({ shown: false, builds: 0, segments: 0 });
        const plain = await shot(page, tag);
        await setAttr(page, tag, "grid", "");
        await expect.poll(async () => (await statsOf<Grid>(page, tag, "grid")).shown, { timeout: 30_000 }).toBe(true);
        await still(page, tag);
        const grid = await statsOf<Grid>(page, tag, "grid");
        const drawn = await changed(page, plain, await shot(page, tag));
        console.log(`${look} ${when}: the grid changed ${drawn} pixels, ${grid.segments} segments, fine ${grid.fine}`);
        expect(drawn, "lines over the Earth").toBeGreaterThan(800);
        expect(grid.builds, "the lines were made once").toBe(1);
        // at rest with the grid on, nothing is drawn
        const before = await readCounts(page);
        await page.waitForTimeout(2000);
        expect((await readCounts(page)).draws - before.draws, "no draw at rest").toBe(0);
        await setAttr(page, tag, "grid", null);
        await expect.poll(async () => (await statsOf<Grid>(page, tag, "grid")).shown).toBe(false);
        await still(page, tag);
        expect(await changed(page, plain, await shot(page, tag)), "the picture is as it was").toBeLessThan(40);
        // on again: a large Earth has a line every 15 degrees, a small one every 30, and the lines are never made again
        await setAttr(page, tag, "grid", "");
        await zoom(page, tag, 4);
        await expect.poll(async () => (await statsOf<Grid>(page, tag, "grid")).fine, { timeout: 30_000 }).toBe(true);
        const fine = (await statsOf<Grid>(page, tag, "grid")).segments;
        await zoom(page, tag, 0.3);
        await expect.poll(async () => (await statsOf<Grid>(page, tag, "grid")).fine, { timeout: 30_000 }).toBe(false);
        expect((await statsOf<Grid>(page, tag, "grid")).segments).toBeLessThan(fine);
        expect((await statsOf<Grid>(page, tag, "grid")).builds, "the lines were made once").toBe(1);
      });
    }

    test("the country names: off unless asked for, at their countries in English and Japanese, none from the far side, on the Earth's disc, over no other name, nothing drawn at rest", async ({ page }) => {
      const errors: string[] = [];
      const tag = await open(page, look, DAY, "", errors);
      expect(await statsOf<Names>(page, tag, "countryNames")).toMatchObject({ on: false, countries: 0, names: 0 });
      expect(await page.locator(tag).evaluate((el) => el.shadowRoot!.getElementById("co-names")), "nothing is added until asked for").toBeNull();
      // every other name layer on, to keep clear of
      await page.locator(tag).evaluate((el) => {
        el.setAttribute("city-names", "40");
        el.setAttribute("star-names", "");
        Reflect.set(el, "places", [
          { id: "here", lon: 13.4, lat: 52.5, label: "You are here", kind: "here" },
          { id: "cairo", lon: 31.2, lat: 30, label: "Cairo friends", kind: "favourite" },
          { id: "lagos", lon: 3.4, lat: 6.5, label: "Lagos", kind: "favourite" },
        ]);
        el.setAttribute("country-names", "");
      });
      await expect.poll(async () => (await statsOf<Names>(page, tag, "countryNames")).names, { timeout: 30_000, message: "chizu's countries arrive and are named" }).toBeGreaterThan(5);
      await expect.poll(async () => (await statsOf<{ names: number }>(page, tag, "cityNames")).names, { timeout: 30_000 }).toBeGreaterThan(0);
      await still(page, tag);
      const check = async (lang: "en" | "ja"): Promise<void> => {
        const all = await names(page, tag);
        const countries = all.filter((one) => one.kind === "country");
        const texts = countries.map((one) => one.text);
        console.log(`${look} ${lang}: ${countries.length} country names among ${all.length} names: ${texts.join(", ")}`);
        expect(countries.length).toBeGreaterThan(5);
        if (lang === "en") {
          expect(texts.some((text) => ["ALGERIA", "LIBYA", "EGYPT", "SUDAN", "CHAD", "NIGER", "MALI"].includes(text)), "the Sahara's countries").toBe(true);
          for (const far of ["AUSTRALIA", "CHILE", "PERU", "NEW ZEALAND", "JAPAN"]) expect(texts, `${far} is on the far side`).not.toContain(far);
        } else {
          expect(texts.every((text) => /[぀-ヿ一-鿿]/.test(text) || /^[A-Z .,'&-]+$/.test(text)), "Japanese names where chizu has them").toBe(true);
          expect(texts.filter((text) => /[぀-ヿ一-鿿]/.test(text)).length).toBeGreaterThan(5);
          for (const far of ["オーストラリア", "チリ", "ペルー", "日本"]) expect(texts, `${far} is on the far side`).not.toContain(far);
        }
        // on the Earth's disc: the element's middle, the radius the names were laid out for
        const box = (await page.locator(tag).boundingBox())!;
        const radius = await statsOf<number>(page, tag, "cityNames").then((stats) => (stats as unknown as { radius: number }).radius);
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        for (const one of countries) {
          for (const [x, y] of [
            [one.l, one.t],
            [one.r, one.t],
            [one.l, one.b],
            [one.r, one.b],
          ] as const)
            expect(Math.hypot(x - cx, y - cy), `${one.text} is on the Earth`).toBeLessThanOrEqual(radius + 1.5);
        }
        // no country name over another name of any kind, measured as the page draws them
        for (const one of countries) {
          for (const other of all) {
            if (other === one) continue;
            const apart = one.r <= other.l + 0.5 || other.r <= one.l + 0.5 || one.b <= other.t + 0.5 || other.b <= one.t + 0.5;
            expect(apart, `${one.text} and the ${other.kind} name ${other.text} do not overlap`).toBe(true);
          }
        }
      };
      await check("en");
      await page.locator(tag).evaluate((el) => el.setAttribute("lang", "ja"));
      await expect.poll(async () => (await names(page, tag)).some((one) => one.kind === "country" && /[぀-ヿ一-鿿]/.test(one.text)), { message: "written again in Japanese" }).toBe(true);
      await still(page, tag);
      await check("ja");
      // at rest with the names on, nothing is drawn
      const before = await readCounts(page);
      const renders = (await statsOf<Names>(page, tag, "countryNames")).renders;
      await page.waitForTimeout(2000);
      expect((await readCounts(page)).draws - before.draws, "no draw at rest").toBe(0);
      expect((await statsOf<Names>(page, tag, "countryNames")).renders, "nor are the names laid out again").toBe(renders);
      // more names on a larger Earth (with the country names alone), and none when switched off
      await page.locator(tag).evaluate((el) => {
        el.removeAttribute("city-names");
        el.removeAttribute("star-names");
        el.removeAttribute("places");
      });
      await still(page, tag);
      const few = (await statsOf<Names>(page, tag, "countryNames")).names;
      // a little closer (the space view at 3 times is a few hundred kilometres across, with two or three countries in it)
      await zoom(page, tag, 1.5);
      await expect.poll(async () => (await statsOf<Names>(page, tag, "countryNames")).names, { timeout: 30_000 }).toBeGreaterThan(few);
      await setAttr(page, tag, "country-names", null);
      await expect.poll(async () => (await names(page, tag)).filter((one) => one.kind === "country").length).toBe(0);
      expect(errors, "no error on the console").toEqual([]);
    });
  });
}

test.describe("pictures of the grid, the borders and the country names", () => {
  for (const [device, viewport] of [
    ["desk", { width: 1280, height: 900 }],
    ["phone", { width: 390, height: 844 }],
  ] as const) {
    for (const lang of ["en", "ja"] as const) {
      for (const [when, time] of [
        ["day", DAY],
        ["night", NIGHT],
      ] as const) {
        test(`${device}, ${lang}, ${when}`, async ({ page }, info) => {
          await page.setViewportSize(viewport);
          const tag = await open(page, "realistic", time, `&lang=${lang}&grid=on&country-names=on&borders=on`);
          await expect.poll(async () => (await statsOf<Names>(page, tag, "countryNames")).names, { timeout: 30_000 }).toBeGreaterThan(3);
          await expect.poll(async () => (await statsOf<Grid>(page, tag, "grid")).shown).toBe(true);
          await still(page, tag);
          await page.locator(tag).screenshot({ path: info.outputPath(`grid-names-${device}-${lang}-${when}.png`) });
        });
      }
    }
  }
  test("the space view, desk, en, day", async ({ page }, info) => {
    const tag = await open(page, "space", DAY, "&grid=on&country-names=on&borders=on");
    await expect.poll(async () => (await statsOf<Names>(page, tag, "countryNames")).names, { timeout: 30_000 }).toBeGreaterThan(3);
    await still(page, tag);
    await page.locator(tag).screenshot({ path: info.outputPath("grid-names-space-desk-en-day.png") });
  });
});
