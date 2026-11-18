// A ride seen from outside (MODULES-1236): by default the camera is a little behind and above the satellite and the satellite is in the picture, drawn from the package's own small model; `rideViewpoint = "inside"` is
// the camera at the satellite, as a ride was before. Checked on the camera's place against the ISS's own (the same elements, run here), on where the model is on the screen, and on the toggle: one eased move that keeps the
// ride and the clock, draws nothing at rest and leaves the GPU's objects where they were.
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createSatellites, type ElementSet } from "../src/satellites/index.ts";
import { COUNT_SCRIPT, alive, counts, freezeClock, ownClock, passTime, settle, untilStill } from "./gl.ts";
import { routeElements } from "./recorded.ts";

test.beforeEach(({ page }) => routeElements(page));
test.describe.configure({ mode: "serial" });

const SPACE = "chikyu-space";
const T = "2026-11-02T18:00Z";
interface Stats {
  draws: number;
  time: number;
  ride: { riding: boolean; gliding: boolean };
  camera: { position: [number, number, number] };
  followModel: { x: number; y: number; shown: boolean; parts: number } | null;
  satellites: { placed: number };
}
const statsOf = (page: Page): Promise<Stats> => page.locator(SPACE).evaluate((el) => Reflect.get(el, "stats") as Stats);

const snapshot = JSON.parse(readFileSync(new URL("../test/recorded/celestrak-snapshot-2026-11-02.json", import.meta.url), "utf8")) as { fields: string[]; groups: Record<string, (string | number)[][]> };
const group = createSatellites(snapshot.groups["stations"]!.map((row) => Object.fromEntries(snapshot.fields.map((field, index) => [field, row[index]])) as unknown as ElementSet));
const issIndex = group.sets.findIndex((set) => set.NORAD_CAT_ID === 25544);
/** The ISS's place and velocity at `ms` in Earth radii (and radii a second), from the same elements, run here. */
function iss(ms: number): { place: number[]; velocity: number[] } {
  const out = new Float64Array(6);
  expect(group.exact(issIndex, ms, out)).toBe(true);
  return { place: [out[0]!, out[1]!, out[2]!], velocity: [out[3]!, out[4]!, out[5]!] };
}
const dot = (a: number[], b: number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const len = (a: number[]): number => Math.hypot(a[0]!, a[1]!, a[2]!);

async function open(page: Page, viewpoint: "outside" | "inside" | null, look: "down" | "horizon", view: "from" | "above" = "from"): Promise<void> {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/?look=space&time=${T}&speed=0&center=-100,40&sats=stations`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => (await statsOf(page)).satellites.placed, { timeout: 20_000 }).toBeGreaterThan(5);
  await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { pause(): void }).pause());
  if (viewpoint) await page.locator(SPACE).evaluate((el, value) => Reflect.set(el, "rideViewpoint", value), viewpoint);
  // dispatched, not clicked: a real click scrolls the page to the button, and a globe scrolled out of sight is (rightly) not drawn
  await page.locator(`[data-ride-look="${look}"]`).dispatchEvent("click");
  await page.locator(`[data-ride-view="${view}"]`).dispatchEvent("click");
  await page.getByRole("group", { name: "Ride along" }).getByRole("button", { name: "ISS", exact: true }).dispatchEvent("click");
  const play = page.locator('#replay [data-act="play"]');
  if ((await play.getAttribute("aria-pressed")) === "true") await play.dispatchEvent("click");
  await expect.poll(async () => (await statsOf(page)).ride.riding, { timeout: 30_000 }).toBe(true);
  await expect.poll(async () => (await statsOf(page)).ride.gliding, { timeout: 30_000 }).toBe(false);
  await settle(page, 800);
  await untilStill(page);
}

/** The camera's offset from the ISS in kilometres, the way the ISS goes, and the model's place in the picture as shares of its width and height. */
async function where(page: Page) {
  const s = await statsOf(page);
  const there = iss(s.time);
  const offset = [0, 1, 2].map((i) => (s.camera.position[i]! - there.place[i]!) * 6371);
  const box = (await page.locator(SPACE).boundingBox())!;
  const model = s.followModel;
  return { s, there, offset, away: len(offset), shareX: model ? model.x / box.width : null, shareY: model ? model.y / box.height : null };
}

test("ride along, outside by default: the camera is 25 km behind and above the ISS and the model is at the bottom of the picture", async ({ page }) => {
  await open(page, null, "horizon");
  const w = await where(page);
  expect(w.away, "kilometres from the ISS").toBeGreaterThan(20);
  expect(w.away).toBeLessThan(30);
  expect(dot(w.offset, w.there.velocity), "behind: against the way it goes").toBeLessThan(0);
  expect(dot(w.offset, w.there.place), "above: further from the Earth's centre").toBeGreaterThan(0);
  expect(w.s.followModel?.shown, "the model is drawn").toBe(true);
  expect(Math.abs(w.shareX! - 0.5), "near the middle sideways").toBeLessThan(0.08);
  expect(w.shareY!, "in the bottom third (MODULES-1303)").toBeGreaterThan(2 / 3);
  expect(w.shareY!, "at the bottom, its middle still in the picture").toBeLessThan(1);
});

test("ride above, outside by default: the camera is straight above the ISS and the model is at the middle of the picture", async ({ page }) => {
  await open(page, null, "down");
  const w = await where(page);
  expect(w.away).toBeGreaterThan(20);
  expect(w.away).toBeLessThan(30);
  const straightUp = Math.acos(dot(w.offset, w.there.place) / (len(w.offset) * len(w.there.place))) * (180 / Math.PI);
  expect(straightUp, "degrees off the vertical").toBeLessThan(1);
  expect(w.s.followModel?.shown).toBe(true);
  expect(Math.abs(w.shareX! - 0.5)).toBeLessThan(0.04);
  expect(Math.abs(w.shareY! - 0.5)).toBeLessThan(0.04);
});

test("the camera does not jitter: at each step of the clock the camera is the same distance from the ISS and the model in the same place in the picture", async ({ page }) => {
  await open(page, null, "horizon");
  const first = await where(page);
  for (let i = 1; i <= 4; i += 1) {
    const before = (await statsOf(page)).draws;
    await page.locator(SPACE).evaluate((el, value) => Reflect.set(el, "time", value), Date.parse(T) + i * 45_000);
    await expect.poll(async () => (await statsOf(page)).draws, { timeout: 30_000 }).toBeGreaterThan(before);
    await untilStill(page);
    const again = await where(page);
    expect(again.s.time).toBe(Date.parse(T) + i * 45_000);
    expect(Math.abs(again.away - first.away), "kilometres").toBeLessThan(0.05);
    expect(Math.abs(again.shareY! - first.shareY!), "share of the height").toBeLessThan(0.01);
    expect(Math.abs(again.shareX! - first.shareX!), "share of the width").toBeLessThan(0.01);
  }
});

test("inside, the camera is at the ISS and no model is drawn, as before", async ({ page }) => {
  await open(page, "inside", "horizon");
  const w = await where(page);
  expect(w.away, "kilometres from the ISS").toBeLessThan(1);
  expect(w.s.followModel, "no model").toBeNull();
});

test("switching keeps the ride and the clock, and the camera moves between the two views", async ({ page }) => {
  await open(page, "outside", "horizon");
  const outside = await where(page);
  const riding = await page.locator(SPACE).evaluate((el) => JSON.stringify(Reflect.get(el, "riding")));
  await page.locator(SPACE).evaluate((el) => Reflect.set(el, "rideViewpoint", "inside"));
  await expect.poll(async () => (await statsOf(page)).ride.gliding === false && (await where(page)).away < 1, { timeout: 20_000 }).toBe(true);
  await untilStill(page);
  const inside = await where(page);
  expect(inside.s.time, "the clock is where it was").toBe(outside.s.time);
  expect(inside.s.followModel).toBeNull();
  const after = JSON.parse(await page.locator(SPACE).evaluate((el) => JSON.stringify(Reflect.get(el, "riding")))) as { target: unknown; viewpoint: string };
  expect(after.target, "still riding the ISS").toEqual((JSON.parse(riding) as { target: unknown }).target);
  expect(after.viewpoint).toBe("inside");
  await page.locator(SPACE).evaluate((el) => Reflect.set(el, "rideViewpoint", "outside"));
  await expect.poll(async () => { const w = await where(page); return w.away > 20 && w.s.followModel?.shown === true; }, { timeout: 20_000, message: "outside again, with the model" }).toBe(true);
});

/** The yaw the controls hold, so that a turn is made a step at a time as a drag makes it (the controls keep their yaw within -180 to 180, so no step is more than 150). */
let held = 0;
/** The controls' yaw and tilt set the way a drag sets them, then wait for the view to settle. */
async function turnTo(page: Page, yaw: number, tilt: number): Promise<void> {
  const steps = Math.max(1, Math.ceil(Math.abs(yaw - held) / 150));
  for (let i = 1; i <= steps; i += 1) {
    const next = held + ((yaw - held) * i) / steps;
    const wrapped = ((((next + 180) % 360) + 360) % 360) - 180;
    await page.locator("kazoku-view-controls").evaluate((el, v) => {
      const controls = el as unknown as { state: { zoom: number }; controller: { set(view: unknown, final: boolean, why: string): void } };
      controls.controller.set({ yaw: v.wrapped, tilt: v.tilt, zoom: controls.state.zoom }, true, "test");
    }, { wrapped, tilt });
  }
  held = yaw;
  await untilStill(page);
}

for (const look of ["horizon", "down"] as const) {
  test(`${look}: a drag turns the view from where the vehicle is (head, the default): the camera keeps its place and the model leaves the middle as the scene turns`, async ({ page }) => {
    held = 0;
    await open(page, null, look);
    const rest = await where(page);
    expect(await page.locator(SPACE).evaluate((el) => Reflect.get(el, "rideDrag"))).toBe("head");
    for (const [yaw, tilt] of [[40, 0], [-90, 5], [170, 0], [0, 20]] as const) {
      await turnTo(page, yaw, tilt);
      const turned = await where(page);
      // the camera is where it was, behind and above the satellite, to a few metres; only where it looks has changed
      expect(Math.hypot(...[0, 1, 2].map((i) => (turned.s.camera.position[i]! - rest.s.camera.position[i]!) * 6371)), `${yaw},${tilt}: kilometres the camera moved`).toBeLessThan(0.05);
      expect(Math.abs(turned.away - rest.away), "still 25 km off").toBeLessThan(0.05);
    }
    // looked away, the model is out of the middle of the picture, not turned about it
    await turnTo(page, 90, 0);
    const away = await where(page);
    expect(away.s.followModel === null || Math.hypot(away.shareX! - rest.shareX!, away.shareY! - rest.shareY!) > 0.2, "the satellite is not where it was framed").toBe(true);
    await turnTo(page, 0, 0);
    const back = await where(page);
    expect(Math.abs(back.shareX! - rest.shareX!), "back where it was framed, sideways").toBeLessThan(0.01);
    expect(Math.abs(back.shareY! - rest.shareY!), "and down").toBeLessThan(0.01);
  });

  test(`${look}: orbit, as before: the model stays at its place in the picture and the camera goes round the satellite`, async ({ page }) => {
    held = 0;
    await open(page, null, look);
    await page.locator(SPACE).evaluate((el) => Reflect.set(el, "rideDrag", "orbit"));
    await untilStill(page);
    const rest = await where(page);
    expect(await page.locator(SPACE).evaluate((el) => (Reflect.get(el, "riding") as { drag: string }).drag)).toBe("orbit");
    await turnTo(page, 120, 0);
    const turned = await where(page);
    expect(Math.abs(turned.away - rest.away), "still 25 km off").toBeLessThan(0.05);
    expect(Math.hypot(...[0, 1, 2].map((i) => (turned.s.camera.position[i]! - rest.s.camera.position[i]!) * 6371)), "kilometres the camera went round").toBeGreaterThan(10);
    expect(Math.abs(turned.shareX! - rest.shareX!), "the model, sideways").toBeLessThan(0.01);
    expect(Math.abs(turned.shareY! - rest.shareY!), "and down").toBeLessThan(0.01);
  });
}

test.describe("moving", () => {
  test.use({ reducedMotion: "no-preference" });

  test("it is one eased move, then rest: part of the way after half a second, over by 1.9 s, and nothing is drawn afterwards", async ({ page }) => {
    // the glide is a function of the page's clock: the test owns it, so how long a busy machine takes to draw a frame cannot change what is measured
    await page.clock.install();
    await open(page, "outside", "horizon");
    await freezeClock(page);
    await page.locator(SPACE).evaluate((el) => Reflect.set(el, "rideViewpoint", "inside"));
    expect((await statsOf(page)).ride.gliding, "a glide starts").toBe(true);
    await page.clock.runFor(500);
    const mid = await where(page);
    expect(mid.away, "part of the way").toBeGreaterThan(2);
    expect(mid.away, "not there yet").toBeLessThan(24.5);
    await page.clock.runFor(900);
    expect((await statsOf(page)).ride.gliding, "still gliding after 1.4 s, the glide is 1.2 s: ended on the first frame after").toBe(false);
    await page.clock.resume();
    expect((await where(page)).away, "at the satellite").toBeLessThan(1);
    await untilStill(page);
    const before = await counts(page);
    await settle(page, 3000);
    expect((await counts(page)).draws - before.draws, "nothing drawn at rest").toBe(0);
  });

  test("toggled eight times it leaves the GPU's objects where they were", async ({ page }) => {
    await ownClock(page);
    await open(page, "outside", "horizon");
    const start = await counts(page);
    // each toggle builds or frees the model and plays out a 1.2 s glide in software drawing: twenty of them took 30 s of the test's 60 on a quiet machine and more than the 60 on a loaded one, and eight (four there and back) show a leak as plainly
    for (let i = 0; i < 8; i += 1) {
      await page.locator(SPACE).evaluate((el, value) => Reflect.set(el, "rideViewpoint", value), i % 2 === 0 ? "inside" : "outside");
      await passTime(page, 1500);
    }
    await untilStill(page);
    const end = await counts(page);
    for (const kind of ["Buffer", "Texture", "VertexArray"] as const) expect(alive(end, kind), kind).toBeLessThanOrEqual(alive(start, kind));
    expect((await where(page)).s.followModel?.shown, "outside again").toBe(true);
  });
});

test("a satellite the page has no model for is drawn from the package's own in the views above and behind it, outside; inside, as before, a dot", async ({ page }) => {
  await open(page, null, "down", "above");
  // the demo's stand-in models are for the ISS, Tiangong and Hubble: ride one of the other stations
  const other = group.sets.findIndex((set) => ![25544, 48274, 20580].includes(set.NORAD_CAT_ID));
  expect(other).toBeGreaterThanOrEqual(0);
  for (const view of ["above", "follow"] as const) {
    await page.locator(SPACE).evaluate((el, v) => (el as unknown as { ride(t: unknown, o: unknown): void }).ride({ group: "stations", index: v.other }, { view: v.view, smooth: false, distanceKm: 150 }), { other, view });
    await expect.poll(async () => (await statsOf(page)).followModel?.shown, { timeout: 20_000, message: `${view}: the package's drawing` }).toBe(true);
    await page.locator(SPACE).evaluate((el) => Reflect.set(el, "rideViewpoint", "inside"));
    await expect.poll(async () => (await statsOf(page)).followModel, { timeout: 20_000, message: `${view}, inside: a dot` }).toBeNull();
    await page.locator(SPACE).evaluate((el) => Reflect.set(el, "rideViewpoint", "outside"));
  }
});
