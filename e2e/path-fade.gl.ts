// The ridden satellite's own orbit grows out of the camera, and its group orbit line is left out while it is ridden: in Ride along the orbit ahead, seen edge-on, was a hard bright vertical stroke from the model to the top of the picture; its opacity now rises from nothing at the
// camera to the path's whole look about 300 km along it. Every clock is the test's own (`speed=0`, the view's controls paused). The path's pixels are what the picture has with the path on and not with it off, of the same held frame.
// The pictures (path on, path off) are written to the test's output folder. With PATHS_THROTTLE set the browser's CPU is slowed by that factor, for the repeats under load.
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { COUNT_SCRIPT, untilStill } from "./gl.ts";
import { routeElements } from "./recorded.ts";

test.beforeEach(({ page }) => routeElements(page));
test.describe.configure({ mode: "serial" });

const SPACE = "chikyu-space";
const THROTTLE = Number(process.env.PATHS_THROTTLE ?? 0);

interface Stats {
  draws: number;
  followModel: { shown: boolean; x: number; y: number; radiusPx: number } | null;
  satellites: { orbitLines: number };
}
const statsOf = (page: Page): Promise<Stats> => page.locator(SPACE).evaluate((el) => Reflect.get(el, "stats") as Stats);

async function open(page: Page): Promise<void> {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto("/chikyu-earth/?look=space&time=2026-11-02T18:00Z&speed=0&center=-100,40&sats=stations");
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { pause(): void }).pause());
  if (THROTTLE > 1) await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  await untilStill(page);
}

interface Api {
  setPaths(list: unknown[]): void;
  selectedPath: boolean;
  satelliteGroups: { name: string; count: number }[];
  satelliteInfo(r: unknown): { noradId: number } | undefined;
  selectSatellite(ref: unknown): void;
  ride(target: unknown, options: unknown): void;
}
const ISS = 25544;

/** Ride the ISS from outside, the camera a little behind and above it, until its model is drawn and the picture is still. */
async function rideIss(page: Page): Promise<{ x: number }> {
  await page.locator(SPACE).evaluate((el, norad) => {
    el.setAttribute("ride-viewpoint", "outside");
    const space = el as unknown as Api;
    const count = space.satelliteGroups.find((group) => group.name === "stations")!.count;
    for (let index = 0; index < count; index += 1) if (space.satelliteInfo({ group: "stations", index })?.noradId === norad) space.ride({ group: "stations", index }, { view: "from", look: "horizon", smooth: false });
  }, ISS);
  await expect.poll(async () => (await statsOf(page)).followModel?.shown ?? false, { timeout: 60_000, message: "the model of the ISS is drawn" }).toBe(true);
  await untilStill(page);
  return { x: (await statsOf(page)).followModel!.x };
}

/** What the picture shows of the path, in one held frame: `selected` (the satellite's own orbit, which a ride fades) or `listed` (the same orbit as one of the page's paths, in the same look, which it does not). Both are shown, in turn, against the picture with neither. */
async function pictures(page: Page): Promise<{ none: Buffer; selected: Buffer; listed: Buffer }> {
  const set = (listed: boolean, selected: boolean): Promise<void> =>
    page.locator(SPACE).evaluate((el, [withListed, withSelected]) => {
      const space = el as unknown as Api;
      space.setPaths(withListed ? [{ id: 25544, style: "selected" }] : []);
      space.selectedPath = withSelected as boolean;
    }, [listed, selected] as const);
  const shot = async (listed: boolean, selected: boolean): Promise<Buffer> => {
    await set(listed, selected);
    await untilStill(page);
    return page.locator(SPACE).screenshot();
  };
  const none = await shot(false, false);
  const selected = await shot(false, true);
  const listed = await shot(true, false);
  return { none, selected, listed };
}

/**
 * How much of the path's white shows in each band of rows (shares of the picture's height), in the columns `half` pixels either side of `x`: the most, over the pixels of the band, that `shot` has gone towards white from `base`, as a share of the way
 * a pixel could go. The path is white, so this is the opacity it is drawn at there (its own `opacity` at most), whatever it is drawn over.
 */
async function whiteness(page: Page, base: Buffer, shot: Buffer, x: number, half: number, bands: [number, number][]): Promise<number[]> {
  return page.evaluate(
    async ([one, two, cx, band, spans]) => {
      const load = async (base64: string): Promise<ImageData> => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext("2d")!;
        context.drawImage(bitmap, 0, 0);
        return context.getImageData(0, 0, bitmap.width, bitmap.height);
      };
      const [zero, first] = [await load(one as string), await load(two as string)];
      const out: number[] = [];
      for (const [from, to] of spans as [number, number][]) {
        let most = 0;
        for (let y = Math.floor(zero.height * from); y < Math.floor(zero.height * to); y += 1) {
          for (let px = Math.max(0, (cx as number) - (band as number)); px <= Math.min(zero.width - 1, (cx as number) + (band as number)); px += 1) {
            const i = (y * zero.width + px) * 4;
            for (let c = 0; c < 3; c += 1) {
              const room = 255 - zero.data[i + c]!;
              if (room >= 60) most = Math.max(most, (first.data[i + c]! - zero.data[i + c]!) / room);
            }
          }
        }
        out.push(most);
      }
      return out;
    },
    [base.toString("base64"), shot.toString("base64"), x, half, bands] as const,
  );
}

// the bands of rows, as shares of the picture's height: the model sits at the bottom, the horizon is near 0.33; below the horizon the Earth hides the far side of the orbit, so there the picture shows only the way ahead, from the craft
const NEAR: [number, number] = [0.36, 0.64];
const FAR: [number, number] = [0.025, 0.1];

test("in Ride along the ridden orbit is faint where it leaves the craft and as bright as it is drawn far ahead", async ({ page }) => {
  await open(page);
  const { x } = await rideIss(page);
  const { none, selected } = await pictures(page);
  writeFileSync(test.info().outputPath("ride-path-on.png"), selected);
  writeFileSync(test.info().outputPath("ride-path-off.png"), none);
  const [near, far] = await whiteness(page, none, selected, Math.round(x), 6, [NEAR, FAR]);
  expect(far, "far ahead the path is drawn at its look (0.85 at most)").toBeGreaterThan(0.6);
  expect(near, "at the craft the path is a fraction of that").toBeLessThan(far * 0.25);
  expect(near, "and it is there: it grows out of the craft, it does not stop short of it").toBeGreaterThan(0.01);
});

test("outside a ride the chosen orbit is drawn whole: the same as the same orbit as one of the page's paths", async ({ page }) => {
  await open(page);
  await page.locator(SPACE).evaluate((el) => {
    const space = el as unknown as Api;
    for (let index = 0; index < space.satelliteGroups.find((group) => group.name === "stations")!.count; index += 1) if (space.satelliteInfo({ group: "stations", index })?.noradId === 25544) space.selectSatellite({ group: "stations", index });
  });
  await untilStill(page);
  const { none, selected, listed } = await pictures(page);
  const width = 736;
  const [chosen, page_] = [await whiteness(page, none, selected, width / 2, width, [[0, 1]]), await whiteness(page, none, listed, width / 2, width, [[0, 1]])];
  expect(chosen[0]!, "the orbit is in the picture").toBeGreaterThan(0.3);
  expect(chosen[0]!, "the chosen orbit is as bright as a listed one").toBeCloseTo(page_[0]!, 2);
  expect(selected.equals(listed), "and the pictures are the same").toBe(true);
});

test("while the ISS is ridden the stations' orbit lines are drawn but the ISS's own, and they come back when the ride ends", async ({ page }) => {
  await open(page);
  await expect.poll(async () => (await statsOf(page)).satellites.orbitLines, { timeout: 30_000, message: "the stations' orbit lines are drawn" }).toBeGreaterThan(2);
  await untilStill(page);
  const before = (await statsOf(page)).satellites.orbitLines;
  await rideIss(page);
  // the ISS is several objects of the group (its modules), each with its own line along the one orbit: those are left out with the ridden one's; every other station's line is drawn
  await expect.poll(async () => (await statsOf(page)).satellites.orbitLines, { message: "the ridden satellite's lines are not drawn" }).toBeLessThan(before);
  expect((await statsOf(page)).satellites.orbitLines, "the other stations' lines are").toBeGreaterThan(0);
  await page.locator(SPACE).evaluate((el) => (el as unknown as Api).ride(null, {}));
  await untilStill(page);
  await expect.poll(async () => (await statsOf(page)).satellites.orbitLines, { message: "the line is back" }).toBe(before);
});
