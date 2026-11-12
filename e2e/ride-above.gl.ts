// Riding above a satellite (`ride(ref, { view: "above" })`): the camera on the line from the Earth's centre through the satellite, looking straight down at it with the way it is going at the top of the picture; the satellite stays in the middle of the picture
// while the clock moves it along its orbit and the Earth turns beneath; the zoom changes the height. Chromium, drawn in software.
import { expect, test, type Page } from "@playwright/test";
import { routeElements } from "./recorded.ts";

test.use({ reducedMotion: "reduce" });

const SPACE = "chikyu-space";
interface Camera {
  position: number[];
  quaternion: number[];
  fov: number;
}
interface Where {
  camera: Camera;
  width: number;
  height: number;
  place: { x: number; y: number; visible: boolean; heightKm: number } | null;
}
const draws = (page: Page): Promise<number> => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { draws: number }).draws);
async function atRest(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const before = await draws(page);
        await page.evaluate(async () => {
          for (let frame = 0; frame < 30; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
        });
        return (await draws(page)) - before;
      },
      { timeout: 60_000, message: "the view is at rest" },
    )
    .toBe(0);
}
const where = (page: Page): Promise<Where> =>
  page.locator(SPACE).evaluate((el) => {
    const own = el.getBoundingClientRect();
    const api = el as unknown as { riding: { target: { group: string; index: number } } | null; placeSatellite(ref: { group: string; index: number }): Where["place"] };
    return { camera: (Reflect.get(el, "stats") as { camera: Camera }).camera, width: own.width, height: own.height, place: api.riding ? api.placeSatellite(api.riding.target) : null };
  });
/** A direction of the camera's own axes (x right, y up, z back) in the scene's. */
function axis(camera: Camera, local: [number, number, number]): number[] {
  const [qx, qy, qz, qw] = camera.quaternion as [number, number, number, number];
  const tx = 2 * (qy * local[2] - qz * local[1]);
  const ty = 2 * (qz * local[0] - qx * local[2]);
  const tz = 2 * (qx * local[1] - qy * local[0]);
  return [local[0] + qw * tx + (qy * tz - qz * ty), local[1] + qw * ty + (qz * tx - qx * tz), local[2] + qw * tz + (qx * ty - qy * tx)];
}

async function open(page: Page): Promise<void> {
  await routeElements(page);
  await page.goto("/chikyu-earth/?look=space&time=2026-11-02T18:00Z&speed=0&center=-100,40&sats=stations&ride=iss&rview=above&light=lit");
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => (await page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { ride: { riding: boolean; gliding: boolean } }).ride)).riding, { timeout: 30_000 }).toBe(true);
  await expect.poll(async () => (await page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { ride: { gliding: boolean } }).ride)).gliding, { timeout: 30_000 }).toBe(false);
  await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { pause(): void }).pause());
  await atRest(page);
}

test("above: the satellite stays in the middle of the picture over a minute of the clock while the camera goes with it, straight down, the way it goes at the top", async ({ page }) => {
  await open(page);
  const before = await where(page);
  expect(await page.locator(SPACE).evaluate((el) => (Reflect.get(el, "riding") as { view: string }).view), "the ride's view is above").toBe("above");
  expect(before.place, "the satellite is in sight").not.toBeNull();
  expect(Math.abs(before.place!.x - before.width / 2) < 3 && Math.abs(before.place!.y - before.height / 2) < 3, `the satellite is in the middle of the picture (${before.place!.x}, ${before.place!.y} of ${before.width} by ${before.height})`).toBe(true);
  // looking straight down: the camera's way (its minus z) is from the camera to the Earth's centre
  const back = axis(before.camera, [0, 0, 1]);
  const radial = before.camera.position.map((n) => n / Math.hypot(...before.camera.position));
  expect(back[0]! * radial[0]! + back[1]! * radial[1]! + back[2]! * radial[2]!, "straight down: the camera looks along the line to the Earth's centre").toBeGreaterThan(0.999);
  // a minute of the clock later
  await page.locator(SPACE).evaluate((el) => el.setAttribute("time", "2026-11-02T18:01Z"));
  await atRest(page);
  const after = await where(page);
  expect(Math.abs(after.place!.x - after.width / 2) < 3 && Math.abs(after.place!.y - after.height / 2) < 3, "still in the middle a minute on").toBe(true);
  const moved = after.camera.position.map((n, i) => n - before.camera.position[i]!);
  const travelled = Math.hypot(...moved);
  // the camera is about 1.54 Earth radii from the centre (the ISS's 1.066 and 3,000 km above it), so a minute of the satellite's 7.66 km/s (0.0687 radian) takes it about 0.105 of a radius
  expect(travelled, "the camera went with the satellite, about 0.105 of the Earth's radius in a minute").toBeGreaterThan(0.09);
  expect(travelled).toBeLessThan(0.115);
  // the way it went is the top of the picture (from the picture before: the camera's up, now, is along the way it went)
  const up = axis(after.camera, [0, 1, 0]);
  const along = (moved[0]! * up[0]! + moved[1]! * up[1]! + moved[2]! * up[2]!) / travelled;
  expect(along, "the way the satellite goes is at the top of the picture").toBeGreaterThan(0.97);
});

test("above: the zoom changes the height, a drag turns the picture about the satellite, and the satellite stays in the middle", async ({ page }) => {
  await open(page);
  const heightOf = (w: Where): number => Math.hypot(...w.camera.position) - (1 + w.place!.heightKm / 6371);
  const base = await where(page);
  const controls = (view: { yaw: number; tilt: number; zoom: number }): Promise<void> =>
    page.locator("kazoku-view-controls").evaluate((el, v) => (el as unknown as { controller: { set(view: unknown, final: boolean, why: string): void } }).controller.set(v, true, "test"), view);
  await controls({ yaw: 0, tilt: 0, zoom: 2 });
  await atRest(page);
  const zoomed = await where(page);
  expect(heightOf(zoomed) / heightOf(base), "twice the zoom, half the height").toBeGreaterThan(0.45);
  expect(heightOf(zoomed) / heightOf(base)).toBeLessThan(0.55);
  // a turn about the satellite: the top of the picture turns about the line down to the Earth's centre
  await controls({ yaw: 90, tilt: 0, zoom: 1 });
  await atRest(page);
  const turned = await where(page);
  const before = axis(base.camera, [0, 1, 0]);
  const after = axis(turned.camera, [0, 1, 0]);
  expect(Math.abs(before[0]! * after[0]! + before[1]! * after[1]! + before[2]! * after[2]!), "the top of the picture is a quarter turn round").toBeLessThan(0.1);
  expect(Math.abs(turned.place!.x - turned.width / 2) < 3 && Math.abs(turned.place!.y - turned.height / 2) < 3, "the satellite is still in the middle").toBe(true);
  // a tip: the camera is back from straight above, and still looks at the satellite in the middle
  await controls({ yaw: 0, tilt: 40, zoom: 1 });
  await atRest(page);
  const tipped = await where(page);
  const down = axis(tipped.camera, [0, 0, 1]);
  const radial = tipped.camera.position.map((n) => n / Math.hypot(...tipped.camera.position));
  expect(down[0]! * radial[0]! + down[1]! * radial[1]! + down[2]! * radial[2]!, "no longer straight down").toBeLessThan(0.95);
  expect(Math.abs(tipped.place!.x - tipped.width / 2) < 3 && Math.abs(tipped.place!.y - tipped.height / 2) < 3, "the satellite is in the middle").toBe(true);
});

test.describe("with motion allowed", () => {
  test.use({ reducedMotion: "no-preference" });

  test("above: the camera glides into it and out of it, and the address says rview=above", async ({ page }) => {
    await routeElements(page);
    await page.goto("/chikyu-earth/?look=space&time=2026-11-02T18:00Z&speed=0&center=-100,40&sats=stations&ride=iss&light=lit");
    await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
    const ride = (): Promise<{ riding: boolean; gliding: boolean }> => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { ride: { riding: boolean; gliding: boolean } }).ride);
    await expect.poll(async () => (await ride()).riding, { timeout: 30_000 }).toBe(true);
    await expect.poll(async () => (await ride()).gliding, { timeout: 30_000 }).toBe(false);
    expect(new URL(page.url()).searchParams.get("rview"), "from it: no rview in the address").toBeNull();
    // a glide is short, and a poll from the test can miss it on a busy machine (MODULES-1190): the page counts each one at every animation frame, from here on
    await page.locator(SPACE).evaluate((el) => {
      let was = false;
      Reflect.set(window, "__glides", 0);
      const watch = (): void => {
        const now = (Reflect.get(el, "stats") as { ride: { gliding: boolean } }).ride.gliding;
        if (now && !was) Reflect.set(window, "__glides", (Reflect.get(window, "__glides") as number) + 1);
        was = now;
        requestAnimationFrame(watch);
      };
      watch();
    });
    const glides = (): Promise<number> => page.evaluate(() => Reflect.get(window, "__glides") as number);
    // the button: the view changes by a glide, and the address says so
    const first = await glides();
    await page.locator('[data-ride-view="above"]').dispatchEvent("click");
    await expect.poll(glides, { timeout: 10_000, message: "the camera glides into the view" }).toBeGreaterThan(first);
    await expect.poll(async () => (await ride()).gliding, { timeout: 30_000 }).toBe(false);
    expect(new URL(page.url()).searchParams.get("rview"), "the address says above").toBe("above");
    expect(await page.locator(SPACE).evaluate((el) => (Reflect.get(el, "riding") as { view: string }).view)).toBe("above");
    const second = await glides();
    await page.locator('[data-ride-view="from"]').dispatchEvent("click");
    await expect.poll(glides, { timeout: 10_000, message: "and out of it" }).toBeGreaterThan(second);
    await expect.poll(async () => (await ride()).gliding, { timeout: 30_000 }).toBe(false);
    expect(new URL(page.url()).searchParams.get("rview"), "from it again: no rview").toBeNull();
    // above a body is a follow: the button and the address say follow
    await page.locator('[data-ride-view="above"]').dispatchEvent("click");
    await expect.poll(async () => (await ride()).gliding, { timeout: 30_000 }).toBe(false);
    await page.locator('[data-ride="Moon"]').dispatchEvent("click");
    await expect.poll(async () => new URL(page.url()).searchParams.get("rview"), { timeout: 30_000, message: "a body is followed, and the address says so" }).toBe("follow");
    expect(await page.locator('[data-ride-view="follow"]').evaluate((b) => b.classList.contains("on"))).toBe(true);
    expect(await page.locator('[data-ride-view="above"]').evaluate((b) => b.classList.contains("on"))).toBe(false);
  });
});
