// The soak for the space view: turned, zoomed from the Earth to the solar system and back, re-timed, run at a day a second, scaled and toggled, with satellites (the stations,
// 2,000 Starlink and a group of 6,000 added and taken away) shown, chosen and run past their speed limit, for SOAK_MINUTES (10 by default); it must end where it began: the JS heap flat, no GPU object more than at the start, one WebGL context, the canvas in budget, draws within 30 a second.
import { expect, test, type Page } from "@playwright/test";
import { COUNT_SCRIPT, alive, counts, settle } from "./gl.ts";

const MINUTES = Number(process.env.SOAK_MINUTES ?? 10);
// A reader who asked for reduced motion gets one step a second; the soak is for everyone else, at the full 30 frames a second.
test.use({ reducedMotion: "no-preference" });
const SPACE = "chikyu-space";

interface SpaceStats {
  satellites: { groups: number };
  draws: number;
  contexts: number;
  canvas: { pixels: number };
  tiers: Record<string, number>;
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
  return { at: Math.round((Date.now() - t0) / 1000), heapMB: Math.round((heap / 1048576) * 100) / 100, textures: alive(c, "Texture"), buffers: alive(c, "Buffer"), programs: alive(c, "Program"), all: sum(c.created) - sum(c.deleted), draws: s.draws, canvasMP: s.canvas.pixels / 1e6 };
}

/** Back to the opening state: paused at the Earth, the larger pictures freed. */
async function rest(page: Page): Promise<void> {
  await page.locator(SPACE).evaluate((el) => {
    Reflect.set(el, "speed", 0);
    Reflect.set(el, "scale", "compressed");
    (el as unknown as { setSatellites(n: string, g: null): void; selectSatellite(r: null): void }).selectSatellite(null);
  });
  await removeMany(page);
  await rideButton(page, "Stop").click();
  // looking at the Earth, not at whichever body the walk left it on: a body in view keeps its shader, so the count at rest is only comparable with the same body in view
  await page.locator('[data-body="Earth"]').first().dispatchEvent("click");
  await page.locator("kazoku-view-controls").evaluate((el) => (Reflect.get(el, "controller") as { set(v: unknown, f: boolean, r: string): void }).set({ zoom: 1, yaw: 0, tilt: 0 }, true, "soak"));
  await expect.poll(async () => Object.values((await statsOf(page)).tiers).every((w) => w === 1024), { timeout: 15_000 }).toBe(true);
  // the moons and the sharper body pictures are let go four seconds after they leave the view
  await settle(page, 6000);
  // and what is let go stays let go: the count of shader programs has not moved for five seconds (a body that has just been let go would otherwise be counted as growth)
  let seen = -1;
  let since = Date.now();
  const giveUp = Date.now() + 40_000;
  while (Date.now() - since < 5000 && Date.now() < giveUp) {
    const now = alive(await counts(page), "Program");
    if (now !== seen) {
      seen = now;
      since = Date.now();
    }
    await page.waitForTimeout(500);
  }
}

test(`soak: ${MINUTES} minutes in the space view`, async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console error: ${m.text()}`);
  });
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto("/chikyu-earth/?look=space&time=2026-11-02T18:00Z&speed=0&center=10,20&sats=stations,starlink");
  await page.locator(`${SPACE}[data-state=live]`).waitFor();
  await expect.poll(async () => (await statsOf(page)).draws).toBeGreaterThan(0);
  await expect.poll(async () => (await statsOf(page)).satellites.groups, { timeout: 20_000 }).toBe(2);
  // the large group, once, so the satellites' own shaders and the chosen satellite's ring are made before the baseline
  await addMany(page);
  await page.locator(SPACE).evaluate((el) => (el as unknown as { selectSatellite(r: unknown): void }).selectSatellite({ group: "stations", index: 0 }));
  await settle(page, 1200);
  // and each way of riding along once, for the same reason
  for (const name of ["ISS", "Moon", "Mars", "Stop"]) {
    await rideButton(page, name).click();
    await settle(page, 1500);
  }
  await removeMany(page);
  // look at the planets once, so three's own empty texture is made before the baseline
  await page.getByRole("group", { name: "Go to" }).getByRole("button", { name: "Solar system", exact: true }).dispatchEvent("click");
  await settle(page, 1500);

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
      await rest(page);
      warm = await sample(page, t0);
      samples.push(warm);
      console.log(`warm  ${JSON.stringify(warm)}`);
    } else if (Date.now() >= nextSample) {
      const s = await sample(page, t0);
      samples.push(s);
      console.log(`t+${s.at}s ${JSON.stringify(s)}`);
      nextSample += MINUTES >= 5 ? 60_000 : 15_000;
    }
  }

  await rest(page);
  const last = await sample(page, t0);
  console.log(`final ${JSON.stringify(last)}`);
  const drawsPerSecond = (last.draws - warm!.draws) / (last.at - warm!.at);
  console.log(`space soak ${MINUTES} min: ${step} steps, heap ${warm!.heapMB} -> ${last.heapMB} MB, GPU objects ${warm!.all} -> ${last.all}, ${drawsPerSecond.toFixed(2)} frames a second after warm-up`);
  expect(last.heapMB - warm!.heapMB, "JS heap grew").toBeLessThanOrEqual(4);
  expect(last.textures, "textures").toBe(warm!.textures);
  expect(last.buffers, "buffers").toBe(warm!.buffers);
  expect(last.programs, "programs").toBe(warm!.programs);
  expect(last.all, "GPU objects").toBe(warm!.all);
  expect(Math.max(...samples.map((s) => s.canvasMP)), "canvas megapixels").toBeLessThanOrEqual(6);
  expect(drawsPerSecond, "frames a second").toBeLessThanOrEqual(30);
  expect((await statsOf(page)).contexts, "WebGL contexts made").toBe(1);
  expect(problems).toEqual([]);
});
