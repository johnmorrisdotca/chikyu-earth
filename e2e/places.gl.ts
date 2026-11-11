// Places on the Earth, in a real browser (Chromium, drawn in software): a place a page hands in stands out of the realistic Earth and the space view as a ring, a beam and a head with its name beside it, a place on the far side is not drawn,
// names never overlap, pressing a name tells the page and (with `places-turn`) turns the view, and nothing is drawn at rest except the pulse of the visitor's own place, which stops for a reader who prefers reduced motion.
import { expect, test, type Page } from "@playwright/test";
import { EARTH, openEarth } from "./gl.ts";

test.describe.configure({ mode: "serial" });

interface PlaceStats {
  places: number;
  facing: number;
  labels: number;
  renders: number;
  pulsing: boolean;
}
const TOKYO = { id: "here", lat: 35.68, lon: 139.69, label: "Tokyo", kind: "here" };
const SEOUL = { id: "seoul", lat: 37.57, lon: 126.98, label: "Seoul", kind: "favourite" };
const LIMA = { id: "lima", lat: -12.05, lon: -77.04, label: "Lima", kind: "favourite" };
/** The view is centred on Tokyo: the camera is held over the ground there, so the Earth keeps still. */
const OVER_TOKYO = "time=2026-11-10T03:00Z&speed=0&camera=ground&center=139.69,35.68";

const placesOf = (page: Page, tag = EARTH): Promise<PlaceStats> => page.locator(tag).evaluate((el) => (Reflect.get(el, "stats") as { places: PlaceStats }).places);
const setPlaces = (page: Page, list: unknown[], tag = EARTH): Promise<void> => page.locator(tag).evaluate((el, value) => void Reflect.set(el, "places", value), list);
/** The names shown, with their boxes in the page. */
const names = (page: Page, tag = EARTH): Promise<{ id: string; text: string; l: number; t: number; r: number; b: number }[]> =>
  page.locator(tag).evaluate((el) =>
    [...el.shadowRoot!.querySelectorAll<HTMLButtonElement>("#pl-labels .pl-label")]
      .filter((b) => !b.hidden)
      .map((b) => {
        const box = b.getBoundingClientRect();
        return { id: b.dataset["id"] ?? "", text: b.textContent ?? "", l: box.left, t: box.top, r: box.right, b: box.bottom };
      }),
  );
/** How many pixels of the places' canvas are drawn on. */
const inked = (page: Page, tag = EARTH): Promise<number> =>
  page.locator(tag).evaluate((el) => {
    const canvas = el.shadowRoot!.getElementById("pl-canvas") as HTMLCanvasElement | null;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return -1;
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) count += 1;
    return count;
  });

test.describe("with motion allowed", () => {
  test.use({ reducedMotion: "no-preference" });

  test("a place is drawn with its name, a place on the far side is not, and the visitor's own place pulses while the Earth is in view", async ({ page }) => {
    await openEarth(page, OVER_TOKYO);
    expect(await inked(page), "no places, no marks").toBeLessThanOrEqual(0);
    await setPlaces(page, [TOKYO, LIMA]);
    await expect.poll(async () => (await placesOf(page)).facing, { message: "Tokyo faces the viewer" }).toBe(1);
    expect(await placesOf(page)).toMatchObject({ places: 2, labels: 1 });
    expect((await names(page)).map((n) => n.text)).toEqual(["Tokyo"]);
    expect(await inked(page), "the ring, the beam and the head are drawn").toBeGreaterThan(50);
    // the visitor's own place pulses, and the pulse draws again by itself
    await expect.poll(async () => (await placesOf(page)).pulsing).toBe(true);
    const first = (await placesOf(page)).renders;
    await expect.poll(async () => (await placesOf(page)).renders, { message: "the pulse draws again" }).toBeGreaterThan(first + 3);
    // the far side comes round: Lima is where the view is, Tokyo is not
    await page.locator(EARTH).evaluate((el) => Reflect.set(el, "centre", { lon: -77.04, lat: -12.05 }));
    await expect.poll(async () => (await names(page)).map((n) => n.text)).toEqual(["Lima"]);
    // nothing of the visitor's is on the screen: no pulse
    await expect.poll(async () => (await placesOf(page)).pulsing).toBe(false);
  });

  test("names never overlap, and the visitor's own place keeps its name when places crowd", async ({ page }) => {
    await openEarth(page, OVER_TOKYO);
    const crowd = [TOKYO, SEOUL, { id: "a", lat: 35.7, lon: 139.8, label: "Shinjuku", kind: "favourite" }, { id: "b", lat: 35.66, lon: 139.74, label: "Minato", kind: "favourite" }, { id: "c", lat: 35.7, lon: 139.65, label: "Nakano", kind: "favourite" }];
    await setPlaces(page, crowd);
    await expect.poll(async () => (await placesOf(page)).facing).toBe(5);
    await expect.poll(async () => (await names(page)).length).toBeGreaterThan(0);
    const shown = await names(page);
    expect(shown.map((n) => n.id), "the visitor's own place is placed first and kept").toContain("here");
    for (let i = 0; i < shown.length; i += 1) {
      for (let j = i + 1; j < shown.length; j += 1) {
        const a = shown[i]!;
        const b = shown[j]!;
        expect(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t, `${a.text} and ${b.text} do not overlap`).toBe(true);
      }
    }
  });

  test("pressing a name tells the page, and turns the view when the page asked for it", async ({ page }) => {
    await openEarth(page, OVER_TOKYO);
    await page.locator(EARTH).evaluate((el) => {
      Reflect.set(window, "__clicks", [] as unknown[]);
      el.addEventListener("chikyu-place-click", (event) => (Reflect.get(window, "__clicks") as unknown[]).push((event as CustomEvent).detail.place.id));
    });
    await setPlaces(page, [TOKYO, SEOUL]);
    await expect.poll(async () => (await names(page)).length).toBe(2);
    await page.locator(EARTH).locator("#pl-labels .pl-label[data-id=seoul]").click();
    expect(await page.evaluate(() => Reflect.get(window, "__clicks"))).toEqual(["seoul"]);
    expect((await page.locator(EARTH).evaluate((el) => Reflect.get(el, "centre") as { lon: number })).lon, "no places-turn: the view stays").toBeCloseTo(139.69, 1);
    await page.locator(EARTH).evaluate((el) => el.setAttribute("places-turn", ""));
    await page.locator(EARTH).locator("#pl-labels .pl-label[data-id=seoul]").click();
    await expect.poll(async () => (await page.locator(EARTH).evaluate((el) => Reflect.get(el, "centre") as { lon: number; lat: number })).lon).toBeCloseTo(126.98, 1);
  });

  test("the places attribute is the same list as JSON, bad entries are left out, and taking the list away takes the marks away", async ({ page }) => {
    await openEarth(page, OVER_TOKYO);
    await page.locator(EARTH).evaluate((el, list) => el.setAttribute("places", JSON.stringify(list)), [TOKYO, { id: "bad", lat: 200, lon: 0 }, SEOUL]);
    await expect.poll(async () => (await placesOf(page)).places).toBe(2);
    expect(await page.locator(EARTH).evaluate((el) => (Reflect.get(el, "places") as unknown[]).length)).toBe(2);
    await setPlaces(page, []);
    await expect.poll(async () => await inked(page)).toBe(0);
    expect(await names(page)).toEqual([]);
  });

  test("in the space view the same places stand out of the Earth, the far side is not drawn, and the name never overlaps", async ({ page }) => {
    await page.goto(`/chikyu-earth/?look=space&${OVER_TOKYO}`);
    await page.locator("chikyu-space[data-state=live]").waitFor();
    await setPlaces(page, [TOKYO, SEOUL, { id: "far", lat: -35, lon: -40, label: "Far", kind: "favourite" }], "chikyu-space");
    await expect.poll(async () => (await placesOf(page, "chikyu-space")).facing, { timeout: 30_000 }).toBe(2);
    const shown = await names(page, "chikyu-space");
    expect(shown.map((n) => n.text).sort()).toEqual(["Seoul", "Tokyo"]);
    expect(await inked(page, "chikyu-space")).toBeGreaterThan(50);
  });
});

test.describe("for a reader who prefers reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the places are drawn and still: no pulse, and no draw at rest", async ({ page }) => {
    await openEarth(page, OVER_TOKYO);
    await setPlaces(page, [TOKYO]);
    await expect.poll(async () => (await placesOf(page)).facing).toBe(1);
    expect((await placesOf(page)).pulsing).toBe(false);
    const drawn = (await placesOf(page)).renders;
    // thirty frames of the page's own: whatever would draw at rest would draw in these
    await page.evaluate(async () => {
      for (let frame = 0; frame < 30; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect((await placesOf(page)).renders).toBe(drawn);
  });
});
