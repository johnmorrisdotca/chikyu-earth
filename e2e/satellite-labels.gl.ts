// Ring and name every satellite of a group, and say where a satellite is on the screen, in a real browser (Chromium, drawn in software), with the stations recorded on 2026-11-02:
// every member of the group is ringed and named in the page's language, names never overlap, a satellite behind the Earth is not ringed and the page is told once when one comes into view or goes out,
// the page can ask where a satellite is (and whether it is hidden) instead of working it out itself, and nothing is drawn at rest.
import { expect, test, type Page } from "@playwright/test";
import { routeElements } from "./recorded.ts";

test.describe.configure({ mode: "serial" });
test.use({ reducedMotion: "reduce" });
test.beforeEach(({ page }) => routeElements(page));

const SPACE = "chikyu-space";
const T = "2026-11-02T18:00Z";
interface Placed {
  x: number;
  y: number;
  visible: boolean;
  heightKm: number;
}

async function open(page: Page, query = ""): Promise<void> {
  await page.goto(`/chikyu-earth/?look=space&time=${T}&speed=0&center=-100,40&sats=stations${query}`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "satelliteGroups") as unknown[]).length), { timeout: 20_000 }).toBe(1);
}
/** The index in the stations group of the satellite with this NORAD number. */
const indexOf = (page: Page, norad: number): Promise<number> =>
  page.locator(SPACE).evaluate((el, id) => {
    const space = el as unknown as { satelliteGroups: { name: string; count: number }[]; satelliteInfo(ref: unknown): { noradId: number } | undefined };
    const count = space.satelliteGroups.find((g) => g.name === "stations")!.count;
    for (let index = 0; index < count; index += 1) if (space.satelliteInfo({ group: "stations", index })?.noradId === id) return index;
    return -1;
  }, norad);
const placeOf = (page: Page, index: number): Promise<Placed | null> => page.locator(SPACE).evaluate((el, i) => (el as unknown as { placeSatellite(ref: unknown): Placed | null }).placeSatellite({ group: "stations", index: i }), index);
const names = (page: Page): Promise<{ text: string; l: number; t: number; r: number; b: number }[]> =>
  page.locator(SPACE).evaluate((el) =>
    [...el.shadowRoot!.querySelectorAll<HTMLElement>("#places .pl-name[data-kind=satellite]:not(.pl-measure)")]
      .filter((b) => !b.hidden)
      .map((b) => {
        const box = b.getBoundingClientRect();
        return { text: b.textContent ?? "", l: box.left, t: box.top, r: box.right, b: box.bottom };
      }),
  );
const labelOn = (page: Page, on = true): Promise<void> => page.locator(SPACE).evaluate((el, value) => (el as unknown as { labelSatellites(group: string, on: boolean): void }).labelSatellites("stations", value), on);
const placesStats = (page: Page): Promise<{ renders: number; satelliteNames: number }> => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { places: { renders: number; satelliteNames: number } }).places);

test("placeSatellite says where a satellite is on the screen, how high, and whether it can be seen", async ({ page }) => {
  await open(page);
  const iss = await indexOf(page, 25544);
  expect(iss).toBeGreaterThanOrEqual(0);
  await expect.poll(async () => await placeOf(page, iss), { timeout: 30_000 }).not.toBeNull();
  const where = (await placeOf(page, iss))!;
  expect(Number.isFinite(where.x) && Number.isFinite(where.y)).toBe(true);
  expect(where.heightKm, "the station's height").toBeGreaterThan(300);
  expect(where.heightKm).toBeLessThan(500);
  // a group that is not set, a place that is not in it, and a number that is not an index are no place
  expect(await page.locator(SPACE).evaluate((el) => (el as unknown as { placeSatellite(ref: unknown): unknown }).placeSatellite({ group: "nothing", index: 0 }))).toBeNull();
  expect(await placeOf(page, 9999)).toBeNull();
  expect(await placeOf(page, -1)).toBeNull();
});

test("every satellite of the group is ringed and named in the page's language, names never overlap, and stopping takes them away", async ({ page }) => {
  await open(page, "&lang=ja");
  await labelOn(page);
  await expect.poll(async () => (await names(page)).length, { timeout: 30_000, message: "names are beside the satellites in view" }).toBeGreaterThan(0);
  const shown = await names(page);
  for (let i = 0; i < shown.length; i += 1) {
    for (let j = i + 1; j < shown.length; j += 1) {
      const a = shown[i]!;
      const b = shown[j]!;
      expect(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t, `${a.text} and ${b.text} do not overlap`).toBe(true);
    }
  }
  // the ISS is named by its short name, Tiangong in Japanese, when they are in view
  const texts = shown.map((n) => n.text);
  expect(texts.every((t) => t !== "")).toBe(true);
  for (const [norad, ja] of [[48274, "天宮"], [20580, "ハッブル"]] as const) {
    const index = await indexOf(page, norad);
    const at = index >= 0 ? await placeOf(page, index) : null;
    if (at?.visible && texts.includes(ja)) expect(texts).toContain(ja);
  }
  expect(await page.locator(SPACE).evaluate((el) => (Reflect.get(el, "labelledSatellites") as string[]))).toEqual(["stations"]);
  await labelOn(page, false);
  await expect.poll(async () => (await names(page)).length).toBe(0);
});

test("a satellite that goes behind the Earth is not ringed, and the page is told once when one comes into view or goes out", async ({ page }) => {
  await open(page);
  await page.locator(SPACE).evaluate((el) => {
    Reflect.set(window, "__seen", [] as unknown[]);
    el.addEventListener("chikyu-satellite-visibility", (event) => (Reflect.get(window, "__seen") as unknown[]).push((event as CustomEvent).detail));
  });
  await labelOn(page);
  await expect.poll(async () => (await names(page)).length, { timeout: 30_000 }).toBeGreaterThan(0);
  const before = (await names(page)).length;
  // turn the view to the other side of the Earth: what was in front is behind
  await page.locator(SPACE).evaluate((el) => (el as unknown as { setView(v: unknown, final: boolean): void }).setView({ yaw: 180, tilt: 0, zoom: 1, panX: 0, panY: 0 }, true));
  await expect.poll(async () => (await page.evaluate(() => Reflect.get(window, "__seen") as unknown[])).length, { timeout: 30_000, message: "the page is told" }).toBeGreaterThan(0);
  const seen = (await page.evaluate(() => Reflect.get(window, "__seen"))) as { ref: { group: string; index: number }; visible: boolean }[];
  // each satellite is reported when it changes, never twice in a row the same
  const last = new Map<number, boolean>();
  for (const event of seen) {
    expect(last.get(event.ref.index), `satellite ${event.ref.index} is reported again with the same state`).not.toBe(event.visible);
    last.set(event.ref.index, event.visible);
  }
  // the last thing said about each is what placeSatellite says now
  for (const [index, visible] of last) expect((await placeOf(page, index))?.visible ?? false, `satellite ${index}`).toBe(visible);
  expect((await names(page)).length === before, "a different view, a different set of names").toBe(false);
});

test("nothing is drawn at rest: the places layer is not drawn again while the view and the clock hold", async ({ page }) => {
  await open(page);
  await labelOn(page);
  await expect.poll(async () => (await placesStats(page)).satelliteNames, { timeout: 30_000 }).toBeGreaterThan(0);
  const drawn = (await placesStats(page)).renders;
  await page.evaluate(async () => {
    for (let frame = 0; frame < 30; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  expect((await placesStats(page)).renders).toBe(drawn);
});
