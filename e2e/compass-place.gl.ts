// The compass on a ride's picture can be put in a corner of the picture, an offset in from it (`compass-place`, `compass-offset`, the properties `compassPlace` and `compassOffset`).
// The ISS is the ride at a moment held by the test. Each corner is checked at a desktop and a phone size by the compass's own box against the element's box, the default is the top-left corner 8 pixels in, as before the attributes,
// and a change while riding moves the compass at once.
import { expect, test, type Page } from "@playwright/test";
import { routeElements } from "./recorded.ts";

const SPACE = "chikyu-space";
const AT = "2026-11-02T18:00Z";
const SIZES = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "phone", width: 390, height: 844 },
] as const;
const CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
type Corner = (typeof CORNERS)[number];

interface Boxes {
  host: { left: number; top: number; right: number; bottom: number };
  compass: { left: number; top: number; right: number; bottom: number; width: number; height: number };
  shown: boolean;
}

/** The compass's box and the element's, from the page's own layout. */
const boxes = (page: Page): Promise<Boxes> =>
  page.locator(SPACE).evaluate((el) => {
    const host = el.getBoundingClientRect();
    const box = el.shadowRoot!.getElementById("compass")!;
    const c = box.getBoundingClientRect();
    return {
      host: { left: host.left, top: host.top, right: host.right, bottom: host.bottom },
      compass: { left: c.left, top: c.top, right: c.right, bottom: c.bottom, width: c.width, height: c.height },
      shown: !box.hidden,
    };
  });
/** How far the compass is from each side of the element. */
const gaps = (b: Boxes): { left: number; top: number; right: number; bottom: number } => ({ left: b.compass.left - b.host.left, top: b.compass.top - b.host.top, right: b.host.right - b.compass.right, bottom: b.host.bottom - b.compass.bottom });
/** Where the corner's two gaps are the offset's and the other two are what is left. */
function expectCorner(b: Boxes, corner: Corner, x: number, y: number): void {
  const g = gaps(b);
  const [v, h] = corner.split("-") as ["top" | "bottom", "left" | "right"];
  expect(g[h], `${corner}: ${h} gap`).toBeCloseTo(x, 0);
  expect(g[v], `${corner}: ${v} gap`).toBeCloseTo(y, 0);
}
/** The whole compass inside the element on every side. */
function expectInside(b: Boxes, what: string): void {
  const g = gaps(b);
  for (const side of ["left", "top", "right", "bottom"] as const) expect(g[side], `${what}: ${side} gap`).toBeGreaterThanOrEqual(-0.01);
}

/** The page over the ISS, the ride settled and nothing moving (the clock held), with the compass showing. */
async function open(page: Page, size: (typeof SIZES)[number]): Promise<void> {
  await routeElements(page);
  await page.setViewportSize({ width: size.width, height: size.height });
  await page.goto(`/chikyu-earth/?look=space&time=${AT}&speed=0&center=-100,40&sats=stations&ride=iss&rview=above&light=lit`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(() => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { ride: { riding: boolean; compass: unknown } }).ride.compass !== null), { timeout: 30_000 }).toBe(true);
  await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { pause(): void }).pause());
  // the demo's own page may have set the attributes; each test starts from none
  await page.locator(SPACE).evaluate((el) => {
    el.removeAttribute("compass-place");
    el.removeAttribute("compass-offset");
  });
}
const set = (page: Page, attributes: Record<string, string | null>): Promise<void> =>
  page.locator(SPACE).evaluate((el, a) => {
    for (const [name, value] of Object.entries(a)) {
      if (value === null) el.removeAttribute(name);
      else el.setAttribute(name, value);
    }
  }, attributes);

for (const size of SIZES) {
  test.describe(size.name, () => {
    test(`${size.name}: with no attribute the compass is where it always was, in the top-left corner 8 pixels in`, async ({ page }) => {
      await open(page, size);
      const b = await boxes(page);
      expect(b.shown).toBe(true);
      expectCorner(b, "top-left", 8, 8);
      // the size of the compass is its own, the same with the attributes set to the default
      await set(page, { "compass-place": "top-left", "compass-offset": "8,8" });
      const same = await boxes(page);
      expect(same.compass).toEqual(b.compass);
      await set(page, { "compass-place": null, "compass-offset": null });
      expect((await boxes(page)).compass).toEqual(b.compass);
    });

    test(`${size.name}: each corner puts the compass in it, the offset in from the corner's two sides`, async ({ page }) => {
      await open(page, size);
      const first = (await boxes(page)).compass;
      for (const corner of CORNERS) {
        await set(page, { "compass-place": corner, "compass-offset": "16,96" });
        const b = await boxes(page);
        expectCorner(b, corner, 16, 96);
        expectInside(b, corner);
        // the same compass in another place
        expect(b.compass.width).toBeCloseTo(first.width, 1);
        expect(b.compass.height).toBeCloseTo(first.height, 1);
        // and a corner alone keeps the default offset
        await set(page, { "compass-offset": null });
        expectCorner(await boxes(page), corner, 8, 8);
        // one number is both
        await set(page, { "compass-offset": "24" });
        expectCorner(await boxes(page), corner, 24, 24);
      }
    });

    test(`${size.name}: an offset the picture has no room for leaves the compass against the far edge, inside it`, async ({ page }) => {
      await open(page, size);
      for (const corner of CORNERS) {
        for (const offset of ["9999,9999", "9999,0", "0,9999", "0,0"]) {
          await set(page, { "compass-place": corner, "compass-offset": offset });
          const b = await boxes(page);
          expectInside(b, `${corner} ${offset}`);
          expect(b.shown).toBe(true);
        }
        // far in both: against the opposite corner's edges
        await set(page, { "compass-place": corner, "compass-offset": "9999,9999" });
        const g = gaps(await boxes(page));
        const [v, h] = corner.split("-") as ["top" | "bottom", "left" | "right"];
        expect(g[h === "left" ? "right" : "left"], `${corner}: against the far side`).toBeCloseTo(0, 0);
        expect(g[v === "top" ? "bottom" : "top"], `${corner}: against the far end`).toBeCloseTo(0, 0);
      }
    });

    test(`${size.name}: a bad value is the default, and a change while riding moves the compass at once`, async ({ page }) => {
      await open(page, size);
      await set(page, { "compass-place": "bottom-right", "compass-offset": "16,96" });
      expectCorner(await boxes(page), "bottom-right", 16, 96);
      // the layout is read in the same turn as the change: no wait for a draw
      for (const corner of CORNERS) {
        const b = await page.locator(SPACE).evaluate((el, c) => {
          el.setAttribute("compass-place", c);
          const host = el.getBoundingClientRect();
          const r = el.shadowRoot!.getElementById("compass")!.getBoundingClientRect();
          return { host: { left: host.left, top: host.top, right: host.right, bottom: host.bottom }, compass: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }, shown: true };
        }, corner);
        expectCorner(b, corner, 16, 96);
      }
      // a bad corner is the top-left corner, a bad offset is 8,8; each is read by itself
      await set(page, { "compass-place": "middle" });
      expectCorner(await boxes(page), "top-left", 16, 96);
      await set(page, { "compass-place": "top-right", "compass-offset": "-4,x" });
      expectCorner(await boxes(page), "top-right", 8, 8);
      // taking the attributes away is the default again
      await set(page, { "compass-place": null, "compass-offset": null });
      expectCorner(await boxes(page), "top-left", 8, 8);
    });

    test(`${size.name}: the properties are the attributes, and the words and the arrow are held in a corner too`, async ({ page }) => {
      await open(page, size);
      await page.locator(SPACE).evaluate((el) => {
        const space = el as unknown as { compassPlace: string; compassOffset: { x: number; y: number } };
        space.compassPlace = "bottom-left";
        space.compassOffset = { x: 20, y: 30 };
      });
      expect(await page.locator(SPACE).getAttribute("compass-place")).toBe("bottom-left");
      expect(await page.locator(SPACE).getAttribute("compass-offset")).toBe("20,30");
      expectCorner(await boxes(page), "bottom-left", 20, 30);
      expect(await page.locator(SPACE).evaluate((el) => (el as unknown as { compassOffset: { x: number; y: number } }).compassOffset)).toEqual({ x: 20, y: 30 });
      // the arrow alone (no words) is a smaller box in the same corner
      await set(page, { compass: "north", "compass-place": "top-right", "compass-offset": "16,96" });
      const b = await boxes(page);
      expectCorner(b, "top-right", 16, 96);
      expect(b.compass.width).toBeLessThanOrEqual(64.5);
    });
  });
}
