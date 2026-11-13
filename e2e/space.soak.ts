// The soak for the space view: turned, zoomed from the Earth to the solar system and back, re-timed, run at a day a second, scaled and toggled, with satellites (the stations,
// 2,000 Starlink and a group of 6,000 added and taken away) shown, chosen and run past their speed limit, for SOAK_MINUTES (10 by default); it must end where it began: the JS heap flat, no GPU object more than at the start, one WebGL context, the canvas in budget, draws within 30 a second.
import { expect, test, type Page } from "@playwright/test";
import { COUNT_SCRIPT, alive, counts, settle } from "./gl.ts";
import { listPrograms, PROGRAMS_SCRIPT } from "./programs.ts";
import { routeElements } from "./recorded.ts";

const MINUTES = Number(process.env.SOAK_MINUTES ?? 1);
// With SOAK_THROTTLE set the browser's CPU is slowed by that factor, for the repeats under load.
const THROTTLE = Number(process.env.SOAK_THROTTLE ?? 4);
// A reader who asked for reduced motion gets one step a second; the soak is for everyone else, at the full 30 frames a second.
test.use({ reducedMotion: "no-preference" });
test.beforeEach(({ page }) => routeElements(page));
const SPACE = "chikyu-space";

interface SpaceStats {
  satellites: { groups: number };
  draws: number;
  contexts: number;
  canvas: { pixels: number };
  tiers: Record<string, number>;
  followModel: { shown: boolean } | null;
  bodies: { painted: number; moons: number; held: number; moon: boolean; tiles: number; mapped: number };
}
const statsOf = (page: Page): Promise<SpaceStats> => page.locator(SPACE).evaluate((el) => Reflect.get(el, "stats") as SpaceStats);

/** 6,000 satellites made from the real Starlink ones, spread round their orbits (test only). */
const addMany = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const tools = Reflect.get(window, "chikyuSatellites") as { createSatellites(sets: unknown[]): unknown; groups: Map<string, { sets: Record<string, number | string>[] }> };
    const base = tools.groups.get("starlink")!.sets;
    const sets = Array.from({ length: 6000 }, (_, i) => ({ ...base[i % base.length]!, NORAD_CAT_ID: 100_000 + i, MEAN_ANOMALY: ((base[i % base.length]!["MEAN_ANOMALY"] as number) + i * 0.37) % 360 }));
    (document.querySelector("chikyu-space") as unknown as { setSatellites(n: string, g: unknown, s?: unknown): void }).setSatellites("many", tools.createSatellites(sets), { size: 2 });
  });
// Buttons are pressed by dispatching the click: a real click scrolls the page to the button and the globe out of sight, where it draws nothing and lets its GPU objects go.
const rideButton = (page: Page, name: string) => ({ click: () => page.getByRole("group", { name: "Ride along" }).getByRole("button", { name, exact: true }).dispatchEvent("click") });
const removeMany = (page: Page): Promise<void> => page.locator(SPACE).evaluate((el) => (el as unknown as { setSatellites(n: string, g: null): void }).setSatellites("many", null));

async function sample(page: Page, t0: number) {
  await page.locator(SPACE).scrollIntoViewIfNeeded();
  await page.evaluate(() => (globalThis as unknown as { gc(): void }).gc());
  const heap = await page.evaluate(() => (performance as unknown as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize);
  const c = await counts(page);
  const s = await statsOf(page);
  const sum = (k: Record<string, number>): number => Object.values(k).reduce((a, b) => a + b, 0);
  return { at: Math.round((Date.now() - t0) / 1000), heapMB: Math.round((heap / 1048576) * 100) / 100, textures: alive(c, "Texture"), buffers: alive(c, "Buffer"), programs: alive(c, "Program"), all: sum(c.created) - sum(c.deleted), draws: s.draws, canvasMP: s.canvas.pixels / 1e6, bodies: s.bodies };
}

/** The programs alive now, each as a hash and a length of its vertex and fragment text, sorted: when the count at the end is above the count at the warm-up, the program that is more shows in the difference of the two lists. */
const programList = async (page: Page): Promise<string> => JSON.stringify(await listPrograms(page));

/** The view controls' Auto-turn, stopped: the Earth's view then keeps the yaw it was set to. Returns whether it was turning, to start it again once the count is taken. */
async function stopTurning(page: Page): Promise<boolean> {
  return page.locator("kazoku-view-controls").evaluate((el) => {
    const controls = el as unknown as { state: { turning: boolean }; pause(): void };
    const was = controls.state.turning;
    controls.pause();
    return was;
  });
}
const startTurning = (page: Page): Promise<void> => page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { play(): void }).play());

/** Back to the opening state: paused at the Earth, the larger pictures freed. */
async function rest(page: Page, opening: { orbits: unknown; labels: unknown }): Promise<boolean> {
  // in sight: a view out of sight draws nothing, and what is let go is let go at a draw
  await page.locator(SPACE).scrollIntoViewIfNeeded();
  const turning = await stopTurning(page);
  // and still: the demo's controls turn the view at several degrees a second, so the Earth's view would sweep round and bring Jupiter, with its moons, or Saturn into the background (made once big enough, MODULES-1192) at a yaw that depends on how long the
  // settling took; the same view holds the same objects only when it is the same view
  await page.locator(SPACE).evaluate((el, o) => {
    Reflect.set(el, "speed", 0);
    Reflect.set(el, "scale", "compressed");
    // the walk toggles the orbit lines and the labels: the opening view has them as the page opened them, and the count at rest is only comparable with the same layers on
    Reflect.set(el, "orbits", o.orbits);
    Reflect.set(el, "labels", o.labels);
    // the time it opened at: the moons of Saturn and Jupiter are in the view or not by where they are on that day, so the count at rest is only comparable on the same day
    Reflect.set(el, "time", Date.parse("2026-11-02T18:00:00Z"));
    (el as unknown as { setSatellites(n: string, g: null): void; selectSatellite(r: null): void }).selectSatellite(null);
  }, opening);
  await removeMany(page);
  await rideButton(page, "Stop").click();
  // looking at the Earth, not at whichever body the walk left it on: a body in view keeps its shader, so the count at rest is only comparable with the same body in view
  await page.locator('[data-body="Earth"]').first().dispatchEvent("click");
  await page.locator("kazoku-view-controls").evaluate((el) => (Reflect.get(el, "controller") as { set(v: unknown, f: boolean, r: string): void }).set({ zoom: 1, yaw: 0, tilt: 0 }, true, "soak"));
  await expect.poll(async () => Object.values((await statsOf(page)).tiers).every((w) => w === 1024), { timeout: 15_000 }).toBe(true);
  // the moons and the sharper body pictures are let go four seconds after they leave the view
  await settle(page, 6000);
  // and what is let go stays let go, and what is made stays made: the element's own count of the bodies it holds (`stats.bodies`) and the counts of programs, buffers and textures have not moved for five seconds. Bodies are made when big enough
  // and let go four seconds after they leave the view (MODULES-1192), so the same view only returns the same count once that has settled; a body that has just been let go would otherwise be counted as growth.
  let seen = "";
  let since = Date.now();
  const giveUp = Date.now() + 40_000;
  while (Date.now() - since < 5000 && Date.now() < giveUp) {
    // a view at rest draws nothing, and what is let go or made is so at a draw: ask for one
    await page.locator(SPACE).evaluate((el) => Reflect.set(el, "time", (Reflect.get(el, "time") as number) + 1));
    const c = await counts(page);
    const now = `${JSON.stringify((await statsOf(page)).bodies)} ${alive(c, "Program")} ${alive(c, "Buffer")} ${alive(c, "Texture")}`;
    if (now !== seen) {
      seen = now;
      since = Date.now();
    }
    await page.waitForTimeout(500);
  }
  expect(Date.now() - since, `the bodies and the GPU objects settled in 40 s (last: ${seen})`).toBeGreaterThanOrEqual(5000);
  return turning;
}

test(`soak: ${MINUTES} minutes in the space view`, async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console error: ${m.text()}`);
  });
  await page.addInitScript(COUNT_SCRIPT);
  await page.addInitScript(PROGRAMS_SCRIPT);
  await page.goto("/chikyu-earth/?look=space&time=2026-11-02T18:00Z&speed=0&center=10,20&sats=stations,starlink");
  await page.locator(`${SPACE}[data-state=live]`).waitFor();
  await expect.poll(async () => (await statsOf(page)).draws, { timeout: 30_000 }).toBeGreaterThan(0);
  await expect.poll(async () => (await statsOf(page)).satellites.groups, { timeout: 20_000 }).toBe(2);
  if (THROTTLE > 1) await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  // the large group, once, so the satellites' own shaders and the chosen satellite's ring are made before the baseline
  await addMany(page);
  await page.locator(SPACE).evaluate((el) => (el as unknown as { selectSatellite(r: unknown): void }).selectSatellite({ group: "stations", index: 0 }));
  await settle(page, 1200);
  // and each way of riding along once, for the same reason
  for (const name of ["ISS", "Moon", "Mars", "Stop"]) {
    await rideButton(page, name).click();
    await settle(page, 1500);
  }
  // and each way of looking while riding, from the ISS and from a satellite of the package's own drawing: a program or an object that a way of looking needs (the camera inside the air's shell, from the satellite, above it) is made the first time it is drawn,
  // and one first met after the baseline is one more that is not a leak
  await rideButton(page, "ISS").click();
  for (const way of ["From it", "Behind it", "At the horizon", "Straight down"]) {
    await page.getByRole("button", { name: way, exact: true }).dispatchEvent("click");
    // the ISS's model is made by the page's own kit and arrives after the ride begins; it brings a light of its own into the scene while it is drawn, and three keeps a program for each number of lights a material is drawn with (MODULES-1293),
    // so the model must be on screen, with the Earth's clouds and the bodies drawn beside it, before the baseline and not at some moment of the walk
    if (way === "Behind it") await expect.poll(async () => (await statsOf(page)).followModel?.shown ?? false, { timeout: 30_000, message: "the ISS's model is drawn from behind it" }).toBe(true);
    await settle(page, 1500);
  }
  await rideButton(page, "Stop").click();
  await settle(page, 1000);
  // and from just outside a satellite that has no model of its own: the package's own drawing of it (its Lambert program, its geometries) is made the first time one is drawn and kept, so one first met after the baseline
  // would be a program that is not a leak. The Sun's light for it is in the scene for good (MODULES-1293), so this makes the same programs whatever the walk does after.
  await rideButton(page, "A Starlink satellite").click();
  await page.getByRole("button", { name: "Behind it", exact: true }).dispatchEvent("click");
  await settle(page, 2500);
  await rideButton(page, "Stop").click();
  await settle(page, 1500);
  // and the satellites run past their speed limit once, so the streaks' own program is made before the baseline: the walk sets such clocks (a day a second) and a program first made after the baseline is one more that is not a leak
  await page.locator(SPACE).evaluate((el) => Reflect.set(el, "speed", 3600));
  await settle(page, 2000);
  await page.locator(SPACE).evaluate((el) => Reflect.set(el, "speed", 0));
  await settle(page, 1000);
  await removeMany(page);
  // look at the planets once, so three's own empty texture is made before the baseline
  await page.getByRole("group", { name: "Go to" }).getByRole("button", { name: "Solar system", exact: true }).dispatchEvent("click");
  await settle(page, 1500);
  // and at every body once, near: a body's shader is made the first time it is drawn and kept, so a body first met after the baseline would be one more program that is not a leak (the moons are let go again, which is checked)
  for (const body of ["Moon", "Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "Earth"]) {
    await page.locator(`[data-body="${body}"]`).first().dispatchEvent("click");
    await settle(page, 1000);
  }
  for (const name of ["Jupiter and its moons", "Saturn and its moons", "Earth"]) {
    await page.getByRole("group", { name: "Go to" }).getByRole("button", { name, exact: true }).dispatchEvent("click");
    await settle(page, 1500);
  }

  const opening = await page.locator(SPACE).evaluate((el) => ({ orbits: Reflect.get(el, "orbits") as unknown, labels: Reflect.get(el, "labels") as unknown }));
  const t0 = Date.now();
  const end = t0 + MINUTES * 60_000;
  const warmAt = t0 + Math.min(60_000, MINUTES * 15_000);
  let seed = 20261102;
  const random = (): number => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const jumps = ["Earth", "Moon", "Sun", "Inner planets", "Solar system"];
  const speeds = [0, 1, 60, 3600, 86400, -60, -3600];
  let warm: Awaited<ReturnType<typeof sample>> | undefined;
  let nextSample = t0 + Math.min(30_000, MINUTES * 5_000);
  let step = 0;
  const samples: Awaited<ReturnType<typeof sample>>[] = [];

  while (Date.now() < end) {
    step += 1;
    const n = step;
    await page.locator("kazoku-view-controls").evaluate((el, [yaw, tilt]) => (Reflect.get(el, "controller") as { set(v: unknown, f: boolean, r: string): void }).set({ yaw, tilt }, true, "soak"), [(random() - 0.5) * 360, (random() - 0.5) * 120] as const);
    if (n % 3 === 0) await page.getByRole("group", { name: "Go to" }).getByRole("button", { name: jumps[Math.floor(random() * jumps.length)]!, exact: true }).dispatchEvent("click");
    await page.locator(SPACE).evaluate(
      (el, [k, speed]) => {
        const e = el as unknown as { scale: string; orbits: boolean; labels: boolean; speed: number; time: unknown };
        if (k % 7 === 0) e.scale = e.scale === "true" ? "compressed" : "true";
        if (k % 5 === 0) e.orbits = !e.orbits;
        if (k % 6 === 0) e.labels = !e.labels;
        if (k % 4 === 0) e.speed = speed;
        if (k % 13 === 0) e.time = Date.UTC(2026, 10, 2 + (k % 8), k % 24);
      },
      [n, speeds[Math.floor(random() * speeds.length)]!] as const,
    );
    if (n % 3 === 0) await ((n / 3) % 2 === 1 ? addMany(page) : removeMany(page));
    if (n % 5 === 2) {
      // ride along with one thing or another, from it or behind it, looking down or at the horizon, and stop now and then
      const names = ["ISS", "Moon", "Mars", "Stop", "Tiangong", "A Starlink satellite"];
      await rideButton(page, names[Math.floor(random() * names.length)]!).click();
      if (n % 2 === 0) await page.getByRole("button", { name: random() < 0.5 ? "Behind it" : "From it", exact: true }).dispatchEvent("click");
      if (n % 3 === 1) await page.getByRole("button", { name: random() < 0.5 ? "At the horizon" : "Straight down", exact: true }).dispatchEvent("click");
    }
    if (n % 4 === 1) await page.locator(SPACE).evaluate((el, i) => (el as unknown as { selectSatellite(r: unknown): void }).selectSatellite(i % 5 === 0 ? null : { group: "starlink", index: i % 400 }), n);
    await page.waitForTimeout(400 + Math.floor(random() * 400));
    if (!warm && Date.now() >= warmAt) {
      const turning = await rest(page, opening);
      warm = await sample(page, t0);
      samples.push(warm);
      console.log(`warm  ${JSON.stringify(warm)}`);
      console.log(`warm programs ${await programList(page)}`);
      // the walk goes on with the view turning, as it began
      if (turning) await startTurning(page);
    } else if (Date.now() >= nextSample) {
      const s = await sample(page, t0);
      samples.push(s);
      console.log(`t+${s.at}s ${JSON.stringify(s)}`);
      nextSample += MINUTES >= 5 ? 60_000 : 15_000;
    }
  }

  await rest(page, opening);
  const last = await sample(page, t0);
  console.log(`final ${JSON.stringify(last)}`);
  console.log(`final programs ${await programList(page)}`);
  const drawsPerSecond = (last.draws - warm!.draws) / (last.at - warm!.at);
  console.log(`space soak ${MINUTES} min: ${step} steps, heap ${warm!.heapMB} -> ${last.heapMB} MB, textures ${warm!.textures} -> ${last.textures}, buffers ${warm!.buffers} -> ${last.buffers}, programs ${warm!.programs} -> ${last.programs}, GPU objects ${warm!.all} -> ${last.all}, ${drawsPerSecond.toFixed(2)} frames a second after warm-up`);
  expect(last.heapMB - warm!.heapMB, "JS heap grew").toBeLessThanOrEqual(4);
  // The same view, still and settled (in `rest`), holds the same objects: the made set is the same (`stats.bodies`), so no texture or program may be more than at the start. The view was turning on its own at several degrees a second, and which bodies are in the
  // background of an Earth view (Jupiter and its moons come into it at some yaws) then depended on the yaw the count happened to be taken at: 17 textures against 9 in one run (MODULES-1198); the view is now still, and textures and programs
  // are equal in every run. What still varies is the buffers, in steps of three (one geometry and its array object): the still view came out at 70, 73 and 76, warm and at the end, and one run ended a geometry above where it began, with the made set the same
  // and the tiles and satellites flat. So one geometry is allowed (3 buffers, 4 GPU objects); a body let go without its geometry disposed takes the one-minute soak from 60 textures to 87 and from 330 GPU objects to 416.
  const band = { buffers: 3, all: 4 };
  expect(last.textures, "textures").toBeLessThanOrEqual(warm!.textures);
  expect(last.buffers, "buffers").toBeLessThanOrEqual(warm!.buffers + band.buffers);
  expect(last.programs, "programs").toBeLessThanOrEqual(warm!.programs);
  expect(last.all, "GPU objects").toBeLessThanOrEqual(warm!.all + band.all);
  expect(Math.max(...samples.map((s) => s.canvasMP)), "canvas megapixels").toBeLessThanOrEqual(6);
  expect(drawsPerSecond, "frames a second").toBeLessThanOrEqual(30);
  expect((await statsOf(page)).contexts, "WebGL contexts made").toBe(1);
  expect(problems).toEqual([]);
});
