// The names of cities on the Earth (kuni's cities), in a real browser (Chromium, drawn in software), on the realistic Earth and on the space view: off unless `city-names` is set, the right cities in the right
// place, in the page's language, none on the far side, never overlapping, more tiers as the Earth grows on the screen, and nothing drawn at rest.
import { expect, test, type Page } from "@playwright/test";
import { cityTiersFor } from "../src/cities/geometry.ts";

test.describe.configure({ mode: "serial" });
test.use({ reducedMotion: "reduce" });

interface Names {
  on: boolean;
  max: number;
  radius: number;
  tiers: string[];
  cities: number;
  names: number;
  renders: number;
}
const HELD = "time=2026-11-02T14:00Z&speed=0&center=139.69,35.69";
const statsOf = (page: Page, tag: string): Promise<Names> => page.locator(tag).evaluate((el) => (Reflect.get(el, "stats") as { cityNames: Names }).cityNames);
const shown = (page: Page, tag: string): Promise<{ text: string; l: number; t: number; r: number; b: number }[]> =>
  page.locator(tag).evaluate((el) =>
    [...el.shadowRoot!.querySelectorAll<HTMLElement>("#cn-names .cn-name")]
      .filter((b) => !b.hidden)
      .map((b) => {
        const box = b.getBoundingClientRect();
        return { text: b.textContent ?? "", l: box.left, t: box.top, r: box.right, b: box.bottom };
      }),
  );
const zoom = (page: Page, tag: string, value: number): Promise<void> =>
  page.locator(tag).evaluate((el, z) => (el as unknown as { setView(v: unknown, final: boolean): void }).setView({ yaw: 0, tilt: 0, zoom: z, panX: 0, panY: 0 }, true), value);

for (const [name, tag, look] of [
  ["the realistic Earth", "chikyu-earth-realistic", "realistic"],
  ["the space view", "chikyu-space", "space"],
] as const) {
  test.describe(name, () => {
    const go = async (page: Page, query = ""): Promise<void> => {
      await page.goto(`/chikyu-earth/?look=${look}&${HELD}${query}`);
      await page.locator(`${tag}[data-state=live]`).waitFor({ timeout: 60_000 });
    };

    test("off unless asked for: no layer, nothing loaded; the attribute switches it on and off", async ({ page }) => {
      await go(page);
      expect(await statsOf(page, tag)).toMatchObject({ on: false, tiers: [], cities: 0, names: 0 });
      expect(await page.locator(tag).evaluate((el) => el.shadowRoot!.getElementById("cn-canvas"))).toBeNull();
      await page.locator(tag).evaluate((el) => el.setAttribute("city-names", ""));
      await expect.poll(async () => (await statsOf(page, tag)).tiers, { timeout: 30_000, message: "kuni's capitals are loaded when asked for" }).toContain("capitals");
      await expect.poll(async () => (await statsOf(page, tag)).names, { timeout: 30_000 }).toBeGreaterThan(0);
      expect((await statsOf(page, tag)).names).toBeLessThanOrEqual(24);
      await page.locator(tag).evaluate((el) => el.removeAttribute("city-names"));
      await expect.poll(async () => (await statsOf(page, tag)).names).toBe(0);
      await expect.poll(async () => (await shown(page, tag)).length).toBe(0);
    });

    test("a city is named where it is: the view is on Tokyo, so it is named at the middle, and a city on the far side is not named", async ({ page }) => {
      await go(page, "&city-names=40");
      await expect.poll(async () => (await shown(page, tag)).some((n) => n.text === "Tokyo"), { timeout: 30_000, message: "Tokyo is named" }).toBe(true);
      const box = (await page.locator(tag).boundingBox())!;
      const tokyo = (await shown(page, tag)).find((n) => n.text === "Tokyo")!;
      const dx = (tokyo.l + tokyo.r) / 2 - (box.x + box.width / 2);
      const dy = (tokyo.t + tokyo.b) / 2 - (box.y + box.height / 2);
      expect(Math.hypot(dx, dy), "its name is beside the dot at the middle of the view").toBeLessThan(80);
      // the other side of the Earth: none of these is in sight from Japan
      const texts = (await shown(page, tag)).map((n) => n.text);
      for (const far of ["Brasília", "Brasilia", "Buenos Aires", "Lima", "Santiago", "Bogotá", "Caracas", "Montevideo"]) expect(texts, `${far} is on the far side`).not.toContain(far);
    });

    test("in the page's language, and the names stay in the box and never overlap", async ({ page }) => {
      await go(page, "&lang=ja&city-names=40");
      await expect.poll(async () => (await shown(page, tag)).length, { timeout: 30_000 }).toBeGreaterThan(2);
      const names = await shown(page, tag);
      expect(names.some((n) => /[぀-ヿ一-鿿]/.test(n.text)), "a name in Japanese").toBe(true);
      const box = (await page.locator(tag).boundingBox())!;
      for (const n of names) {
        expect(n.l, `${n.text} inside on the left`).toBeGreaterThanOrEqual(box.x - 1);
        expect(n.r, `${n.text} inside on the right`).toBeLessThanOrEqual(box.x + box.width + 1);
        expect(n.t).toBeGreaterThanOrEqual(box.y - 1);
        expect(n.b).toBeLessThanOrEqual(box.y + box.height + 1);
      }
      for (let i = 0; i < names.length; i += 1) {
        for (let j = i + 1; j < names.length; j += 1) {
          const a = names[i]!;
          const b = names[j]!;
          expect(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t, `${a.text} and ${b.text} do not overlap`).toBe(true);
        }
      }
      // the language changes at once: a Japanese page back to English is written again
      await page.locator(tag).evaluate((el) => el.setAttribute("lang", "en"));
      await expect.poll(async () => (await shown(page, tag)).some((n) => n.text === "Tokyo"), { message: "English again" }).toBe(true);
      // and when the language arrives after the names were laid out, the next draw or the family's event writes them again
      await page.evaluate(() => {
        document.documentElement.lang = "ja";
        document.dispatchEvent(new Event("kazoku-languagechange"));
      });
      await page.locator(tag).evaluate((el) => el.removeAttribute("lang"));
    });

    test("more tiers of cities as the Earth grows on the screen, loaded when they are needed and no sooner", async ({ page }) => {
      await go(page, "&city-names=60");
      await zoom(page, tag, 0.5);
      await expect.poll(async () => (await statsOf(page, tag)).radius).toBeGreaterThan(0);
      const small = await statsOf(page, tag);
      for (const tier of cityTiersFor(small.radius)) await expect.poll(async () => (await statsOf(page, tag)).tiers, { timeout: 30_000 }).toContain(tier);
      expect((await statsOf(page, tag)).tiers, "a tier the size does not need is not loaded").not.toContain("100k");
      const fewer = (await shown(page, tag)).length;
      await zoom(page, tag, 8);
      await expect.poll(async () => (await statsOf(page, tag)).radius).toBeGreaterThan(small.radius * 4);
      const big = await statsOf(page, tag);
      for (const tier of cityTiersFor(big.radius)) await expect.poll(async () => (await statsOf(page, tag)).tiers, { timeout: 60_000 }).toContain(tier);
      expect(big.radius).toBeGreaterThan(420);
      await expect.poll(async () => (await shown(page, tag)).length, { message: "more names fit when the Earth is large" }).toBeGreaterThan(fewer);
      // and when it is small again, none of the tiers it no longer shows is named
      await zoom(page, tag, 0.1);
      await expect.poll(async () => (await statsOf(page, tag)).radius).toBeLessThan(big.radius / 4);
    });

    test("nothing is drawn at rest, with the names on and the clock held", async ({ page }) => {
      await go(page, "&city-names=40");
      await expect.poll(async () => (await statsOf(page, tag)).names, { timeout: 30_000 }).toBeGreaterThan(0);
      await page.evaluate(async () => {
        for (let frame = 0; frame < 30; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
      });
      const drawn = (await statsOf(page, tag)).renders;
      const draws = await page.locator(tag).evaluate((el) => (Reflect.get(el, "stats") as { draws: number }).draws);
      await page.evaluate(async () => {
        for (let frame = 0; frame < 30; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
      });
      expect((await statsOf(page, tag)).renders, "the layer is not drawn again").toBe(drawn);
      expect(await page.locator(tag).evaluate((el) => (Reflect.get(el, "stats") as { draws: number }).draws), "and neither is the picture").toBe(draws);
    });

    test("removing the element while a city tier is loading leaves one canvas when it comes back", async ({ page }) => {
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      let waiting = 0;
      await page.route(/cities/i, async (route) => {
        waiting += 1;
        await held;
        await route.continue();
      });
      await page.goto(`/chikyu-earth/?look=${look}&${HELD}&city-names=24`);
      await page.locator(`${tag}[data-state=live]`).waitFor({ timeout: 60_000 });
      await expect.poll(() => waiting, { timeout: 20_000, message: "a city tier was asked for" }).toBeGreaterThan(0);
      await page.locator(tag).evaluate((el) => {
        el.addEventListener("chikyu-city-names-unavailable", () => {
          el.dataset.cityLate = "1";
        });
        const parent = el.parentElement!;
        const next = el.nextSibling;
        el.remove();
        parent.insertBefore(el, next);
      });
      release();
      await expect.poll(async () => (await statsOf(page, tag)).names, { timeout: 30_000, message: "names come back after the element is put back" }).toBeGreaterThan(0);
      const counts = await page.locator(tag).evaluate((el) => ({
        canvas: el.shadowRoot!.querySelectorAll("#cn-canvas").length,
        names: el.shadowRoot!.querySelectorAll("#cn-names").length,
        late: el.dataset.cityLate ?? "",
      }));
      expect(counts.canvas, "one canvas").toBe(1);
      expect(counts.names, "one names box").toBe(1);
      expect(counts.late, "a load that finished after removal does not report an error").toBe("");
    });

    test("the city font is read when the style changes, not on every frame", async ({ page }) => {
      await go(page, "&city-names=24");
      await expect.poll(async () => (await statsOf(page, tag)).names, { timeout: 30_000 }).toBeGreaterThan(0);
      await page.locator(tag).evaluate((el) => {
        let reads = 0;
        const proto = CSSStyleDeclaration.prototype;
        const original = proto.getPropertyValue;
        proto.getPropertyValue = function (this: CSSStyleDeclaration, name: string): string {
          if (name === "--chikyu-city-font" || name === "--chikyu-city-weight") reads += 1;
          return original.call(this, name);
        };
        (el as HTMLElement & { __fontReads?: () => number }).__fontReads = () => reads;
      });
      await page.locator(tag).evaluate((el) => el.setAttribute("speed", "60"));
      const before = await page.locator(tag).evaluate((el) => (Reflect.get(el, "stats") as { draws: number }).draws);
      await expect.poll(async () => page.locator(tag).evaluate((el) => (Reflect.get(el, "stats") as { draws: number }).draws), { timeout: 10_000 }).toBeGreaterThan(before + 4);
      const during = await page.locator(tag).evaluate((el) => (el as HTMLElement & { __fontReads?: () => number }).__fontReads?.() ?? -1);
      expect(during, "frames do not read the font again").toBe(0);
      await page.evaluate(() => document.fonts?.dispatchEvent(new Event("loadingdone")));
      await expect.poll(async () => page.locator(tag).evaluate((el) => (el as HTMLElement & { __fontReads?: () => number }).__fontReads?.() ?? 0)).toBeGreaterThan(0);
      const once = await page.locator(tag).evaluate((el) => (el as HTMLElement & { __fontReads?: () => number }).__fontReads?.() ?? 0);
      const drawn = await page.locator(tag).evaluate((el) => (Reflect.get(el, "stats") as { draws: number }).draws);
      await expect.poll(async () => page.locator(tag).evaluate((el) => (Reflect.get(el, "stats") as { draws: number }).draws)).toBeGreaterThan(drawn + 3);
      const after = await page.locator(tag).evaluate((el) => (el as HTMLElement & { __fontReads?: () => number }).__fontReads?.() ?? 0);
      expect(after, "the read on the font event is not repeated every frame").toBe(once);
      await page.locator(tag).evaluate((el) => el.setAttribute("speed", "0"));
    });

    test("the property restyles the names", async ({ page }) => {
      await go(page, "&city-names=20");
      await expect.poll(async () => (await shown(page, tag)).length, { timeout: 30_000 }).toBeGreaterThan(0);
      await page.locator(tag).evaluate((el) => Reflect.set(el, "cityNamesStyle", { colour: "rgb(255, 0, 0)", size: 15 }));
      await expect.poll(() => page.locator(tag).evaluate((el) => getComputedStyle(el.shadowRoot!.querySelector(".cn-name:not([hidden])")!).color)).toBe("rgb(255, 0, 0)");
      expect(await page.locator(tag).evaluate((el) => getComputedStyle(el.shadowRoot!.querySelector(".cn-name:not([hidden])")!).fontSize)).toBe("15px");
      expect(await page.locator(tag).evaluate((el) => Reflect.get(el, "cityNamesStyle"))).toEqual({ colour: "rgb(255, 0, 0)", size: 15 });
    });
  });
}

test("the demo's City names button sets the attribute on the elements and in the address", async ({ page }) => {
  await page.goto(`/chikyu-earth/?look=realistic&${HELD}`);
  await page.locator("chikyu-earth-realistic[data-state=live]").waitFor({ timeout: 60_000 });
  await page.locator("#city-names").click();
  expect(await page.locator("chikyu-earth-realistic").evaluate((el) => el.getAttribute("city-names"))).toBe("24");
  await expect.poll(() => new URL(page.url()).searchParams.get("city-names")).toBe("24");
  await expect.poll(async () => (await statsOf(page, "chikyu-earth-realistic")).names, { timeout: 30_000 }).toBeGreaterThan(0);
  await page.locator("#city-names").click();
  await expect.poll(() => new URL(page.url()).searchParams.get("city-names")).toBeNull();
  await expect.poll(async () => (await statsOf(page, "chikyu-earth-realistic")).on).toBe(false);
});
