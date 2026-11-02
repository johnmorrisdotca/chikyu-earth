// The soak for the space view: turned, zoomed from the Earth to the solar system and back, re-timed, run at a day a second, scaled and toggled for SOAK_MINUTES (10 by
// default); it must end where it began: the JS heap flat, no GPU object more than at the start, one WebGL context, the canvas in budget, draws within 30 a second.
import { expect, test, type Page } from "@playwright/test";
import { COUNT_SCRIPT, alive, counts, settle } from "./gl.ts";

const MINUTES = Number(process.env.SOAK_MINUTES ?? 10);
const SPACE = "chikyu-space";

interface SpaceStats {
  draws: number;
  contexts: number;
  canvas: { pixels: number };
  tiers: Record<string, number>;
}
const statsOf = (page: Page): Promise<SpaceStats> => page.locator(SPACE).evaluate((el) => Reflect.get(el, "stats") as SpaceStats);

async function sample(page: Page, t0: number) {
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
  });
  await page.locator("kazoku-view-controls").evaluate((el) => (Reflect.get(el, "controller") as { set(v: unknown, f: boolean, r: string): void }).set({ zoom: 1, yaw: 0, tilt: 0 }, true, "soak"));
  await expect.poll(async () => Object.values((await statsOf(page)).tiers).every((w) => w === 1024), { timeout: 15_000 }).toBe(true);
  await settle(page, 2500);
}

test(`soak: ${MINUTES} minutes in the space view`, async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console error: ${m.text()}`);
  });
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto("/chikyu-earth/?look=space&time=now&center=10,20");
  await page.locator(`${SPACE}[data-state=live]`).waitFor();
  await expect.poll(async () => (await statsOf(page)).draws).toBeGreaterThan(0);
  // look at the planets once, so three's own empty texture is made before the baseline
  await page.getByRole("group", { name: "Go to" }).getByRole("button", { name: "Solar system", exact: true }).click();
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
  const speeds = [0, 1, 3600, 86400, -3600];
  let warm: Awaited<ReturnType<typeof sample>> | undefined;
  let nextSample = t0 + Math.min(30_000, MINUTES * 5_000);
  let step = 0;
  const samples: Awaited<ReturnType<typeof sample>>[] = [];

  while (Date.now() < end) {
    step += 1;
    const n = step;
    await page.locator("kazoku-view-controls").evaluate((el, [yaw, tilt]) => (Reflect.get(el, "controller") as { set(v: unknown, f: boolean, r: string): void }).set({ yaw, tilt }, true, "soak"), [(random() - 0.5) * 360, (random() - 0.5) * 120] as const);
    if (n % 3 === 0) await page.getByRole("group", { name: "Go to" }).getByRole("button", { name: jumps[Math.floor(random() * jumps.length)]!, exact: true }).click();
    await page.locator(SPACE).evaluate(
      (el, [k, speed]) => {
        const e = el as unknown as { scale: string; orbits: boolean; labels: boolean; speed: number; time: unknown };
        if (k % 7 === 0) e.scale = e.scale === "true" ? "compressed" : "true";
        if (k % 5 === 0) e.orbits = !e.orbits;
        if (k % 6 === 0) e.labels = !e.labels;
        if (k % 4 === 0) e.speed = speed;
        if (k % 13 === 0) e.time = Date.UTC(2026, (k * 5) % 12, 1 + (k % 28), k % 24);
      },
      [n, speeds[Math.floor(random() * speeds.length)]!] as const,
    );
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
