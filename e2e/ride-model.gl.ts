// The ridden satellite's model (MODULES-1303): in Ride along it sits at the bottom middle of the picture with part of it below the bottom edge, in the track frame (x along the way it goes, z up) at every step of a held
// clock, whatever the page does to its satellite layers, and with no ring or name on it; in Ride above it is at the centre. Every clock here is the test's own: `speed=0`, and the time is stepped by the test.
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createSatellites, type ElementSet } from "../src/satellites/index.ts";
import { COUNT_SCRIPT, freezeClock, untilStill } from "./gl.ts";
import { routeElements } from "./recorded.ts";

test.beforeEach(({ page }) => routeElements(page));
test.describe.configure({ mode: "serial" });

const SPACE = "chikyu-space";
const T0 = Date.parse("2026-11-02T18:00:00Z");
interface Model {
  x: number;
  y: number;
  shown: boolean;
  radiusPx: number;
  box: { left: number; top: number; right: number; bottom: number };
  axes: { x: number[]; y: number[]; z: number[] };
}
interface Stats {
  draws: number;
  time: number;
  ride: { riding: boolean; gliding: boolean };
  followModel: Model | null;
  places: { satelliteNames: number; marks: number };
  satellites: { placed: number };
}
const statsOf = (page: Page): Promise<Stats> => page.locator(SPACE).evaluate((el) => Reflect.get(el, "stats") as Stats);

const snapshot = JSON.parse(readFileSync(new URL("../test/recorded/celestrak-snapshot-2026-11-02.json", import.meta.url), "utf8")) as { fields: string[]; groups: Record<string, (string | number)[][]> };
const group = createSatellites(snapshot.groups["stations"]!.map((row) => Object.fromEntries(snapshot.fields.map((field, index) => [field, row[index]])) as unknown as ElementSet));
const issIndex = group.sets.findIndex((set) => set.NORAD_CAT_ID === 25544);
const dot = (a: number[], b: number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const len = (a: number[]): number => Math.hypot(a[0]!, a[1]!, a[2]!);
const degrees = (a: number[], b: number[]): number => (Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (len(a) * len(b))))) * 180) / Math.PI;
/** The ISS's track frame at `ms`, from the same elements run here: x along its way, level; z straight up. */
function track(ms: number): { x: number[]; z: number[]; latitude: number } {
  const out = new Float64Array(6);
  expect(group.exact(issIndex, ms, out)).toBe(true);
  const p = [out[0]!, out[1]!, out[2]!];
  const v = [out[3]!, out[4]!, out[5]!];
  const z = p.map((n) => n / len(p));
  const along = dot(v, z);
  const level = v.map((n, i) => n - along * z[i]!);
  return { x: level.map((n) => n / len(level)), z, latitude: (Math.asin(z[1]!) * 180) / Math.PI };
}

async function open(page: Page, query = ""): Promise<void> {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/?look=space&time=${new Date(T0).toISOString()}&speed=0&center=-100,40&sats=stations${query}`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => (await statsOf(page)).satellites.placed, { timeout: 20_000 }).toBeGreaterThan(5);
  await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { pause(): void }).pause());
  await untilStill(page);
}

/** Ride the ISS as the page would: the options only, no gliding (the camera is at its place at once). */
async function ride(page: Page, view: "from" | "above", look: "horizon" | "down", smooth = false): Promise<void> {
  await page.locator(SPACE).evaluate((el, o) => (el as unknown as { ride(t: unknown, o: unknown): void }).ride({ group: "stations", index: o.index }, { view: o.view, look: o.look, smooth: o.smooth, distanceKm: 150 }), { index: issIndex, view, look, smooth });
}

/** Give the held clock a time and wait for the draw that shows it: the draw count is read in the same turn as the time is given. */
async function step(page: Page, ms: number): Promise<Stats> {
  const before = await page.locator(SPACE).evaluate((el, time) => {
    const draws = (Reflect.get(el, "stats") as { draws: number }).draws;
    Reflect.set(el, "time", time);
    return draws;
  }, ms);
  await expect.poll(async () => (await statsOf(page)).draws, { timeout: 30_000, message: "a draw after the step" }).toBeGreaterThan(before);
  return statsOf(page);
}

test("Ride along: the model is at the bottom middle, part of it below the bottom edge, and sized to read", async ({ page }) => {
  await open(page);
  await ride(page, "from", "horizon");
  const s = await step(page, T0 + 1000);
  const model = s.followModel!;
  expect(model?.shown, "the model is drawn").toBe(true);
  const box = (await page.locator(SPACE).boundingBox())!;
  expect(model.y / box.height, "its middle is low in the picture").toBeGreaterThan(0.8);
  expect(model.box.top / box.height, "the body and a good part of a wing are in the lower part (0.22 radius, centre at 0.86)").toBeGreaterThan(0.55);
  expect(model.box.bottom, "part of it is below the bottom edge").toBeGreaterThan(box.height);
  expect(Math.abs(model.x / box.width - 0.5), "in the middle sideways").toBeLessThan(0.04);
  expect(model.radiusPx / box.height, "big enough to read: a sixth of the height in radius").toBeGreaterThan(0.15);
});

test("the model's attitude is the track frame at every step of a held clock, over a whole orbit and its highest latitude", async ({ page }) => {
  test.setTimeout(240_000);
  await open(page);
  await ride(page, "from", "horizon");
  let highest = 0;
  for (let i = 1; i <= 60; i += 1) {
    const ms = T0 + i * 90_000;
    const s = await step(page, ms);
    const want = track(ms);
    highest = Math.max(highest, Math.abs(want.latitude));
    const axes = s.followModel!.axes;
    expect(s.followModel?.shown, `frame ${i}: the model is drawn`).toBe(true);
    expect(degrees(axes.x, want.x), `frame ${i}: its long axis is along the way it goes`).toBeLessThan(0.5);
    expect(degrees(axes.z, want.z), `frame ${i}: its top is straight up`).toBeLessThan(0.5);
  }
  expect(highest, "the steps took in the ISS's highest latitudes").toBeGreaterThan(50);
});

test("the model is drawn in both rides whatever the page does to its satellite layers", async ({ page }) => {
  await open(page);
  for (const [name, hide] of [
    ["the group switched off", (el: HTMLElement) => (el as unknown as { showSatellites(g: string, on: boolean): void }).showSatellites("stations", false)],
    ["a focus that hides the others", (el: HTMLElement) => (el as unknown as { showSatellites(g: string, on: boolean): void; focusSatelliteGroup(g: string, o: unknown): void }).focusSatelliteGroup("stations", { others: "hide" })],
  ] as const) {
    await page.locator(SPACE).evaluate(hide);
    for (const [view, look] of [["from", "horizon"], ["above", "down"], ["from", "down"]] as const) {
      await ride(page, view, look);
      const s = await step(page, T0 + 1000);
      expect(s.followModel?.shown, `${name}, ${view} ${look}: the ridden model is drawn`).toBe(true);
    }
  }
});

test("Ride above: the model is at the centre, and a ring or a name on the satellite does not cover it", async ({ page }) => {
  await open(page);
  await page.locator(SPACE).evaluate((el, index) => {
    const space = el as unknown as { selectSatellite(r: unknown): void; ringSatellites(r: unknown[]): void };
    space.selectSatellite({ group: "stations", index });
    space.ringSatellites([{ group: "stations", index }]);
  }, issIndex);
  await ride(page, "from", "down");
  const s = await step(page, T0 + 2000);
  const box = (await page.locator(SPACE).boundingBox())!;
  expect(s.followModel?.shown).toBe(true);
  expect(Math.abs(s.followModel!.x / box.width - 0.5)).toBeLessThan(0.04);
  expect(Math.abs(s.followModel!.y / box.height - 0.5)).toBeLessThan(0.04);
  expect(s.places.satelliteNames, "no ring and name on the ridden satellite").toBe(0);
});

test("across a switch along, above, along the model is present in every stepped frame", async ({ page }) => {
  await open(page);
  const modes = [["from", "horizon"], ["from", "horizon"], ["above", "down"], ["above", "down"], ["from", "down"], ["from", "horizon"], ["from", "horizon"]] as const;
  for (let i = 0; i < modes.length; i += 1) {
    await ride(page, modes[i]![0], modes[i]![1]);
    for (let k = 1; k <= 3; k += 1) {
      const s = await step(page, T0 + (i * 3 + k) * 1000);
      expect(s.followModel?.shown, `switch ${i} (${modes[i]!.join(" ")}), frame ${k}: the model is drawn`).toBe(true);
    }
  }
});

test.describe("gliding", () => {
  test.use({ reducedMotion: "no-preference" });
  test("with a glide between the rides the model is present in every frame the clock steps", async ({ page }) => {
    await page.clock.install();
    await open(page);
    await freezeClock(page);
    await ride(page, "from", "horizon", true);
    // the first glide, from the Earth view to the satellite, is run through before the rides are switched: a model is drawn by its distance from the camera, and the camera that is still far off is a long way from it
    await page.clock.runFor(1500);
    const frames: string[] = [];
    let seen = (await statsOf(page)).draws;
    for (let i = 0; i < 40; i += 1) {
      if (i === 10) await ride(page, "above", "down", true);
      if (i === 25) await ride(page, "from", "horizon", true);
      await page.clock.runFor(100);
      const s = await statsOf(page);
      if (s.draws !== seen) {
        seen = s.draws;
        if (!s.followModel?.shown) frames.push(String(i));
      }
    }
    await page.clock.resume();
    expect(seen, "frames were drawn").toBeGreaterThan(5);
    expect(frames, "frames with no model").toEqual([]);
  });
});
