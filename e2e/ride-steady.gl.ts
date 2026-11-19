// A ride's camera settles and stays above the ground (MODULES-1685). Above a satellite there is no way to face: `face()` says no and the camera stays as it was. Riding from it or following it, every facing turns the
// camera and the camera then holds still as the clock moves on (a facing along the ground once looked at the satellite with the picture's top along the line of sight, and the camera's turn flipped from one draw to the next).
// No ride, in any view or facing, puts the camera under the ground. The clock is the test's own: `speed=0`, each second set by the test.
import { expect, test, type Page } from "@playwright/test";
import { settle } from "./gl.ts";
import { routeElements } from "./recorded.ts";

test.beforeEach(({ page }) => routeElements(page));
test.describe.configure({ mode: "serial" });
test.use({ reducedMotion: "no-preference" });

const SPACE = "chikyu-space";
const T0 = Date.parse("2026-11-02T18:00Z");
const FACES = ["ahead", "behind", "left", "right", "down", "up"] as const;
/** The ground's radius in Earth radii, and the least the package keeps the camera above it (1 km). */
const GROUND = 1 + 1 / 6371;

interface Camera {
  position: [number, number, number];
  quaternion: [number, number, number, number];
}
interface Ride {
  view: "from" | "follow" | "above";
  look?: "down" | "horizon";
  viewpoint?: "outside" | "inside";
}
const MODES: { name: string; ride: Ride }[] = [
  { name: "along, outside, down", ride: { view: "from", look: "down", viewpoint: "outside" } },
  { name: "along, outside, horizon", ride: { view: "from", look: "horizon", viewpoint: "outside" } },
  { name: "along, inside, down", ride: { view: "from", look: "down", viewpoint: "inside" } },
  { name: "along, inside, horizon", ride: { view: "from", look: "horizon", viewpoint: "inside" } },
  { name: "follow", ride: { view: "follow" } },
  { name: "above", ride: { view: "above" } },
];

async function open(page: Page): Promise<void> {
  await page.goto(`/chikyu-earth/?look=space&time=${new Date(T0).toISOString()}&speed=0&center=-100,40&sats=stations`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { pause(): void }).pause());
  await settle(page);
}

const draws = (page: Page): Promise<number> => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { draws: number }).draws);
const camera = (page: Page): Promise<Camera> => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { camera: Camera }).camera);

/** Ride the ISS (no glide), at the first moment, with the controls at rest, and wait for the draw. */
async function rideIss(page: Page, ride: Ride, face?: string): Promise<void> {
  const before = await draws(page);
  await page.locator(SPACE).evaluate(
    (el, { ride, face, time }) => {
      el.setAttribute("time", time);
      const space = el as unknown as { ride(target: unknown, options: unknown): void; setView(view: unknown, final: boolean): void };
      space.setView({ yaw: 0, tilt: 0, zoom: 1 }, true);
      space.ride({ group: "stations", index: 0 }, { ...ride, ...(face ? { face } : {}), smooth: false });
    },
    { ride, face, time: new Date(T0).toISOString() },
  );
  await expect.poll(() => draws(page)).toBeGreaterThan(before);
}

/** Move the clock to `seconds` after the first moment and wait for the draw. */
async function at(page: Page, seconds: number): Promise<Camera> {
  const before = await draws(page);
  await page.locator(SPACE).evaluate((el, time) => el.setAttribute("time", time), new Date(T0 + seconds * 1000).toISOString());
  await expect.poll(() => draws(page)).toBeGreaterThan(before);
  return camera(page);
}

/** The angle between two orientations, in degrees. */
function turn(a: Camera, b: Camera): number {
  const d = Math.abs(a.quaternion[0] * b.quaternion[0] + a.quaternion[1] * b.quaternion[1] + a.quaternion[2] * b.quaternion[2] + a.quaternion[3] * b.quaternion[3]);
  return (2 * Math.acos(Math.min(1, d)) * 180) / Math.PI;
}
const away = (c: Camera): number => Math.hypot(...c.position);

test("above: every facing is refused, the camera is left as it was, and the ride has no facing", async ({ page }) => {
  await open(page);
  for (const face of FACES) {
    await rideIss(page, { view: "above" });
    await settle(page, 300);
    const before = await camera(page);
    const asked = await page.locator(SPACE).evaluate((el, face) => {
      const space = el as unknown as { face(face: string): boolean; facing: string | null; riding: { face: string | null } | null };
      const key = new KeyboardEvent("keydown", { key: "w", bubbles: true, cancelable: true });
      el.dispatchEvent(key);
      return { faced: space.face(face), facing: space.facing, ridden: space.riding?.face ?? null, keyTaken: key.defaultPrevented };
    }, face);
    expect(asked, `above, ${face}`).toEqual({ faced: false, facing: null, ridden: null, keyTaken: false });
    // three seconds of the clock: the camera goes with the satellite, a few hundredths of a degree a second, and never jumps
    let last = before;
    for (const s of [1, 2, 3]) {
      const now = await at(page, s);
      expect(turn(last, now), `above, ${face}, ${s} s: the camera holds its look`).toBeLessThan(0.5);
      last = now;
    }
    // a facing asked as the ride opens is let go too
    await rideIss(page, { view: "above" }, face);
    expect(await page.locator(SPACE).evaluate((el) => (Reflect.get(el, "riding") as { face: string | null }).face), `above, opened facing ${face}`).toBeNull();
  }
});

for (const mode of MODES) {
  test(`${mode.name}: no facing puts the camera under the ground`, async ({ page }) => {
    await open(page);
    for (const face of [undefined, ...FACES]) {
      // opened with the facing, and turned to it by face()
      await rideIss(page, mode.ride, face);
      await settle(page, 300);
      const opened = await at(page, 1);
      expect(away(opened), `${mode.name}, opened facing ${face ?? "nothing"}: ${((away(opened) - 1) * 6371).toFixed(0)} km up`).toBeGreaterThanOrEqual(GROUND - 1e-9);
      // following it or above it, a camera kept out of the ground still has the satellite in the middle of the picture
      if (mode.ride.view !== "from") {
        const off = await page.locator(SPACE).evaluate((el) => {
          const own = el.getBoundingClientRect();
          const api = el as unknown as { placeSatellite(ref: { group: string; index: number }): { x: number; y: number } | null };
          const place = api.placeSatellite({ group: "stations", index: 0 });
          return place ? Math.hypot(place.x - own.width / 2, place.y - own.height / 2) : Infinity;
        });
        expect(off, `${mode.name}, opened facing ${face ?? "nothing"}: the satellite is in the middle`).toBeLessThan(3);
      }
      if (!face) continue;
      await rideIss(page, mode.ride);
      await page.locator(SPACE).evaluate((el, face) => (el as unknown as { face(face: string): boolean }).face(face), face);
      await settle(page, 1200);
      const faced = await at(page, 1);
      expect(away(faced), `${mode.name}, face("${face}"): ${((away(faced) - 1) * 6371).toFixed(0)} km up`).toBeGreaterThanOrEqual(GROUND - 1e-9);
    }
  });
}

for (const mode of MODES.filter((m) => m.ride.view !== "above")) {
  test(`${mode.name}: every facing turns the camera and it settles`, async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    for (const face of FACES) {
      await rideIss(page, mode.ride);
      const faced = await page.locator(SPACE).evaluate((el, face) => (el as unknown as { face(face: string): boolean }).face(face), face);
      expect(faced, `${mode.name}, face("${face}")`).toBe(true);
      // the glide is half a second: within two the camera is there
      await settle(page, 2000);
      expect(await page.locator(SPACE).evaluate((el) => Reflect.get(el, "facing")), `${mode.name}, ${face}`).toBe(face);
      let last = await camera(page);
      for (const s of [1, 2, 3]) {
        const now = await at(page, s);
        expect(turn(last, now), `${mode.name}, ${face}, ${s} s: the camera holds its look`).toBeLessThan(0.5);
        last = now;
      }
    }
  });
}
