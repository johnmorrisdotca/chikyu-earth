// The ridden satellite's model falls in size as the camera rises above it, and hands over to the ordinary mark (MODULES-1306): never larger than at the lowest height, smaller at every step up, gone by 2,000 km, with the ring
// and name back exactly when it has shrunk to the size of a ring; and no part of it is drawn outside the box the scene reports. The clock is the test's own (`speed=0`), stepped by the test.
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createSatellites, type ElementSet } from "../src/satellites/index.ts";
import { frameAt } from "../src/space/ephemeris.ts";
import { COUNT_SCRIPT, untilStill } from "./gl.ts";
import { routeElements } from "./recorded.ts";

test.beforeEach(({ page }) => routeElements(page));
test.describe.configure({ mode: "serial" });

const SPACE = "chikyu-space";
// With RIDE_THROTTLE set the browser's CPU is slowed by that factor, for the repeats under load.
const THROTTLE = Number(process.env.RIDE_THROTTLE ?? 0);
const T0 = Date.parse("2026-11-02T18:00:00Z");
interface Stats {
  draws: number;
  followModel: { x: number; y: number; radiusPx: number; box: { left: number; top: number; right: number; bottom: number }; shown: boolean } | null;
  satellites: { selectedRing: boolean };
}
const statsOf = (page: Page): Promise<Stats> => page.locator(SPACE).evaluate((el) => Reflect.get(el, "stats") as Stats);
let tick = 0;

const snapshot = JSON.parse(readFileSync(new URL("../test/recorded/celestrak-snapshot-2026-11-02.json", import.meta.url), "utf8")) as { fields: string[]; groups: Record<string, (string | number)[][]> };
const group = createSatellites(snapshot.groups["stations"]!.map((row) => Object.fromEntries(snapshot.fields.map((field, index) => [field, row[index]])) as unknown as ElementSet));

async function open(page: Page): Promise<number> {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/?look=space&time=${new Date(T0).toISOString()}&speed=0&center=-60,-10&sats=stations`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { pause(): void }).pause());
  if (THROTTLE > 1) await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  await untilStill(page);
  // a station the demo has no stand-in model for, so the package's own drawing is what is drawn
  const index = await page.locator(SPACE).evaluate((el) => {
    const space = el as unknown as { satelliteGroups: { name: string; count: number }[]; satelliteInfo(r: unknown): { name: string } | undefined };
    const count = space.satelliteGroups.find((g) => g.name === "stations")!.count;
    for (let i = 0; i < count; i += 1) {
      const info = space.satelliteInfo({ group: "stations", index: i });
      if (info && !/ISS|ZARYA|TIANHE|TIANGONG|CSS|HUBBLE|HST/i.test(info.name)) return i;
    }
    return 0;
  });
  await page.locator(SPACE).evaluate((el, i) => (el as unknown as { selectSatellite(r: unknown): void }).selectSatellite({ group: "stations", index: i }), index);
  return index;
}

/** Ride above the satellite at a height and wait for the draw that shows it: the draw count is read in the same turn as the time is stepped. */
async function at(page: Page, index: number, km: number, size: "distance" | "fixed" = "distance", same?: number): Promise<Stats> {
  if (same === undefined) tick += 1;
  const when = same ?? tick;
  await page.locator(SPACE).evaluate((el, mode) => el.setAttribute("ride-model-size", mode), size);
  const before = await page.locator(SPACE).evaluate((el, o) => {
    const draws = (Reflect.get(el, "stats") as { draws: number }).draws;
    (el as unknown as { ride(t: unknown, o: unknown): void }).ride({ group: "stations", index: o.index }, { view: "above", look: "down", distanceKm: o.km, smooth: false });
    Reflect.set(el, "time", o.time);
    return draws;
  }, { index, km, time: T0 + when * 1000 });
  await expect.poll(async () => (await statsOf(page)).draws, { timeout: 30_000, message: `a draw at ${km} km` }).toBeGreaterThan(before);
  return statsOf(page);
}

const radius = (s: Stats): number => s.followModel?.radiusPx ?? 0;

/**
 * Everything that can still arrive or be let go, as the page reports it: the sizes of the Earth's pictures in use, the finer tiles (level, shown, loading), the pictures of the bodies still to come, and how many assets are held.
 * Two frames taken while this is the same are two frames of the same pictures, which is what the comparison below needs: a picture that landed between them (in CI, at 6,000 km) shows as pixels that differ everywhere.
 */
const arrivals = (page: Page): Promise<{ pending: number; sign: string }> =>
  page.locator(SPACE).evaluate((el) => {
    const s = Reflect.get(el, "stats") as { tiers: unknown; tiles: { level: number | null; shown: number; loading: number; held: number }; bodies: { pending: number; painted: number; mapped: number }; assets: { entries: number } };
    return { pending: s.bodies.pending + s.tiles.loading, sign: JSON.stringify([s.tiers, s.tiles.level, s.tiles.shown, s.tiles.held, s.bodies.painted, s.bodies.mapped, s.assets.entries]) };
  });
/** Wait until nothing has changed for `reads` reads a second apart (more than `DOWNGRADE_AFTER_MS` for a count of 5: a picture let go is let go) and nothing is on its way. Returns what the pictures are. */
async function arrived(page: Page, reads: number): Promise<string> {
  let last = "";
  let same = 0;
  await expect
    .poll(
      async () => {
        const now = await arrivals(page);
        same = now.sign === last && now.pending === 0 ? same + 1 : 0;
        last = now.sign;
        return same >= reads;
      },
      { timeout: 60_000, intervals: [1000], message: "the pictures have all arrived and none is being let go" },
    )
    .toBe(true);
  return last;
}

test("distance (the default): the model's radius falls with height: 17% of the picture at 150 km, less at 1,000 km, and none at 6,000 km where only the mark is", async ({ page }) => {
  const index = await open(page);
  const box = (await page.locator(SPACE).boundingBox())!;
  const low = await at(page, index, 150);
  const mid = await at(page, index, 1000);
  const high = await at(page, index, 6000);
  expect(radius(low) / box.height, "the lowest height keeps the 0.46.1 size").toBeCloseTo(0.17, 2);
  expect(radius(mid), "smaller at 1,000 km").toBeLessThan(radius(low) / 5);
  expect(radius(mid), "but still drawn").toBeGreaterThan(0);
  expect(high.followModel, "no model at 6,000 km").toBeNull();
  expect(low.satellites.selectedRing, "the model is the marker at 150 km: no ring over it").toBe(false);
  expect(high.satellites.selectedRing, "the ordinary mark at 6,000 km: the ring is back").toBe(true);
});

test("distance: across the hand-over the model only shrinks, by steps too small to pop, and the ring is back exactly when it is the size of a ring", async ({ page }) => {
  test.setTimeout(240_000);
  const index = await open(page);
  let last = Infinity;
  let ringFrom = -1;
  for (let km = 1000; km <= 2000; km += 50) {
    const s = await at(page, index, km);
    const r = radius(s);
    expect(r, `${km} km: it does not grow`).toBeLessThanOrEqual(last + 1e-6);
    if (last !== Infinity) expect(last - r, `${km} km: the step is too small to pop`).toBeLessThan(2.5);
    if (s.satellites.selectedRing && ringFrom < 0) ringFrom = km;
    if (r >= 10) expect(s.satellites.selectedRing, `${km} km: a model of ${r.toFixed(1)} px has no ring over it`).toBe(false);
    last = r;
  }
  expect(last, "nothing of the model by 2,000 km").toBe(0);
  expect(ringFrom, "the ring came back during the hand-over").toBeGreaterThan(1000);
});

test("fixed: the model is the same size at 150, 1,000 and 6,000 km, and the ring and name stay off it", async ({ page }) => {
  const index = await open(page);
  const box = (await page.locator(SPACE).boundingBox())!;
  const sizes: number[] = [];
  for (const km of [150, 1000, 6000, 11_000]) {
    const s = await at(page, index, km, "fixed");
    expect(s.followModel?.shown, `${km} km: the model is drawn`).toBe(true);
    expect(s.satellites.selectedRing, `${km} km: no ring over the model`).toBe(false);
    sizes.push(radius(s) / box.height);
  }
  for (const share of sizes) expect(share, "the same share of the picture at every height").toBeCloseTo(sizes[0]!, 3);
  expect(sizes[0]).toBeCloseTo(0.17, 2);
  // and the ring is back when the ride ends
  await page.locator(SPACE).evaluate((el) => (el as unknown as { ride(t: null): void }).ride(null));
  const draws = (await statsOf(page)).draws;
  await page.locator(SPACE).evaluate((el, t) => Reflect.set(el, "time", t), T0 + 99_000);
  await expect.poll(async () => (await statsOf(page)).draws, { timeout: 30_000 }).toBeGreaterThan(draws);
  expect((await statsOf(page)).satellites.selectedRing, "the ring is back when the ride ends").toBe(true);
});

test("no part of the model is drawn outside its box, in either size mode: the frame with the model hidden differs from it only inside the box", async ({ page }) => {
  test.setTimeout(240_000);
  const index = await open(page);
  // nothing chosen: a chosen satellite's ring and name are drawn with the model hidden and not with it, and they are not the model
  await page.locator(SPACE).evaluate((el) => (el as unknown as { selectSatellite(r: unknown): void }).selectSatellite(null));
  const shot = (): Promise<string> => page.locator(SPACE).screenshot().then((b) => b.toString("base64"));
  for (const [mode, km] of [["distance", 150], ["distance", 400], ["distance", 1000], ["fixed", 150], ["fixed", 1000], ["fixed", 6000]] as const) {
    // both frames at the same moment: the ground under a camera 150 km up moves tens of pixels a second
    tick += 1;
    const moment = tick;
    const withModel = await at(page, index, km, mode, moment);
    expect(withModel.followModel?.shown, `${km} km: the model is drawn`).toBe(true);
    await untilStill(page);
    // hold everything that can arrive or be let go before the first frame (TEST-RULES, pattern 5): the count read at the first quiet moment was not enough in CI
    const pictures = await arrived(page, 5);
    const a = await shot();
    // the same frame with the model hidden: from inside, the view above shows a dot and no drawing of the satellite
    await page.locator(SPACE).evaluate((el) => el.setAttribute("ride-viewpoint", "inside"));
    const hidden = await at(page, index, km, mode, moment);
    expect(hidden.followModel, `${km} km: no model from inside`).toBeNull();
    await untilStill(page);
    expect(await arrived(page, 2), `${mode} ${km} km: the pictures are the same for both frames`).toBe(pictures);
    const b = await shot();
    await page.locator(SPACE).evaluate((el) => el.setAttribute("ride-viewpoint", "outside"));
    mkdirSync(test.info().outputDir, { recursive: true });
    writeFileSync(test.info().outputPath(`${mode}-${km}-with-model.png`), Buffer.from(a, "base64"));
    writeFileSync(test.info().outputPath(`${mode}-${km}-model-hidden.png`), Buffer.from(b, "base64"));
    const box = withModel.followModel!.box;
    const outside = await page.evaluate(
      async ([one, two, left, top, right, bottom]) => {
        const read = async (data: string): Promise<ImageData> => {
          const img = new Image();
          img.src = `data:image/png;base64,${data}`;
          await img.decode();
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0);
          return ctx.getImageData(0, 0, img.width, img.height);
        };
        const [p, q] = [await read(one as string), await read(two as string)];
        let differing = 0;
        let inside = 0;
        const margin = 3;
        // The stations' own orbit lines (amber) are drawn from a path that the layer works out again after a minute of the page's time (and a slow machine takes a minute between the two frames), at the same moment but
        // not at the same sub-pixel: they are not the model, so a pixel within 3 px of an amber one (the line moves a pixel or two, and is blended with the sky) in either frame is left out. The model is blue, cream and grey.
        const amber = (img: ImageData, i: number): boolean => img.data[i]! > 55 && img.data[i + 1]! > 45 && img.data[i]! - img.data[i + 2]! > 30;
        const skip = new Uint8Array(p.width * p.height);
        for (let y = 0; y < p.height; y += 1) {
          for (let x = 0; x < p.width; x += 1) {
            const i = (y * p.width + x) * 4;
            if (!amber(p, i) && !amber(q, i)) continue;
            for (let dy = -3; dy <= 3; dy += 1) for (let dx = -3; dx <= 3; dx += 1) if (x + dx >= 0 && x + dx < p.width && y + dy >= 0 && y + dy < p.height) skip[(y + dy) * p.width + x + dx] = 1;
          }
        }
        for (let y = 0; y < p.height; y += 1) {
          for (let x = 0; x < p.width; x += 1) {
            if (skip[y * p.width + x]) continue;
            const i = (y * p.width + x) * 4;
            const diff = Math.abs(p.data[i]! - q.data[i]!) + Math.abs(p.data[i + 1]! - q.data[i + 1]!) + Math.abs(p.data[i + 2]! - q.data[i + 2]!);
            if (diff < 12) continue;
            if (x >= (left as number) - margin && x <= (right as number) + margin && y >= (top as number) - margin && y <= (bottom as number) + margin) inside += 1;
            else differing += 1;
          }
        }
        return { differing, inside };
      },
      [a, b, box.left, box.top, box.right, box.bottom] as const,
    );
    expect(outside.inside, `${mode} ${km} km: the model is in the picture (box ${JSON.stringify(box)}, ${JSON.stringify(outside)})`).toBeGreaterThan(20);
    expect(outside.differing, `${mode} ${km} km: pixels that differ outside the box (box ${JSON.stringify(box)}, ${JSON.stringify(outside)})`).toBe(0);
  }
});

test("a name under the model is kept clear of it and is back when the model has handed over, and the page is told where the model is", async ({ page }) => {
  test.setTimeout(240_000);
  const index = await open(page);
  await page.locator(SPACE).evaluate((el) => (el as unknown as { selectSatellite(r: unknown): void }).selectSatellite(null));
  // the ground point under the satellite (the middle of a ride above it): longitude from the angle to the vernal equinox less the Earth's own turn
  const norad = await page.locator(SPACE).evaluate((el, i) => (el as unknown as { satelliteInfo(r: unknown): { noradId: number } }).satelliteInfo({ group: "stations", index: i })!.noradId, index);
  const mine = group.sets.findIndex((set) => set.NORAD_CAT_ID === norad);
  const out = new Float64Array(6);
  expect(group.exact(mine, T0 + 1000, out)).toBe(true);
  const radius = Math.hypot(out[0]!, out[1]!, out[2]!);
  const lat = (Math.asin(out[1]! / radius) * 180) / Math.PI;
  const ra = (Math.atan2(-out[2]!, out[0]!) * 180) / Math.PI;
  const lon = ((((ra - frameAt(T0 + 1000).spin) % 360) + 540) % 360) - 180;
  await page.locator(SPACE).evaluate((el, at) => Reflect.set(el, "places", [{ id: "under", lon: at.lon, lat: at.lat, label: "UNDERMODEL" }]), { lon, lat });
  await page.locator(SPACE).evaluate((el) => {
    const told: unknown[] = [];
    Reflect.set(window, "__told", told);
    el.addEventListener("chikyu-ride-model", (event) => told.push((event as CustomEvent).detail));
  });
  const names = (): Promise<string[]> => page.locator(SPACE).evaluate((el) => [...el.shadowRoot!.querySelectorAll<HTMLElement>(".pl-name")].filter((node) => !node.hidden).map((node) => node.textContent ?? ""));
  const near = await at(page, index, 150);
  expect(near.followModel?.shown, "the model is drawn").toBe(true);
  expect(await names(), "the name under the model is kept clear of it").not.toContain("UNDERMODEL");
  const far = await at(page, index, 6000);
  expect(far.followModel, "no model at 6,000 km").toBeNull();
  await expect.poll(names, { timeout: 20_000, message: "the name is back when the model has gone" }).toContain("UNDERMODEL");
  const told = (await page.evaluate(() => Reflect.get(window, "__told"))) as { box: { left: number; right: number } | null; radiusPx: number }[];
  expect(told.some((one) => one.box !== null && one.radiusPx > 20), "the page was told the model's box").toBe(true);
  expect(told.at(-1)?.box, "and told when it went").toBeNull();
});
