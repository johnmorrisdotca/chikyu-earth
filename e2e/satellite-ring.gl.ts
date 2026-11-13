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
// With RING_THROTTLE set the browser's CPU is slowed by that factor, for the repeats under load.
const THROTTLE = Number(process.env.RING_THROTTLE ?? 0);
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
/** Rest after a turn that brought new bodies into view: their pictures are made after the draw that showed them, so the first quiet can be the gap before one arrives. Wait it out, then be still again. */
async function restAfterTurn(page: Page): Promise<void> {
  await untilStill(page);
  await page.waitForTimeout(3000);
  await untilStill(page);
}
const rings = (page: Page): Promise<number> => page.locator(SPACE).evaluate((el) => [...el.shadowRoot!.querySelectorAll("i.pl-sat")].filter((node) => !(node as HTMLElement).hidden).length);

test("a ring asked for out of view is there on the first draw that shows the satellite, then nothing is drawn", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`/chikyu-earth/?look=space&time=2026-11-02T18:00Z&speed=0&center=-100,40&sats=stations`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  if (THROTTLE > 1) await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
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
    // The turn, the first draw that shows it and what that draw left (the satellite's place and the rings) are read in ONE call in the page: the draw count was read in one call and the place in the next, and on a busy machine a draw
    // of the step before landed in between, so the place was read at the old view and the step that had the satellite in it was passed over (TEST-RULES, pattern 1). The page's own last-drawn camera says which draw it is.
    const turned = await page.locator(SPACE).evaluate(
      async (el, [yaw, i]) => {
        const space = el as unknown as { setView(v: unknown, final: boolean): void; placeSatellite(ref: unknown): Place | null };
        const pose = (): string => (Reflect.get(el, "stats") as { camera: { quaternion: number[] } }).camera.quaternion.join(",");
        const was = pose();
        space.setView({ yaw, tilt: 0, zoom: 2.4 }, true);
        const end = performance.now() + 15_000;
        while (pose() === was) {
          if (performance.now() > end) return null;
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
        return { place: space.placeSatellite({ group: "stations", index: i }), rings: [...el.shadowRoot!.querySelectorAll("i.pl-sat")].filter((node) => !(node as HTMLElement).hidden).length };
      },
      [step * 40, index] as const,
    );
    expect(turned, "a draw shows the turned view").not.toBeNull();
    const place = turned!.place;
    if (!place?.visible) continue;
    expect(turned!.rings, "the ring is on the draw that brings the satellite in").toBe(1);
    expect(place.edge, "in the picture it is not past an edge").toBeNull();
    expect(place.behind).toBe(false);
    await restAfterTurn(page);
    const settled = await draws(page);
    await untilStill(page);
    expect(await draws(page), "nothing more is drawn once the ring is up").toBe(settled);
    shown = true;
  }
  expect(shown, "turning the view brought the satellite into the picture").toBe(true);
});

test("every placed satellite has numbers that can be drawn, an edge only when it is outside the box, and behind the camera is an edge too", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`/chikyu-earth/?look=space&time=2026-11-02T18:00Z&speed=0&center=-100,40&sats=stations`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "satelliteGroups") as { count: number }[])[0]?.count ?? 0), { timeout: 20_000 }).toBeGreaterThan(0);
  const count = await page.locator(SPACE).evaluate((el) => (Reflect.get(el, "satelliteGroups") as { count: number }[])[0]!.count);
  const box = await page.locator(SPACE).evaluate((el) => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }));
  let outside = 0;
  for (const view of [{ yaw: 0, tilt: 0, zoom: 2.4 }, { yaw: 120, tilt: 40, zoom: 6 }, { yaw: -70, tilt: -30, zoom: 1.2 }]) {
    await page.locator(SPACE).evaluate((el, v) => (el as unknown as { setView(v: unknown, final: boolean): void }).setView(v, true), view);
    await untilStill(page);
    for (let i = 0; i < count; i += 1) {
      const place = await placeOf(page, i);
      if (!place) continue;
      expect(Number.isFinite(place.x) && Number.isFinite(place.y) && Number.isFinite(place.heightKm), `station ${i} has finite numbers`).toBe(true);
      if (place.visible) {
        expect(place.edge, `station ${i} in the picture is past no edge`).toBeNull();
        expect(place.behind).toBe(false);
        expect(place.x >= 0 && place.x <= box.width && place.y >= 0 && place.y <= box.height, `station ${i} is inside the box`).toBe(true);
      }
      if (place.edge === null && !place.behind) continue;
      outside += 1;
      expect(place.visible, `station ${i} past an edge is not visible`).toBe(false);
      if (place.behind) expect(place.edge, `station ${i} behind the camera still says which way`).not.toBeNull();
      const beyond = { left: place.x < 0, right: place.x > box.width, top: place.y < 0, bottom: place.y > box.height };
      if (place.edge) expect(beyond[place.edge], `station ${i}: ${place.edge} is the side its place lies beyond`).toBe(true);
    }
  }
  expect(outside, "some station lay outside the picture in these views").toBeGreaterThan(0);
});
