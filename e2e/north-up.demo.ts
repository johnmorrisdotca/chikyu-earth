// North at the top of the view above a satellite, the compass on a ride's picture, and the sunlit and shadow colours of a ground track (MODULES-1437). The ISS is the ride, at a moment held by the test (the recorded elements of 2026-11-02),
// so the heading does not depend on the day this runs. The checks of the camera are made from the camera's own numbers (`stats.camera`) and an independent north taken from where the camera is, not from the package's own maths.
import { expect, test, type Page } from "@playwright/test";
import { routeElements } from "./recorded.ts";

const SPACE = "chikyu-space";
const AT = "2026-11-02T18:00Z";

interface Track {
  lat: number;
  lon: number;
  heightKm: number;
  bearingDeg: number;
  ascending: boolean;
  sunlit: boolean;
  northDeg: number | null;
  travelDeg: number | null;
}
interface Stats {
  draws: number;
  camera: { position: number[]; quaternion: number[] };
  ride: { riding: boolean; gliding: boolean; track: Track | null; compass: { northDeg: number; travelDeg: number | null; text: string } | null };
}
const stats = (page: Page): Promise<Stats> => page.locator(SPACE).evaluate((el) => Reflect.get(el, "stats") as Stats);
/** A direction of the camera's own axes (x right, y up, z back) in the scene's. */
function axis(camera: Stats["camera"], local: [number, number, number]): number[] {
  const [qx, qy, qz, qw] = camera.quaternion as [number, number, number, number];
  const tx = 2 * (qy * local[2] - qz * local[1]);
  const ty = 2 * (qz * local[0] - qx * local[2]);
  const tz = 2 * (qx * local[1] - qy * local[0]);
  return [local[0] + qw * tx + (qy * tz - qz * ty), local[1] + qw * ty + (qz * tx - qx * tz), local[2] + qw * tz + (qx * ty - qy * tx)];
}
/** North at the place under a camera on the line through the Earth's centre: the scene's y with the up part taken out. */
function northBelow(camera: Stats["camera"]): number[] {
  const r = camera.position.map((n) => n / Math.hypot(...camera.position));
  const dot = r[1]!;
  const level = [-dot * r[0]!, 1 - dot * r[1]!, -dot * r[2]!];
  const size = Math.hypot(...level);
  return level.map((n) => n / size);
}
const along = (a: number[], b: number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
/** An angle in 0 to 360 against another, the shortest way round. */
const apart = (a: number, b: number): number => Math.abs((((a - b) % 360) + 540) % 360 - 180);

/** The page over the ISS, the ride settled and nothing moving (the clock held). */
async function open(page: Page, query = ""): Promise<void> {
  await routeElements(page);
  await page.goto(`/chikyu-earth/?look=space&time=${AT}&speed=0&center=-100,40&sats=stations&ride=iss&rview=above&light=lit${query}`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => (await stats(page)).ride.riding, { timeout: 30_000 }).toBe(true);
  await expect.poll(async () => (await stats(page)).ride.gliding, { timeout: 30_000 }).toBe(false);
  await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { pause(): void }).pause());
  // the demo's controls may have been turning the view (a reader who allows motion): the picture is measured from no turn, as the drag test sets one on purpose
  await controls(page, { yaw: 0, tilt: 0, zoom: 1 });
  await settled(page);
}
/** No draw for a moment and a compass that shows what the last draw found. */
async function settled(page: Page): Promise<void> {
  let last = -1;
  await expect
    .poll(
      async () => {
        const now = (await stats(page)).draws;
        const still = now === last;
        last = now;
        return still;
      },
      { timeout: 30_000, intervals: [700] },
    )
    .toBe(true);
  await expect.poll(async () => (await stats(page)).ride.compass !== null, { timeout: 10_000 }).toBe(true);
}
const controls = (page: Page, view: { yaw: number; tilt: number; zoom: number }): Promise<void> =>
  page.locator("kazoku-view-controls").evaluate((el, v) => (el as unknown as { controller: { set(view: unknown, final: boolean, why: string): void } }).controller.set(v, true, "test"), view);

test("north up: north is at the top of the picture, the compass reads 0, and the satellite's way on the compass is its real heading", async ({ page }) => {
  await open(page, "&rup=north");
  expect(await page.locator(SPACE).evaluate((el) => (Reflect.get(el, "riding") as { up: string }).up)).toBe("north");
  const s = await stats(page);
  const track = s.ride.track!;
  // the top of the picture (the camera's up) is the local north under the camera, found here from the camera's own place
  expect(along(axis(s.camera, [0, 1, 0]), northBelow(s.camera)), "the top of the picture is north").toBeGreaterThan(0.999);
  expect(apart(track.northDeg!, 0), "the picture says north is at 0").toBeLessThan(0.5);
  expect(apart(s.ride.compass!.northDeg, 0)).toBeLessThan(0.5);
  // the ISS at this moment: south-east or north-east over the ground, never west of north in the east half's opposite
  expect(track.lat).toBeGreaterThan(-52);
  expect(track.lat).toBeLessThan(52);
  expect(apart(track.travelDeg!, track.bearingDeg), "the way it goes in the picture is its heading from north").toBeLessThan(0.5);
  expect(apart(s.ride.compass!.travelDeg!, track.bearingDeg)).toBeLessThan(0.6);
  // the compass says it in words
  const bearing = Math.round(track.bearingDeg) % 360;
  expect(s.ride.compass!.text).toMatch(new RegExp(`^Heading (N|NE|E|SE|S|SW|W|NW) ${bearing}°$`));
  await expect(page.locator(SPACE).locator("#compass")).toBeVisible();
  await expect(page.locator(SPACE).locator("#compass .words")).toHaveText(s.ride.compass!.text);
  // ascending is the way it goes in latitude, and the heading's half agrees
  expect(track.ascending).toBe(track.bearingDeg < 90 || track.bearingDeg > 270);
});

test("travel up (the default): the way it goes is at the top, and the compass's north is the other way round by its heading", async ({ page }) => {
  await open(page);
  expect(await page.locator(SPACE).evaluate((el) => (Reflect.get(el, "riding") as { up: string }).up)).toBe("travel");
  const s = await stats(page);
  const track = s.ride.track!;
  // the top is the satellite's way through space; the ground track's heading differs from it by the Earth's turn under it (about 2 to 5 degrees for the ISS), so the way it goes over the ground is a few degrees off the top
  expect(apart(track.travelDeg!, 0), "the way it goes is at the top, less the Earth's turn").toBeLessThan(6);
  expect(apart(track.northDeg!, 360 - track.bearingDeg), "north is a heading's turn the other way").toBeLessThan(6);
  expect(apart(track.northDeg!, 0), "north is not at the top").toBeGreaterThan(20);
  // today's behaviour: the camera's up is not north (the ISS is not going north) and compass dot is at the top
  expect(along(axis(s.camera, [0, 1, 0]), northBelow(s.camera))).toBeLessThan(0.999);
  expect(apart(s.ride.compass!.travelDeg!, 0)).toBeLessThan(6);
});

test("a drag turns the picture from where north-up has put it, and the compass follows", async ({ page }) => {
  await open(page, "&rup=north");
  await controls(page, { yaw: 30, tilt: 0, zoom: 1 });
  await settled(page);
  const s = await stats(page);
  // the picture is turned 30 degrees, so north is 30 degrees from the top (to the right: the top is turned to the left)
  expect(apart(s.ride.track!.northDeg!, 30), "north is 30 degrees from the top").toBeLessThan(1);
  expect(apart(s.ride.compass!.northDeg, 30)).toBeLessThan(1);
  await controls(page, { yaw: 0, tilt: 0, zoom: 1 });
  await settled(page);
  expect(apart((await stats(page)).ride.track!.northDeg!, 0)).toBeLessThan(0.5);
});

test("the compass can be hidden or kept to the arrow, and speaks Japanese on a Japanese page", async ({ page }) => {
  await open(page, "&rup=north");
  const compass = page.locator(SPACE).locator("#compass");
  await expect(compass).toBeVisible();
  await page.locator(SPACE).evaluate((el) => el.setAttribute("compass", "north"));
  await expect(compass.locator(".words")).toBeHidden();
  await expect(compass.locator("svg")).toBeVisible();
  await page.locator(SPACE).evaluate((el) => el.setAttribute("compass", "off"));
  await expect(compass).toBeHidden();
  await page.locator(SPACE).evaluate((el) => el.removeAttribute("compass"));
  await expect(compass).toBeVisible();
  await page.locator(SPACE).evaluate((el) => el.setAttribute("lang", "ja"));
  await page.locator(SPACE).evaluate((el) => (el.closest("html") as HTMLElement).setAttribute("lang", "ja"));
  await page.locator(SPACE).evaluate((el) => el.setAttribute("ride-up", "north"));
  await page.locator(SPACE).evaluate((el) => el.setAttribute("compass", "full"));
  await expect(compass.locator(".words")).toHaveText(/^進行方向 (北|北東|東|南東|南|南西|西|北西) \d+°$/);
  await expect(compass.locator("text.n")).toHaveText("北");
});

test("the event and the property say the heading, the ground point and the light, and say it again only when a whole degree changed", async ({ page }) => {
  await open(page, "&rup=north");
  const first = await page.locator(SPACE).evaluate((el) => {
    const heard: Track[] = [];
    el.addEventListener("chikyu-ride-track", (e) => heard.push((e as CustomEvent<Track>).detail));
    Reflect.set(window, "__heard", heard);
    return Reflect.get(el, "rideTrack") as Track;
  });
  expect(first.sunlit === true || first.sunlit === false).toBe(true);
  expect(Math.abs(first.lat)).toBeLessThanOrEqual(52);
  expect(first.heightKm).toBeGreaterThan(380);
  expect(first.heightKm).toBeLessThan(450);
  // nothing is said while the clock is held, and a few minutes on says it, with a heading that has changed
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (Reflect.get(window, "__heard") as unknown[]).length), "nothing said at rest").toBe(0);
  await page.locator(SPACE).evaluate((el) => el.setAttribute("time", "2026-11-02T18:20Z"));
  await expect.poll(() => page.evaluate(() => (Reflect.get(window, "__heard") as unknown[]).length), { timeout: 15_000 }).toBeGreaterThan(0);
  const heard = await page.evaluate(() => (Reflect.get(window, "__heard") as Track[])[0]!);
  expect(heard.bearingDeg).not.toBe(first.bearingDeg);
});

test.describe("switching live", () => {
  test.use({ reducedMotion: "no-preference" });

  test("with motion allowed, a ride that opens with north up has north at the top", async ({ page }) => {
    await open(page, "&rup=north");
    expect(apart((await stats(page)).ride.track!.northDeg!, 0)).toBeLessThan(0.5);
  });

  test("the picture turns to north in a glide, and back", async ({ page }) => {
    await open(page);
    const ride = (): Promise<boolean> => stats(page).then((s) => s.ride.gliding);
    // a glide is short: count it at each animation frame from the page
    await page.locator(SPACE).evaluate((el) => {
      Reflect.set(window, "__glides", 0);
      let was = false;
      const watch = (): void => {
        const now = (Reflect.get(el, "stats") as Stats).ride.gliding;
        if (now && !was) Reflect.set(window, "__glides", (Reflect.get(window, "__glides") as number) + 1);
        was = now;
        requestAnimationFrame(watch);
      };
      watch();
    });
    const glides = (): Promise<number> => page.evaluate(() => Reflect.get(window, "__glides") as number);
    await page.locator('[data-ride-up="north"]').dispatchEvent("click");
    await expect.poll(glides, { timeout: 10_000, message: "it glides" }).toBeGreaterThan(0);
    await expect.poll(ride, { timeout: 30_000 }).toBe(false);
    await settled(page);
    expect(apart((await stats(page)).ride.track!.northDeg!, 0)).toBeLessThan(0.5);
    expect(new URL(page.url()).searchParams.get("rup"), "the address says north").toBe("north");
    const before = await glides();
    await page.locator('[data-ride-up="travel"]').dispatchEvent("click");
    await expect.poll(glides, { timeout: 10_000, message: "and back" }).toBeGreaterThan(before);
    await expect.poll(ride, { timeout: 30_000 }).toBe(false);
    await settled(page);
    expect(apart((await stats(page)).ride.track!.travelDeg!, 0)).toBeLessThan(6);
    expect(new URL(page.url()).searchParams.get("rup")).toBeNull();
  });
});

test("with reduced motion the switch is a jump, not a glide", async ({ page }) => {
  await open(page);
  const seen = await page.locator(SPACE).evaluate(async (el) => {
    let glided = false;
    const watch = (): void => {
      if ((Reflect.get(el, "stats") as Stats).ride.gliding) glided = true;
      requestAnimationFrame(watch);
    };
    watch();
    el.setAttribute("ride-up", "north");
    await new Promise((done) => setTimeout(done, 1500));
    return glided;
  });
  expect(seen, "no glide").toBe(false);
  await settled(page);
  expect(apart((await stats(page)).ride.track!.northDeg!, 0)).toBeLessThan(0.5);
});

// ----- the flat map's ground track ----------------------------------------------------------------------------------------------------------------------------------------------

type Flat = HTMLElement & { selectedState: { sunlit: boolean; bearingDeg: number; ascending: boolean; lat: number; lon: number } | null; stats: { draws: number } };
/** Count the pixels of the two track colours on the flat map's dots, and read the key. */
async function trackPixels(page: Page): Promise<{ sun: number; shadow: number; key: string }> {
  return page.locator("chikyu-flat").evaluate((el) => {
    const canvas = el.shadowRoot!.querySelector<HTMLCanvasElement>("canvas.dots")!;
    const data = canvas.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height).data;
    const near = (i: number, r: number, g: number, b: number): boolean => Math.abs(data[i]! - r) < 14 && Math.abs(data[i + 1]! - g) < 14 && Math.abs(data[i + 2]! - b) < 14 && data[i + 3]! > 240;
    let sun = 0;
    let shadow = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (near(i, 0xff, 0xb0, 0x2e)) sun += 1;
      else if (near(i, 0x5a, 0xa9, 0xff)) shadow += 1;
    }
    return { sun, shadow, key: el.shadowRoot!.querySelector(".key")?.textContent ?? "" };
  });
}

test("the flat map's ground track of the ISS has both colours over a full orbit, a key, and the state says which it is in", async ({ page }) => {
  await page.goto("/chikyu-earth/flat.html");
  await page.locator("body[data-ready=true]").waitFor({ timeout: 30_000 });
  const flat = page.locator("chikyu-flat");
  await flat.evaluate((el) => {
    el.setAttribute("speed", "0");
    el.setAttribute("time", "2026-11-04T00:00Z");
    el.setAttribute("group", "stations");
    el.setAttribute("track", "");
    el.setAttribute("selected", "25544");
    el.scrollIntoView({ block: "start" });
  });
  await expect.poll(async () => (await trackPixels(page)).sun, { timeout: 15_000 }).toBeGreaterThan(40);
  const pixels = await trackPixels(page);
  expect(pixels.shadow, "the shadow part is drawn").toBeGreaterThan(40);
  expect(pixels.key, "the key to the two colours").toMatch(/In sunlight/);
  expect(pixels.key).toMatch(/In the Earth's shadow/);
  const state = await flat.evaluate((el) => (el as Flat).selectedState);
  expect(state).not.toBeNull();
  expect(typeof state!.sunlit).toBe("boolean");
  expect(state!.bearingDeg).toBeGreaterThanOrEqual(0);
  expect(state!.bearingDeg).toBeLessThan(360);
  expect(Math.abs(state!.lat)).toBeLessThanOrEqual(52);
  // the pick says the same
  const pick = await flat.evaluate((el) => {
    const heard: { sunlit: boolean | null; bearingDeg: number | null; ascending: boolean | null }[] = [];
    el.addEventListener("chikyu-flat-pick", (e) => heard.push((e as CustomEvent).detail));
    (el as unknown as { selected: number | null }).selected = null;
    return new Promise<(typeof heard)[number] | null>((done) => {
      el.addEventListener("chikyu-flat-pick", () => done(heard[heard.length - 1]!), { once: true });
      const key = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true });
      el.shadowRoot!.querySelector(".dots")!.dispatchEvent(key);
      el.shadowRoot!.querySelector(".dots")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      setTimeout(() => done(null), 3000);
    });
  });
  expect(pick, "choosing a satellite from the keyboard sends a pick").not.toBeNull();
  expect(typeof pick!.sunlit).toBe("boolean");
  expect(typeof pick!.bearingDeg).toBe("number");
  expect(typeof pick!.ascending).toBe("boolean");
});
