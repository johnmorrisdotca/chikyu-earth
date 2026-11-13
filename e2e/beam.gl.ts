// The beam from the chosen satellite to the ground below it (MODULES-1309): the footprint is the circle the satellite is above 25 degrees from, true to its height, for the ISS, a Starlink and a geostationary
// satellite; the beam follows the satellite as the clock moves, is there in a ride, is off until asked for, and draws nothing at rest. The clock is held (speed 0) at a fixed moment, so no height or place depends on
// today. Pictures are written when SPX_PICTURES names a folder. With BEAM_THROTTLE set the browser's CPU is slowed by that factor, for the repeats under load.
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createSatellites, type ElementSet } from "../src/satellites/index.ts";
import { madeUp } from "../test/madeup-elements.ts";
import { COUNT_SCRIPT, alive, counts, settle, untilStill } from "./gl.ts";
import { routeElements } from "./recorded.ts";

const SPACE = "chikyu-space";
const T = "2026-11-02T18:00Z";
const PICTURES = process.env.SPX_PICTURES;
const THROTTLE = Number(process.env.BEAM_THROTTLE ?? 0);

const snapshot = JSON.parse(readFileSync(new URL("../test/recorded/celestrak-snapshot-2026-11-02.json", import.meta.url), "utf8")) as { retrieved: string; fields: string[]; groups: Record<string, (string | number)[][]> };
const asSets = (rows: (string | number)[][]): ElementSet[] => rows.map((row) => Object.fromEntries(snapshot.fields.map((field, index) => [field, row[index]])) as unknown as ElementSet);
const stations = createSatellites(asSets(snapshot.groups["stations"]!));
const starlink = createSatellites(asSets(snapshot.groups["starlink"]!.slice(0, 1)));
// a geostationary satellite, made up (round, over the equator): the demo's own file changes every few hours
const geoRows = madeUp("geostationary", 1, "2026-11-02T00:00:00").map((raw) => snapshot.fields.map((field) => (raw as unknown as Record<string, string | number>)[field] ?? null));
const geo = createSatellites(asSets(geoRows as (string | number)[][]));
const ISS = stations.sets.findIndex((set) => set.NORAD_CAT_ID === 25544);

/** The footprint's radius along the ground for a height, written out here from the geometry: the Earth's radius times (acos(R cos e / (R + h)) - e). */
const radiusFor = (heightKm: number, elevation = 25): number => {
  const e = (elevation * Math.PI) / 180;
  return 6371 * (Math.acos((6371 * Math.cos(e)) / (6371 + heightKm)) - e);
};
/** A satellite's height above the ground at a moment, from the same elements run here. */
function heightAt(group: ReturnType<typeof createSatellites>, index: number, ms: number): number {
  const out = new Float64Array(6);
  expect(group.exact(index, ms, out)).toBe(true);
  return (Math.hypot(out[0]!, out[1]!, out[2]!) - 1) * 6371;
}

interface BeamStats { shown: boolean; heightKm: number; radiusKm: number; angleDegrees: number; elevation: number; cells: number; cellRadiusKm: number; builds: number; failed: boolean }
interface Stats { draws: number; time: number; beam: BeamStats; satellites: { placed: number }; ride: { riding: boolean; gliding: boolean } }
const statsOf = (page: Page): Promise<Stats> => page.locator(SPACE).evaluate((el) => Reflect.get(el, "stats") as Stats);
const beamOf = async (page: Page): Promise<BeamStats> => (await statsOf(page)).beam;
const picture = async (page: Page, name: string): Promise<void> => {
  if (!PICTURES) return;
  mkdirSync(PICTURES, { recursive: true });
  await page.locator(SPACE).screenshot({ path: join(PICTURES, `${name}.png`) });
};

test.beforeEach(async ({ page }) => {
  await routeElements(page);
  await page.route(/\/elements\/geostationary\.json$/, (route) => route.fulfill({ json: { id: "geostationary", retrieved: snapshot.retrieved, all: 1, fields: snapshot.fields, rows: geoRows } }));
  await page.addInitScript(COUNT_SCRIPT);
});

async function open(page: Page, groups = "stations"): Promise<void> {
  await page.goto(`/chikyu-earth/?look=space&time=${T}&speed=0&center=-100,40&sats=${groups}`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => (await statsOf(page)).satellites.placed, { timeout: 30_000 }).toBeGreaterThan(0);
  await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { pause(): void }).pause());
  if (THROTTLE > 1) await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
}
/** Chooses a satellite and asks for the beam, then waits for a draw that has it. */
async function beamOn(page: Page, group: string, index: number, extra: Record<string, string> = {}): Promise<void> {
  await page.locator(SPACE).evaluate((el, [name, i, more]) => {
    const element = el as unknown as { selectSatellite(ref: unknown): void };
    element.selectSatellite({ group: name, index: i });
    el.setAttribute("beam", "selected");
    for (const [key, value] of Object.entries(more as Record<string, string>)) el.setAttribute(key, value);
  }, [group, index, extra] as const);
  await expect.poll(async () => (await beamOf(page)).shown, { timeout: 30_000 }).toBe(true);
}

test.describe.configure({ mode: "serial" });

test("off until asked for: nothing is made, and taking the attribute away takes the beam away", async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  await page.locator(SPACE).evaluate((el, i) => (el as unknown as { selectSatellite(r: unknown): void }).selectSatellite({ group: "stations", index: i }), ISS);
  await settle(page);
  expect(await beamOf(page)).toMatchObject({ shown: false, builds: 0, radiusKm: 0, failed: false });
  await beamOn(page, "stations", ISS);
  expect((await beamOf(page)).builds).toBeGreaterThan(0);
  await page.locator(SPACE).evaluate((el) => el.removeAttribute("beam"));
  await expect.poll(async () => (await beamOf(page)).shown, { timeout: 30_000 }).toBe(false);
  // and the beam goes when no satellite is chosen
  await beamOn(page, "stations", ISS);
  await page.locator(SPACE).evaluate((el) => (el as unknown as { selectSatellite(r: unknown): void }).selectSatellite(null));
  await expect.poll(async () => (await beamOf(page)).shown, { timeout: 30_000 }).toBe(false);
});

for (const [name, groups, group, build, index] of [
  ["the ISS", "stations", "stations", () => stations, ISS],
  ["a Starlink", "starlink", "starlink", () => starlink, 0],
  ["a geostationary satellite", "geostationary", "geostationary", () => geo, 0],
] as const) {
  test(`the footprint of ${name} is the circle it is 25 degrees above, true to its height`, async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, groups);
    await beamOn(page, group, index);
    const height = heightAt(build(), index, Date.parse(T));
    const beam = await beamOf(page);
    expect(beam.heightKm, "its height").toBeCloseTo(height, 0);
    expect(beam.radiusKm, "the footprint's radius along the ground, kilometres").toBeCloseTo(radiusFor(height), 0);
    expect(beam.angleDegrees * (Math.PI / 180) * 6371, "the same radius from the angle at the Earth's centre").toBeCloseTo(beam.radiusKm, 3);
    expect(beam.elevation).toBe(25);
    // a stricter elevation, a smaller footprint
    await page.locator(SPACE).evaluate((el) => el.setAttribute("beam-elevation", "40"));
    await expect.poll(async () => (await beamOf(page)).elevation, { timeout: 30_000 }).toBe(40);
    expect((await beamOf(page)).radiusKm).toBeCloseTo(radiusFor(height, 40), 0);
  });
}

test("nothing is drawn at rest, and the clock's steps move the beam with the satellite", async ({ page }) => {
  test.setTimeout(180_000);
  await open(page);
  await beamOn(page, "stations", ISS, { "beam-cells": "19" });
  await untilStill(page);
  const rested = (await statsOf(page)).draws;
  await untilStill(page);
  expect((await statsOf(page)).draws, "nothing is drawn while the clock is held").toBe(rested);
  // the clock moves a quarter of an orbit: the beam is the footprint of where the satellite is then
  for (const minutes of [10, 25]) {
    const ms = Date.parse(T) + minutes * 60_000;
    const before = (await statsOf(page)).draws;
    await page.locator(SPACE).evaluate((el, value) => Reflect.set(el, "time", value), ms);
    await expect.poll(async () => (await statsOf(page)).draws, { timeout: 30_000 }).toBeGreaterThan(before);
    await untilStill(page);
    const beam = await beamOf(page);
    expect((await statsOf(page)).time).toBe(ms);
    expect(beam.radiusKm).toBeCloseTo(radiusFor(heightAt(stations, ISS, ms)), 0);
    expect(beam.cells).toBe(19);
  }
  await untilStill(page);
  const after = (await statsOf(page)).draws;
  await untilStill(page);
  expect((await statsOf(page)).draws).toBe(after);
});

test("spot cells: a hexagonal pack inside the footprint, sized to fit or smaller", async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  await beamOn(page, "stations", ISS, { "beam-cells": "19" });
  const fit = await beamOf(page);
  expect(fit.cells).toBe(19);
  expect(fit.cellRadiusKm).toBeGreaterThan(0);
  expect(fit.cellRadiusKm, "neighbours do not touch, and the pack is inside the footprint").toBeLessThan(fit.radiusKm / 4);
  await page.locator(SPACE).evaluate((el) => el.setAttribute("beam-cell-size", "40"));
  await expect.poll(async () => (await beamOf(page)).cellRadiusKm, { timeout: 30_000 }).toBeCloseTo(40, 0);
  await page.locator(SPACE).evaluate((el) => el.setAttribute("beam-cells", "0"));
  await expect.poll(async () => (await beamOf(page)).cells, { timeout: 30_000 }).toBe(0);
});

for (const view of ["from", "above"] as const) {
  test(`in a ride (${view === "from" ? "Ride along" : "Ride above"}) the beam is there, down from the satellite the camera is at or over`, async ({ page }) => {
    test.setTimeout(180_000);
    await open(page);
    await page.locator(SPACE).evaluate((el) => el.setAttribute("beam", ""));
    await page.locator(SPACE).evaluate((el, [i, v]) => (el as unknown as { ride(t: unknown, o: unknown): void }).ride({ group: "stations", index: i }, { view: v, viewpoint: "inside", smooth: false }), [ISS, view] as const);
    await expect.poll(async () => (await statsOf(page)).ride.riding, { timeout: 30_000 }).toBe(true);
    await expect.poll(async () => (await statsOf(page)).ride.gliding, { timeout: 30_000 }).toBe(false);
    await expect.poll(async () => (await beamOf(page)).shown, { timeout: 30_000 }).toBe(true);
    await untilStill(page);
    expect((await beamOf(page)).radiusKm).toBeCloseTo(radiusFor(heightAt(stations, ISS, Date.parse(T))), 0);
    await picture(page, `beam-ride-${view}`);
  });
}

test("toggling the beam and its cells leaves the GPU's objects where they were", async ({ page }) => {
  test.setTimeout(180_000);
  await open(page);
  await beamOn(page, "stations", ISS, { "beam-cells": "7" });
  await untilStill(page);
  const held = async (): Promise<number> => { const c = await counts(page); return alive(c, "Buffer") + alive(c, "Texture") + alive(c, "VertexArray") + alive(c, "Program"); };
  // one round of everything the beam can be: made, its cells changed, and taken away
  const round = async (): Promise<void> => {
    for (const cells of ["19", "7"]) {
      await page.locator(SPACE).evaluate((el, value) => el.setAttribute("beam-cells", value), cells);
      await expect.poll(async () => (await beamOf(page)).cells, { timeout: 30_000 }).toBe(Number(cells));
    }
    await page.locator(SPACE).evaluate((el) => el.removeAttribute("beam"));
    await expect.poll(async () => (await beamOf(page)).shown, { timeout: 30_000 }).toBe(false);
    await page.locator(SPACE).evaluate((el) => el.setAttribute("beam", "selected"));
    await expect.poll(async () => (await beamOf(page)).shown, { timeout: 30_000 }).toBe(true);
    await untilStill(page);
  };
  await round();
  const first = await held();
  for (let i = 0; i < 3; i += 1) await round();
  expect(await held(), "no object stays behind a round later").toBe(first);
});

test("pictures: the beam seen from outside, with and without spot cells", async ({ page }) => {
  test.skip(!PICTURES, "SPX_PICTURES names the folder");
  test.setTimeout(180_000);
  await open(page);
  await beamOn(page, "stations", ISS, { "beam-cells": "19" });
  await page.locator(SPACE).evaluate((el, i) => (el as unknown as { ride(t: unknown, o: unknown): void }).ride({ group: "stations", index: i }, { view: "follow", distanceKm: 3000, smooth: false }), ISS);
  await expect.poll(async () => (await statsOf(page)).ride.gliding, { timeout: 30_000 }).toBe(false);
  await page.locator(SPACE).evaluate((el) => (el as unknown as { setView(v: unknown, f: boolean): void }).setView({ yaw: 40, tilt: 70, zoom: 1 }, true));
  await settle(page, 4000);
  await untilStill(page);
  await picture(page, "beam-outside-cells");
});
