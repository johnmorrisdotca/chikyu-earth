// Names never overlap across layers (MODULES-1072), in a real browser (Chromium, drawn in software): in a crowded view (places near the limb and near named stars, ringed and named satellites, the markers' labels, city names, star and constellation names)
// no label box of one layer touches a label box of another, on the space view and on the realistic Earth, and nothing is drawn at rest. The layers keep to a fixed order: places (with the satellites), markers, cities, stars.
import { expect, test, type Page } from "@playwright/test";
import { PLACES as DEMO_PLACES } from "../demo/places.ts";
import { routeElements } from "./recorded.ts";

test.describe.configure({ mode: "serial" });
test.use({ reducedMotion: "reduce" });
test.beforeEach(({ page }) => routeElements(page));

interface Label {
  layer: string;
  text: string;
  l: number;
  t: number;
  r: number;
  b: number;
}
/** Every label of every layer that is drawn, by layer, as the browser draws it. */
const LAYERS: [string, string][] = [
  ["places", "#places .pl-name:not(.pl-measure), #places .pl-sat"],
  ["markers", ".cm-label"],
  ["cities", "#cn-names .cn-name"],
  ["stars", "#sk-names .sk-name, #sk-names .sk-designation, #sk-names .sk-constellation, #sk-names .sk-figure"],
];
const labels = (page: Page, tag: string): Promise<Label[]> =>
  page.locator(tag).evaluate((el, layers) => {
    const out: { layer: string; text: string; l: number; t: number; r: number; b: number }[] = [];
    for (const [layer, selector] of layers) {
      for (const node of el.shadowRoot!.querySelectorAll<HTMLElement>(selector)) {
        if (node.hidden || node.getClientRects().length === 0) continue;
        const box = node.getBoundingClientRect();
        out.push({ layer, text: node.textContent || node.className, l: box.left, t: box.top, r: box.right, b: box.bottom });
      }
    }
    return out;
  }, LAYERS);
/** Pairs of labels of different layers whose boxes intersect. */
const crossings = (all: Label[]): string[] => {
  const out: string[] = [];
  for (const [i, a] of all.entries()) for (const b of all.slice(i + 1)) if (a.layer !== b.layer && a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5) out.push(`${a.layer} "${a.text}" / ${b.layer} "${b.text}"`);
  return out;
};
const drawsOf = (page: Page, tag: string): Promise<number> => page.locator(tag).evaluate((el) => (Reflect.get(el, "stats") as { draws: number }).draws);
async function atRest(page: Page, tag: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const before = await drawsOf(page, tag);
        await page.evaluate(async () => {
          for (let frame = 0; frame < 30; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
        });
        return (await drawsOf(page, tag)) - before;
      },
      { timeout: 60_000, message: "the view is at rest" },
    )
    .toBe(0);
}

/** Places ringed round a point of the Earth, at three distances from it, so that many names fall near the limb and over the sky beside it. */
function ringOfPlaces(lon0: number, lat0: number, count: number): { id: string; lon: number; lat: number; label: string; kind: string }[] {
  const rad = Math.PI / 180;
  return Array.from({ length: count }, (_, i) => {
    const distance = [62, 72, 80][i % 3]! * rad;
    const bearing = ((i * 360) / count) * rad;
    const lat = Math.asin(Math.sin(lat0 * rad) * Math.cos(distance) + Math.cos(lat0 * rad) * Math.sin(distance) * Math.cos(bearing));
    const lon = lon0 * rad + Math.atan2(Math.sin(bearing) * Math.sin(distance) * Math.cos(lat0 * rad), Math.cos(distance) - Math.sin(lat0 * rad) * Math.sin(lat));
    return { id: `ring-${i}`, lon: ((lon / rad + 540) % 360) - 180, lat: lat / rad, label: `Ring place ${i}`, kind: "favourite" };
  });
}

const STARS = "star-names=120&constellation-lines&constellation-names";

test("space view: places, satellites, cities and the stars' names never overlap one another", async ({ page }) => {
  const tag = "chikyu-space";
  await page.goto(`/chikyu-earth/?look=space&time=2026-11-02T18:00Z&speed=0&center=-100,40&sats=stations&${STARS}&city-names=80`);
  await page.locator(`${tag}[data-state=live]`).waitFor({ timeout: 60_000 });
  await page.locator(tag).evaluate((el, places) => {
    el.setAttribute("earth-size", "0.45");
    Reflect.set(el, "places", places);
    (el as unknown as { labelSatellites(group: string, on: boolean): void }).labelSatellites("stations", true);
  }, ringOfPlaces(-100, 40, 45));
  await atRest(page, tag);
  await expect.poll(async () => (await labels(page, tag)).filter((l) => l.layer === "places").length, { timeout: 30_000, message: "places and satellites are named" }).toBeGreaterThan(5);
  await atRest(page, tag);
  const all = await labels(page, tag);
  const seen = new Set(all.map((l) => l.layer));
  expect(seen, "a crowded view: names of places, cities and stars are all on the picture").toEqual(new Set(["places", "cities", "stars"]));
  expect(crossings(all), "no two label boxes of different layers intersect").toEqual([]);
  // turning the view lays the names out again, and they still never overlap
  for (const lon of [-60, -130, 20]) {
    await page.locator(tag).evaluate((el, at) => el.setAttribute("center", `${at},35`), lon);
    await atRest(page, tag);
    expect(crossings(await labels(page, tag)), `centred on ${lon}: no two label boxes of different layers intersect`).toEqual([]);
  }
  // nothing is drawn at rest
  const draws = await drawsOf(page, tag);
  await page.evaluate(async () => {
    for (let frame = 0; frame < 30; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  expect(await drawsOf(page, tag), "nothing is drawn at rest").toBe(draws);
});

test("realistic Earth: places, the markers' labels, cities and the stars' names never overlap one another", async ({ page }) => {
  const tag = "chikyu-earth-realistic";
  await page.goto(`/chikyu-earth/?look=realistic&time=2026-06-21T12:00Z&center=10,45&${STARS}&city-names=80`);
  await page.locator(`${tag}[data-state=live]`).waitFor({ timeout: 60_000 });
  // a place beside each of the demo's markers, and a ring of places round the middle
  const beside = DEMO_PLACES.map((m, i) => ({ id: `beside-${i}`, lon: m.lon + 1.2, lat: m.lat + 0.8, label: `Near ${m.label ?? i}`, kind: "favourite" }));
  await page.locator(tag).evaluate((el, places) => {
    el.setAttribute("earth-size", "0.45");
    Reflect.set(el, "places", places);
  }, [...beside, ...ringOfPlaces(10, 45, 30)]);
  await atRest(page, tag);
  await expect.poll(async () => (await labels(page, tag)).filter((l) => l.layer === "places").length, { timeout: 30_000, message: "places are named" }).toBeGreaterThan(5);
  await atRest(page, tag);
  const all = await labels(page, tag);
  const seen = new Set(all.map((l) => l.layer));
  expect(seen, "a crowded view: names of places, markers, cities and stars are all on the picture").toEqual(new Set(["places", "markers", "cities", "stars"]));
  expect(crossings(all), "no two label boxes of different layers intersect").toEqual([]);
  for (const lon of [30, -20, 60]) {
    await page.locator(tag).evaluate((el, at) => el.setAttribute("center", `${at},40`), lon);
    await atRest(page, tag);
    expect(crossings(await labels(page, tag)), `centred on ${lon}: no two label boxes of different layers intersect`).toEqual([]);
  }
  const draws = await drawsOf(page, tag);
  await page.evaluate(async () => {
    for (let frame = 0; frame < 30; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  expect(await drawsOf(page, tag), "nothing is drawn at rest").toBe(draws);
});
