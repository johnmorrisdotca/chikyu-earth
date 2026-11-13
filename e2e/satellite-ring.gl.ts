// A ring asked for while the satellite is outside the picture appears on the first draw that brings it in, and nothing is drawn at rest.
import { expect, test, type Page } from "@playwright/test";
import { COUNT_SCRIPT, untilStill } from "./gl.ts";
import { routeElements } from "./recorded.ts";

test.use({ reducedMotion: "reduce" });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(COUNT_SCRIPT);
  await routeElements(page);
});

const SPACE = "chikyu-space";
const EDGES = ["top", "right", "bottom", "left"];

interface Place {
  x: number;
  y: number;
  visible: boolean;
  heightKm: number;
  edge: "top" | "right" | "bottom" | "left" | null;
  behind: boolean;
}

const draws = (page: Page): Promise<number> => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { draws: number }).draws);
const placeOf = (page: Page, index: number): Promise<Place | null> =>
  page.locator(SPACE).evaluate((el, i) => (el as unknown as { placeSatellite(ref: unknown): Place | null }).placeSatellite({ group: "stations", index: i }), index);
const rings = (page: Page): Promise<number> => page.locator(SPACE).evaluate((el) => [...el.shadowRoot!.querySelectorAll("i.pl-sat")].filter((node) => !(node as HTMLElement).hidden).length);

test("a ring asked for out of view is there on the first draw that shows the satellite, then nothing is drawn", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`/chikyu-earth/?look=space&time=2026-11-02T18:00Z&speed=0&center=-100,40&sats=stations`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "satelliteGroups") as { count: number }[])[0]?.count ?? 0), { timeout: 20_000 }).toBeGreaterThan(0);
  await page.locator(SPACE).evaluate((el) => (el as unknown as { setView(v: unknown, final: boolean): void }).setView({ yaw: 0, tilt: 0, zoom: 2.4 }, true));
  await expect.poll(async () => draws(page)).toBeGreaterThan(0);

  const count = await page.locator(SPACE).evaluate((el) => (Reflect.get(el, "satelliteGroups") as { count: number }[])[0]!.count);
  let index = -1;
  let off: Place | null = null;
  for (let i = 0; i < count; i += 1) {
    const place = await placeOf(page, i);
    if (place && !place.visible && place.edge !== null) {
      index = i;
      off = place;
      break;
    }
  }
  expect(index, "a station lies off the picture").toBeGreaterThanOrEqual(0);
  expect(EDGES, "the edge it lies beyond").toContain(off!.edge);
  expect(typeof off!.behind).toBe("boolean");

  await page.locator(SPACE).evaluate((el, i) => (el as unknown as { ringSatellites(refs: unknown[]): void }).ringSatellites([{ group: "stations", index: i }]), index);
  await expect.poll(async () => rings(page)).toBe(0);
  await untilStill(page);
  const rested = await draws(page);
  await untilStill(page);
  expect(await draws(page), "nothing is drawn while the ringed satellite stays out of view").toBe(rested);

  let shown = false;
  for (let step = 1; step <= 9 && !shown; step += 1) {
    const before = await draws(page);
    await page.locator(SPACE).evaluate((el, yaw) => (el as unknown as { setView(v: unknown, final: boolean): void }).setView({ yaw, tilt: 0, zoom: 2.4 }, true), step * 40);
    await expect.poll(async () => draws(page), { timeout: 15_000 }).toBeGreaterThan(before);
    const place = await placeOf(page, index);
    if (!place?.visible) continue;
    expect(await rings(page), "the ring is on the draw that brings the satellite in").toBe(1);
    expect(place.edge, "in the picture it is not past an edge").toBeNull();
    expect(place.behind).toBe(false);
    await untilStill(page);
    const settled = await draws(page);
    await untilStill(page);
    expect(await draws(page), "nothing more is drawn once the ring is up").toBe(settled);
    shown = true;
  }
  expect(shown, "turning the view brought the satellite into the picture").toBe(true);
});
