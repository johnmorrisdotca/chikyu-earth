// The Earth's own names keep clear of the ride's compass and its heading label, which sit inside the element's shadow root where the page's `keepOut` boxes cannot reach them.
// The ISS is the ride at a moment held by the test. The compass is moved over a named city (the compass-place and compass-offset attributes), and then no name of a city, a sea or a country may touch it.
import { expect, test, type Page } from "@playwright/test";
import { routeElements } from "./recorded.ts";

test.use({ reducedMotion: "reduce" });

const SPACE = "chikyu-space";
const AT = "2026-11-02T20:10Z";

interface Box {
  text: string;
  l: number;
  t: number;
  r: number;
  b: number;
}

/** The names shown by the layers of cities, seas and countries, in the page's own pixels. */
const names = (page: Page): Promise<Box[]> =>
  page.locator(SPACE).evaluate((el) =>
    [...el.shadowRoot!.querySelectorAll<HTMLElement>("#cn-names .cn-name, #sea-names .sea-name, .co-name")]
      .filter((one) => !one.hidden)
      .map((one) => {
        const box = one.getBoundingClientRect();
        return { text: one.textContent ?? "", l: box.left, t: box.top, r: box.right, b: box.bottom };
      }),
  );

/** The compass's own box (the dial and the heading label), and the element's, in the page's pixels. */
const compass = (page: Page): Promise<{ l: number; t: number; r: number; b: number; host: { l: number; t: number } }> =>
  page.locator(SPACE).evaluate((el) => {
    const c = el.shadowRoot!.getElementById("compass")!.getBoundingClientRect();
    const host = el.getBoundingClientRect();
    return { l: c.left, t: c.top, r: c.right, b: c.bottom, host: { l: host.left, t: host.top } };
  });

const touches = (a: Box, c: { l: number; t: number; r: number; b: number }): boolean => a.l < c.r && a.r > c.l && a.t < c.b && a.b > c.t;

for (const size of [
  { name: "desktop", width: 1280, height: 900 },
  { name: "phone", width: 390, height: 844 },
] as const) {
  test(`${size.name}: no name is drawn under the ride's compass or its heading label, wherever the compass is put`, async ({ page }) => {
    await routeElements(page);
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto(`/chikyu-earth/?look=space&time=${AT}&speed=0&center=-100,40&sats=stations&ride=iss&rview=above&light=lit&city-names=60&sea-names&country-names=on`);
    await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
    await expect.poll(() => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { ride: { compass: unknown } }).ride.compass !== null), { timeout: 30_000 }).toBe(true);
    await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { pause(): void }).pause());
    await page.locator(SPACE).evaluate((el) => {
      el.removeAttribute("compass-place");
      el.removeAttribute("compass-offset");
    });
    await expect.poll(async () => (await names(page)).length, { timeout: 30_000, message: "names are drawn" }).toBeGreaterThan(5);
    const host = (await compass(page)).host;
    // a name in the middle of the picture, and the compass moved to sit over it
    for (const pick of [0, 3, 6]) {
      const all = (await names(page)).filter((n) => n.l - host.l > 120 && n.t - host.t > 120).sort((a, b) => a.t - b.t || a.l - b.l);
      const target = all[Math.min(pick, all.length - 1)]!;
      const offset = `${Math.max(0, Math.round(target.l - host.l - 20))},${Math.max(0, Math.round(target.t - host.t - 20))}`;
      await page.locator(SPACE).evaluate((el, value) => el.setAttribute("compass-offset", value), offset);
      await expect
        .poll(
          async () => {
            const c = await compass(page);
            return (await names(page)).filter((n) => touches(n, c)).map((n) => n.text);
          },
          { timeout: 15_000, message: `no name touches the compass put over ${target.text}` },
        )
        .toEqual([]);
      expect((await names(page)).length, "the other names stay").toBeGreaterThan(3);
    }
    // a compass at the default corner, in each corner, is kept clear of as well
    for (const corner of ["top-left", "top-right", "bottom-left", "bottom-right"]) {
      await page.locator(SPACE).evaluate((el, c) => el.setAttribute("compass-place", c), corner);
      await expect
        .poll(
          async () => {
            const c = await compass(page);
            return (await names(page)).filter((n) => touches(n, c)).map((n) => n.text);
          },
          { timeout: 15_000, message: `no name touches the compass in the ${corner} corner` },
        )
        .toEqual([]);
    }
  });
}
