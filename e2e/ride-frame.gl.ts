// The framing of a ridden satellite (MODULES-1316): where its model sits and how big it is (`ride-model-share`, `ride-model-seat`), the zoom inside a ride (`ride-zoom`) with the ground the picture spans (`stats.ride.groundKm`), and the fade of the
// model when the viewpoint is switched. Every clock is the test's own: `speed=0` with the time given by the test, and for the glides a frozen page clock moved by `runFor`.
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createSatellites, type ElementSet } from "../src/satellites/index.ts";
import { COUNT_SCRIPT, freezeClock, untilStill } from "./gl.ts";
import { routeElements } from "./recorded.ts";

test.beforeEach(({ page }) => routeElements(page));
test.describe.configure({ mode: "serial" });

const SPACE = "chikyu-space";
const T0 = Date.parse("2026-11-02T18:00:00Z");
interface Stats {
  draws: number;
  time: number;
  ride: { riding: boolean; gliding: boolean; groundKm: { across: number; tall: number } | null };
  camera: { position: [number, number, number]; fov: number };
  followModel: { x: number; y: number; share: number; seat: number; weight: number; radiusPx: number; box: { left: number; top: number; right: number; bottom: number } } | null;
  satellites: { placed: number };
}
const statsOf = (page: Page): Promise<Stats> => page.locator(SPACE).evaluate((el) => Reflect.get(el, "stats") as Stats);
const snapshot = JSON.parse(readFileSync(new URL("../test/recorded/celestrak-snapshot-2026-11-02.json", import.meta.url), "utf8")) as { fields: string[]; groups: Record<string, (string | number)[][]> };
const group = createSatellites(snapshot.groups["stations"]!.map((row) => Object.fromEntries(snapshot.fields.map((field, index) => [field, row[index]])) as unknown as ElementSet));
const issIndex = group.sets.findIndex((set) => set.NORAD_CAT_ID === 25544);

async function open(page: Page): Promise<void> {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/?look=space&time=${new Date(T0).toISOString()}&speed=0&center=-100,40&sats=stations`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => (await statsOf(page)).satellites.placed, { timeout: 20_000 }).toBeGreaterThan(5);
  await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { pause(): void }).pause());
  await untilStill(page);
}
const rideAlong = (page: Page): Promise<void> =>
  page.locator(SPACE).evaluate((el, index) => (el as unknown as { ride(t: unknown, o: unknown): void }).ride({ group: "stations", index }, { view: "from", look: "horizon", smooth: false }), issIndex);
/** Do `act` in the page and wait for the draw it asks for: the draw count is read in the same turn as the change, and the page is let come to rest before the stats are read. */
async function change<T>(page: Page, act: (el: HTMLElement, arg: T) => void, arg: T): Promise<Stats> {
  const before = await page.locator(SPACE).evaluate(
    (el, [source, value]) => {
      const draws = (Reflect.get(el, "stats") as { draws: number }).draws;
      (new Function(`return (${source as string})`)() as (e: HTMLElement, a: unknown) => void)(el as HTMLElement, value);
      return draws;
    },
    [act.toString(), arg] as const,
  );
  await expect.poll(async () => (await statsOf(page)).draws, { timeout: 30_000, message: "a draw after the change" }).toBeGreaterThan(before);
  await untilStill(page);
  return statsOf(page);
}
let moment = 0;
const step = (page: Page): Promise<Stats> => change(page, (el, t) => Reflect.set(el, "time", t), T0 + (moment += 1) * 1000);

test("the defaults and a page-set share and seat are both in the box: 0.22 and 0.86 along the way it goes, then 0.4 and 1", async ({ page }) => {
  await open(page);
  await rideAlong(page);
  const box = (await page.locator(SPACE).boundingBox())!;
  const first = await step(page);
  expect(first.followModel!.share, "the default share along the way").toBeCloseTo(0.22, 3);
  expect(first.followModel!.seat, "the default seat").toBeCloseTo(0.86, 2);
  expect(first.followModel!.box.top / box.height, "the box top: seat less share").toBeCloseTo(0.86 - 0.22, 2);
  expect(first.followModel!.box.bottom / box.height, "the box bottom crosses the bottom edge").toBeCloseTo(0.86 + 0.22, 2);
  const set = await change(page, (el) => {
    Reflect.set(el, "rideModelShare", 0.4);
    Reflect.set(el, "rideModelSeat", 1);
  }, null);
  expect(set.followModel!.share).toBeCloseTo(0.4, 3);
  expect(set.followModel!.seat).toBeCloseTo(1, 2);
  expect(set.followModel!.radiusPx / box.height).toBeCloseTo(0.4, 3);
  expect(set.followModel!.box.top / box.height).toBeCloseTo(0.6, 2);
  expect(set.followModel!.box.bottom / box.height).toBeCloseTo(1.4, 2);
  // the attribute and the option say the same
  await page.locator(SPACE).evaluate((el) => {
    el.removeAttribute("ride-model-share");
    el.removeAttribute("ride-model-seat");
  });
  const optioned = await change(page, (el, index) => (el as unknown as { ride(t: unknown, o: unknown): void }).ride({ group: "stations", index }, { view: "from", look: "horizon", smooth: false, modelShare: 0.3 }), issIndex);
  expect(optioned.followModel!.share).toBeCloseTo(0.3, 3);
});

test("a change is one draw and then rest, and the zoom narrows the ground: more zoom, fewer kilometres", async ({ page }) => {
  await open(page);
  await rideAlong(page);
  await step(page);
  const draws = async (): Promise<number> => (await statsOf(page)).draws;
  let last = Infinity;
  for (const zoom of [2, 4, 8, 16, 40]) {
    const before = await draws();
    await page.locator(SPACE).evaluate((el, z) => Reflect.set(el, "rideZoom", z), zoom);
    await expect.poll(draws, { timeout: 30_000, message: "a draw after the change" }).toBeGreaterThan(before);
    // the change itself is one draw (two with the gate's second); the pictures a closer view asks for arrive after it, each a draw of its own, and are waited for before the ground is read
    expect((await draws()) - before, `zoom ${zoom}: the change is one draw (or two with the gate's second)`).toBeLessThanOrEqual(2);
    await untilStill(page);
    const s = await statsOf(page);
    const tall = s.ride.groundKm!.tall;
    expect(tall, `zoom ${zoom}: the ground spanned is smaller`).toBeLessThan(last);
    last = tall;
    expect(s.camera.fov, `zoom ${zoom}: the field of view is 60 over it`).toBeCloseTo(60 / zoom, 3);
    // at rest: nothing more is drawn
    const rest = await draws();
    await page.evaluate(async () => {
      for (let frame = 0; frame < 20; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(await draws(), `zoom ${zoom}: nothing is drawn at rest`).toBe(rest);
  }
  const wide = (await change(page, (el, z) => Reflect.set(el, "rideZoom", z), 1)).ride.groundKm!;
  expect(wide.across / wide.tall, "across over tall is the picture's aspect").toBeGreaterThan(1);
  expect(last, "at 40 times the ground is a few kilometres: a tile level's size").toBeLessThan(wide.tall / 30);
});

test.describe("gliding", () => {
  test.use({ reducedMotion: "no-preference" });

  /** The page's clock is the test's own: moved only by `runFor`. Returns the stats after each step of `ms` until the glide has ended, at most `limit` steps. */
  async function glide(page: Page, ms: number, limit: number): Promise<Stats[]> {
    const out: Stats[] = [];
    for (let i = 0; i < limit; i += 1) {
      await page.clock.runFor(ms);
      out.push(await statsOf(page));
      if (!out.at(-1)!.ride.gliding && i > 0) break;
    }
    return out;
  }

  test("a share and a seat set while riding glide in 0.4 s and then rest", async ({ page }) => {
    await page.clock.install();
    await open(page);
    await freezeClock(page);
    await rideAlong(page);
    await page.clock.runFor(2000);
    const before = await statsOf(page);
    await page.locator(SPACE).evaluate((el) => {
      Reflect.set(el, "rideModelShare", 0.5);
      Reflect.set(el, "rideModelSeat", 1);
    });
    const frames = await glide(page, 50, 20);
    const shares = frames.map((s) => s.followModel!.share);
    expect(shares[0]!, "it starts from where it was").toBeLessThan(0.5);
    for (let i = 1; i < shares.length; i += 1) expect(shares[i]!, `step ${i}: only grows`).toBeGreaterThanOrEqual(shares[i - 1]! - 1e-9);
    expect(shares.at(-1)!, "ends at what was set").toBeCloseTo(0.5, 3);
    expect(frames.length, "in about 0.4 s: more than one step, under ten").toBeGreaterThan(2);
    expect(frames.length).toBeLessThan(10);
    expect(frames.at(-1)!.ride.gliding, "the glide has ended").toBe(false);
    const rest = (await statsOf(page)).draws;
    await page.clock.runFor(3000);
    expect((await statsOf(page)).draws, "nothing is drawn at rest").toBe(rest);
    void before;
  });

  test("the ride-zoom glides the field of view in 0.4 s and then rests", async ({ page }) => {
    await page.clock.install();
    await open(page);
    await freezeClock(page);
    await rideAlong(page);
    await page.clock.runFor(2000);
    await page.locator(SPACE).evaluate((el) => Reflect.set(el, "rideZoom", 8));
    const frames = await glide(page, 50, 20);
    const fovs = frames.map((s) => s.camera.fov);
    for (let i = 1; i < fovs.length; i += 1) expect(fovs[i]!, `step ${i}: the field only narrows`).toBeLessThanOrEqual(fovs[i - 1]! + 1e-9);
    expect(fovs.at(-1)!).toBeCloseTo(60 / 8, 2);
    expect(frames.at(-1)!.ride.gliding).toBe(false);
    const rest = (await statsOf(page)).draws;
    await page.clock.runFor(3000);
    expect((await statsOf(page)).draws, "nothing is drawn at rest").toBe(rest);
  });

  test("switching to the view from inside fades the model out over 0.4 s while the camera closes on the satellite, and back in on the return", async ({ page }) => {
    await page.clock.install();
    await open(page);
    await freezeClock(page);
    await rideAlong(page);
    await page.clock.runFor(2000);
    const away = (s: Stats): number => {
      const out = new Float64Array(6);
      expect(group.exact(issIndex, s.time, out)).toBe(true);
      return Math.hypot(s.camera.position[0] - out[0]!, s.camera.position[1] - out[1]!, s.camera.position[2] - out[2]!) * 6371;
    };
    expect(away(await statsOf(page)), "outside: 25 km from the satellite").toBeGreaterThan(20);
    await page.locator(SPACE).evaluate((el) => Reflect.set(el, "rideViewpoint", "inside"));
    const out = await glide(page, 50, 40);
    const weights = out.map((s) => s.followModel?.weight ?? 0);
    for (let i = 1; i < weights.length; i += 1) expect(weights[i]!, `step ${i}: the model only fades`).toBeLessThanOrEqual(weights[i - 1]! + 1e-9);
    expect(weights.some((w) => w > 0.05 && w < 0.95), "a part-way weight is drawn: a fade, not a cut").toBe(true);
    const distances = out.map(away);
    for (let i = 1; i < distances.length; i += 1) expect(distances[i]!, `step ${i}: the camera only closes`).toBeLessThanOrEqual(distances[i - 1]! + 0.01);
    expect(out.at(-1)!.followModel, "gone once it has faded").toBeNull();
    expect(distances.at(-1)!, "at the satellite").toBeLessThan(1);
    await page.locator(SPACE).evaluate((el) => Reflect.set(el, "rideViewpoint", "outside"));
    const back = await glide(page, 50, 40);
    const inWeights = back.map((s) => s.followModel?.weight ?? 0);
    for (let i = 1; i < inWeights.length; i += 1) expect(inWeights[i]!, `step ${i}: the model only fades in`).toBeGreaterThanOrEqual(inWeights[i - 1]! - 1e-9);
    expect(inWeights.at(-1)!).toBeCloseTo(1, 3);
    const rest = (await statsOf(page)).draws;
    await page.clock.runFor(3000);
    expect((await statsOf(page)).draws, "nothing is drawn at rest").toBe(rest);
  });
});
