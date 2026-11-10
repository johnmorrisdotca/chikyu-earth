// Riding along in a real browser: the camera is where the body is, it moves as the body does, and it keeps the same budget as everything else while it animates continuously:
// at most 30 frames a second, one a second for reduced motion, nothing out of sight or paused, a smooth switch that ends, everything freed afterwards.
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createSatellites, type ElementSet } from "../src/satellites/index.ts";
import { COUNT_SCRIPT, alive, counts, drainGpu, freezeClock, ownClock, settle, timed, untilStill } from "./gl.ts";
import { routeElements } from "./recorded.ts";

test.beforeEach(({ page }) => routeElements(page));

test.describe.configure({ mode: "serial" });

const SPACE = "chikyu-space";
const T = "2026-11-02T18:00Z";
interface Stats {
  state: string;
  draws: number;
  contexts: number;
  canvas: { pixels: number };
  time: number;
  satellites: { placed: number };
  ride: { riding: boolean; lost: boolean; gliding: boolean };
  camera: { position: [number, number, number]; fov: number };
}
const statsOf = (page: Page): Promise<Stats> => page.locator(SPACE).evaluate((el) => Reflect.get(el, "stats") as Stats);

async function open(page: Page, query = ""): Promise<void> {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/?look=space&time=${T}&speed=0&center=-100,40&sats=stations${query}`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => (await statsOf(page)).satellites.placed, { timeout: 20_000 }).toBeGreaterThan(5);
  // the controls' own Auto-turn (on for a reader with no motion preference) asks for its own animation frames; these tests are about the ride's
  await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { pause(): void }).pause());
  await settle(page);
}

// Pressed by dispatching the click, not by a real one: a real click scrolls the page to the button, and a globe scrolled out of sight is (rightly) not drawn.
// A ride starts the page's clock (Play), for the date box to move with it (e2e/date-play.demo.ts): these tests are about the ride and set the clock themselves, so Play is put back to Pause.
const rideButton = (page: Page, name: string) => ({
  click: async () => {
    await page.getByRole("group", { name: "Ride along" }).getByRole("button", { name, exact: true }).dispatchEvent("click");
    const play = page.locator('#replay [data-act="play"]');
    if ((await play.getAttribute("aria-pressed")) === "true") await play.dispatchEvent("click");
  },
});
const setSpeed = async (page: Page, speed: number): Promise<void> => {
  await page.locator(SPACE).evaluate((el, value) => Reflect.set(el, "speed", value), speed);
};

const snapshot = JSON.parse(readFileSync(new URL("../test/recorded/celestrak-snapshot-2026-11-02.json", import.meta.url), "utf8")) as { fields: string[]; groups: Record<string, (string | number)[][]> };
const stations = snapshot.groups["stations"]!.map((row) => Object.fromEntries(snapshot.fields.map((field, index) => [field, row[index]])) as unknown as ElementSet);
const group = createSatellites(stations);
const issIndex = group.sets.findIndex((set) => set.NORAD_CAT_ID === 25544);
/** The ISS where the camera should be at `ms`, from the same elements, run here. */
const issAt = (ms: number): [number, number, number] => {
  const out = new Float64Array(6);
  expect(group.exact(issIndex, ms, out)).toBe(true);
  return [out[0]!, out[1]!, out[2]!];
};
const angle = (a: number[], b: number[]): number => (Math.acos((a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!) / (Math.hypot(...(a as [number, number, number])) * Math.hypot(...(b as [number, number, number])))) * 180) / Math.PI;

/** On an owned clock: let `ms` of the page's time pass at once, as far as its timers and frames go (loads are the machine's, and are waited for with `untilStill`). */
async function passTime(page: Page, ms: number): Promise<void> {
  await freezeClock(page);
  await page.clock.runFor(ms);
  await page.clock.resume();
}

/** On an owned clock: let the glide to a ride's camera run its course (it takes about a second of the page's time, a little more for a far body), and check it ended. */
async function glided(page: Page): Promise<void> {
  await passTime(page, 2500);
  expect((await statsOf(page)).ride.gliding, "the glide has ended").toBe(false);
}

async function measure(page: Page, ms: number) {
  const { before, after, seconds } = await timed(page, ms, async () => ({ c: await counts(page), s: await statsOf(page) }));
  const [c0, c1, s0, s1] = [before.c, after.c, before.s, after.s];
  return { frames: (s1.draws - s0.draws) / seconds, glDraws: c1.draws - c0.draws, requests: c1.rafRequests - c0.rafRequests, gameSeconds: (s1.time - s0.time) / 1000 / seconds, s0, s1 };
}

test("riding the ISS puts the camera where the ISS is, 420 km up, and at 60x it goes round the Earth at the ISS's rate", async ({ page }) => {
  await open(page);
  await rideButton(page, "ISS").click();
  await expect.poll(async () => (await statsOf(page)).ride.gliding, { timeout: 5000 }).toBe(false);
  await settle(page, 600);
  const s = await statsOf(page);
  const ms = s.time;
  const there = issAt(ms);
  const camera = s.camera.position;
  expect(Math.hypot(camera[0] - there[0], camera[1] - there[1], camera[2] - there[2]) * 6371, "kilometres from the ISS").toBeLessThan(1);
  expect((Math.hypot(...camera) - 1) * 6371, "height").toBeGreaterThan(380);
  expect((Math.hypot(...camera) - 1) * 6371).toBeLessThan(470);
  expect(s.camera.fov).toBeCloseTo(60, 5);
  await expect(page.locator("#ride-info")).toContainText("Riding along with");

  await setSpeed(page, 60);
  const first = (await statsOf(page)).camera.position;
  const t0 = (await statsOf(page)).time;
  await page.waitForTimeout(5000);
  const last = await statsOf(page);
  const turned = angle(first, last.camera.position);
  const gameSeconds = (last.time - t0) / 1000;
  const expected = (gameSeconds / (group.info(issIndex, ms)!.periodMinutes * 60)) * 360;
  console.log(`ride the ISS at 60x: ${gameSeconds.toFixed(0)} game seconds, the camera went ${turned.toFixed(1)} degrees round (expected ${expected.toFixed(1)})`);
  expect(Math.abs(turned - expected)).toBeLessThan(2.5);
  const place = issAt(last.time);
  expect(Math.hypot(last.camera.position[0] - place[0], last.camera.position[1] - place[1], last.camera.position[2] - place[2]) * 6371, "still on the ISS").toBeLessThan(80);
});

test("riding the Moon puts the camera at the Moon: 10 Earth radii away in the compressed scale, 60 in the true one", async ({ page }) => {
  await open(page);
  await rideButton(page, "Moon").click();
  await expect.poll(async () => (await statsOf(page)).ride.gliding, { timeout: 5000 }).toBe(false);
  await settle(page, 500);
  expect(Math.hypot(...(await statsOf(page)).camera.position)).toBeCloseTo(10, 0);
  await page.getByRole("button", { name: "True scale" }).click();
  await settle(page, 800);
  const away = Math.hypot(...(await statsOf(page)).camera.position);
  expect(away).toBeGreaterThan(55);
  expect(away).toBeLessThan(66);
});

test.describe("moving", () => {
  test.use({ reducedMotion: "no-preference" });

  /** Long enough for 60 frames at the cap, and every frame is a lot of work for the software GPU: the longer a window, the longer the GPU is behind afterwards. */
  const WINDOW = 2500;

  test("it animates continuously but at most 30 frames a second: real time, a minute a second and 60x on the ISS, Mars at a day a second", async ({ page }) => {
    await ownClock(page);
    await open(page);
    await rideButton(page, "ISS").click();
    await glided(page);
    const results: string[] = [];
    for (const [speed, least, most] of [[1, 5, 30.5], [60, 5, 30.5]] as const) {
      await setSpeed(page, speed);
      await settle(page, 700);
      const m = await measure(page, WINDOW);
      results.push(`${speed}x: ${m.frames.toFixed(1)} frames a second`);
      expect(m.gameSeconds).toBeGreaterThan(speed * 0.8);
      expect(m.frames, `${speed}x`).toBeGreaterThanOrEqual(least);
      expect(m.frames, `${speed}x`).toBeLessThanOrEqual(most);
      expect(m.glDraws / Math.max(1, m.s1.draws - m.s0.draws), "GL draw calls a frame").toBeLessThanOrEqual(45);
    }
    await rideButton(page, "Mars").click();
    await glided(page);
    await setSpeed(page, 86_400);
    await settle(page, 700);
    const mars = await measure(page, WINDOW);
    results.push(`Mars at a day a second: ${mars.frames.toFixed(1)} frames a second`);
    expect(mars.frames).toBeLessThanOrEqual(30.5);
    console.log(`ride along: ${results.join("; ")}`);
    // the software GPU is far behind the frames this test asked for (33 s in CI): wait for it here, so the next test does not wait for it with its own clock running
    console.log(`ride along: the GPU took ${Math.round(await drainGpu(page))} ms to catch up`);
  });

  /**
   * The ride on the ISS, paused and at rest. The clock is the test's own, so the glide to the camera is run through at once instead of waited for, and each window below is a span of the page's
   * time that a busy machine cannot stretch. `untilStill` is the wait for the last frame already queued: what is read after it is rest, not that frame.
   */
  async function ridingAtRest(page: Page): Promise<void> {
    await ownClock(page);
    await open(page);
    await rideButton(page, "ISS").click();
    await glided(page);
    await untilStill(page);
  }

  /** At 60x the ride is drawing in sight: the proof that the nothing drawn in the two tests below is the page's doing, not a ride that never draws. */
  async function drawingAt60(page: Page): Promise<void> {
    await setSpeed(page, 60);
    const before = (await statsOf(page)).draws;
    await expect.poll(async () => (await statsOf(page)).draws, { message: "at 60x in sight the ride draws" }).toBeGreaterThan(before + 2);
  }

  test("paused it rests: nothing is drawn and no frame is asked for", async ({ page }) => {
    await ridingAtRest(page);
    const rest = await measure(page, 3000);
    expect(rest.glDraws, "paused: nothing drawn").toBe(0);
    expect(rest.requests, "paused: no frame asked for").toBe(0);
  });

  test("out of sight it draws nothing while the clock runs", async ({ page }) => {
    await ridingAtRest(page);
    await drawingAt60(page);
    await page.evaluate(() => {
      const spacer = document.createElement("div");
      spacer.style.height = "6000px";
      document.body.prepend(spacer);
      window.scrollTo(0, 0);
    });
    await untilStill(page);
    expect((await measure(page, 2500)).glDraws, "out of sight").toBe(0);
  });

  test("in a hidden tab it draws nothing while the clock runs", async ({ page }) => {
    await ridingAtRest(page);
    await drawingAt60(page);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await untilStill(page);
    expect((await measure(page, 2500)).glDraws, "hidden tab").toBe(0);
  });

  test("switching bodies glides, in about a second and a bit, and ends at rest", async ({ page }) => {
    // The glide is a function of the page's clock and ends on the first frame drawn after it, so the test owns the clock: how long a busy machine takes to draw a frame cannot change what is measured.
    await page.clock.install();
    await open(page);
    await freezeClock(page);
    const glideFor = (ms: number): Promise<void> => page.clock.runFor(ms);
    await rideButton(page, "ISS").click();
    await glideFor(1500);
    expect((await statsOf(page)).ride.gliding, "the first ride has glided").toBe(false);
    await glideFor(500);
    const from = (await statsOf(page)).camera.position;
    await rideButton(page, "Moon").click();
    expect((await statsOf(page)).ride.gliding).toBe(true);
    await glideFor(500);
    const during = (await statsOf(page)).camera.position;
    const moved = Math.hypot(during[0] - from[0], during[1] - from[1], during[2] - from[2]);
    expect(moved, "part of the way after half a second").toBeGreaterThan(0.2);
    expect(Math.hypot(...during), "not yet at the Moon").toBeLessThan(9.5);
    await glideFor(500);
    expect((await statsOf(page)).ride.gliding, "still gliding after a second").toBe(true);
    await glideFor(900);
    expect((await statsOf(page)).ride.gliding, "ended by 1.9 s").toBe(false);
    await page.clock.resume();
    await settle(page, 600);
    expect(Math.hypot(...(await statsOf(page)).camera.position)).toBeCloseTo(10, 0);
    // the pictures the ISS's view needed are let go four seconds after it (the texture tiers' own rule): those frames are not the ride's
    await settle(page, 6000);
    const rest = await measure(page, 2500);
    expect(rest.glDraws, "rests after the glide").toBe(0);
  });
});

test("a reader who asked for reduced motion gets a jump and one step a second", async ({ page }) => {
  await ownClock(page);
  await open(page);
  await rideButton(page, "ISS").click();
  expect((await statsOf(page)).ride.gliding, "no glide").toBe(false);
  await setSpeed(page, 60);
  await settle(page, 800);
  const m = await measure(page, 4000);
  console.log(`riding the ISS at 60x with reduced motion: ${m.frames.toFixed(2)} frames a second`);
  expect(m.frames).toBeLessThanOrEqual(1.6);
  expect(m.frames).toBeGreaterThan(0.5);
});

test("a satellite whose elements are too old for the date cannot be ridden: the ordinary camera shows, and the page is told", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    Reflect.set(window, "__lost", 0);
    document.querySelector("chikyu-space")!.addEventListener("chikyu-ride-lost", () => Reflect.set(window, "__lost", (Reflect.get(window, "__lost") as number) + 1));
  });
  await rideButton(page, "ISS").click();
  await expect.poll(async () => (await statsOf(page)).ride.gliding, { timeout: 5000 }).toBe(false);
  await page.locator(SPACE).evaluate((el) => Reflect.set(el, "time", Date.parse("2027-03-01T00:00:00Z")));
  await expect.poll(() => page.evaluate(() => Reflect.get(window, "__lost"))).toBeGreaterThanOrEqual(1);
  await expect(page.locator("#status")).toContainText("cannot be placed");
  expect((await statsOf(page)).ride.riding, "the ride was dropped").toBe(false);
  expect(Math.hypot(...(await statsOf(page)).camera.position)).toBeGreaterThan(2.5);
});

test("riding, stopping and riding again frees what it took, and a lost context comes back with the ride", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // The test's own clock: the glide of each switch and the four seconds after which a picture is let go are the page's time, run through at once (this test once spent 45 of its 60 seconds waiting for them), and
  // `untilStill` waits for what is not the clock's: the pictures arriving, and the last frame queued.
  await ownClock(page);
  await open(page);
  // a first round of every way to ride makes what is made once (the first time a planet is in the picture its sphere is put on the GPU); the second must give back what it took
  const ride = async (): Promise<void> => {
    for (const name of ["ISS", "Moon", "Mars", "ISS", "Stop", "ISS"]) {
      await rideButton(page, name).click();
      await glided(page);
    }
    await passTime(page, 6000);
    await untilStill(page);
  };
  const held = async (): Promise<number> => alive(await counts(page), "Buffer") + alive(await counts(page), "Texture") + alive(await counts(page), "VertexArray");
  await ride();
  const riding = await held();
  await ride();
  await ride();
  expect(await held(), "no more buffers, textures and vertex arrays after two more rounds of six switches").toBeLessThanOrEqual(riding);
  await passTime(page, 4500);
  await untilStill(page);
  const before = (await statsOf(page)).draws;
  await page.locator(SPACE).evaluate((el) => {
    const ext = (el.shadowRoot!.querySelector("canvas")!.getContext("webgl2") as WebGL2RenderingContext).getExtension("WEBGL_lose_context")!;
    Reflect.set(window, "__lose", ext);
    ext.loseContext();
  });
  await expect(page.locator(SPACE)).toHaveAttribute("data-state", "lost");
  await page.evaluate(() => (Reflect.get(window, "__lose") as { restoreContext(): void }).restoreContext());
  await expect(page.locator(SPACE)).toHaveAttribute("data-state", "live");
  await page.locator(SPACE).evaluate((el) => Reflect.set(el, "scale", "true"));
  await expect.poll(async () => (await statsOf(page)).draws).toBeGreaterThan(before);
  expect((await statsOf(page)).ride.riding).toBe(true);
  expect(errors).toEqual([]);
});

/** The mean of red, green and blue over a picture of the view, 0 to 255. */
const meanBrightness = async (page: Page): Promise<number> => {
  const png = (await page.locator(SPACE).screenshot()).toString("base64");
  return page.evaluate(async (data) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    const { data: px } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += px[i]! + px[i + 1]! + px[i + 2]!;
    return sum / (px.length / 4) / 3;
  }, png);
};

test("a ride on the night side is black with the true Sun and shows the surface with Always lit and Night boost", async ({ page }) => {
  await open(page, "&ride=iss");
  await expect.poll(async () => (await statsOf(page)).ride.riding, { timeout: 30_000 }).toBe(true);
  await expect.poll(async () => (await statsOf(page)).ride.gliding, { timeout: 10_000 }).toBe(false);
  // an orbit of the ISS spends a third of its 93 minutes in the Earth's shadow: look for a moment of it
  const start = Date.parse(T);
  let night: number | undefined;
  for (let step = 0; step < 8 && night === undefined; step += 1) {
    const ms = start + step * 12 * 60_000;
    await page.locator(SPACE).evaluate((el, value) => Reflect.set(el, "time", value), ms);
    await settle(page, 1200);
    if ((await meanBrightness(page)) < 12) night = ms;
  }
  expect(night, "a moment of the orbit when the ground under the ISS is dark").toBeDefined();
  const dark = await meanBrightness(page);
  const light = async (value: string): Promise<void> => {
    await page.locator(SPACE).evaluate((el, v) => Reflect.set(el, "light", v), value);
  };
  await light("lit");
  await expect.poll(() => meanBrightness(page), { timeout: 20_000, message: "Always lit: the surface under the camera is lit" }).toBeGreaterThan(dark + 15);
  console.log(`night ride: true Sun ${dark.toFixed(1)}, Always lit ${(await meanBrightness(page)).toFixed(1)}`);
  await light("boost");
  await expect.poll(() => meanBrightness(page), { timeout: 20_000, message: "Night boost: the land and coasts read" }).toBeGreaterThan(dark + 4);
  console.log(`night ride: Night boost ${(await meanBrightness(page)).toFixed(1)}`);
  await light("sun");
  await expect.poll(() => meanBrightness(page), { timeout: 20_000, message: "the true Sun again: dark" }).toBeLessThan(12);
  expect((await statsOf(page)).contexts).toBe(1);
});
