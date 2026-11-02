// The soak: the realistic Earth is turned, zoomed, re-timed and toggled for SOAK_MINUTES (10 by default) and must end where it began: the JS heap
// flat, no GPU object more than at the start, one WebGL context, the canvas in budget, draws within the 30 a second cap, no error.
// `pnpm test:soak` (CI runs it with SOAK_MINUTES=1).
import { expect, test, type Page } from "@playwright/test";
import { alive, counts, EARTH, openEarth, settle, statsOf } from "./gl.ts";

const MINUTES = Number(process.env.SOAK_MINUTES ?? 10);

interface Sample {
  at: number;
  heapMB: number;
  textures: number;
  buffers: number;
  programs: number;
  all: number;
  draws: number;
  raf: number;
  tierDay: number;
  canvasMP: number;
}

async function sample(page: Page, t0: number): Promise<Sample> {
  await page.evaluate(() => (globalThis as unknown as { gc(): void }).gc());
  const heap = await page.evaluate(() => (performance as unknown as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize);
  const c = await counts(page);
  const s = await statsOf(page);
  const sum = (k: Record<string, number>): number => Object.values(k).reduce((a, b) => a + b, 0);
  return {
    at: Math.round((Date.now() - t0) / 1000),
    heapMB: Math.round((heap / 1048576) * 100) / 100,
    textures: alive(c, "Texture"),
    buffers: alive(c, "Buffer"),
    programs: alive(c, "Program"),
    all: sum(c.created) - sum(c.deleted),
    draws: s.draws,
    raf: c.rafRequests,
    tierDay: s.tiers.day,
    canvasMP: s.canvas.pixels / 1e6,
  };
}

/** Back to the opening state: zoom 1, the larger pictures freed (they go 4 s after they are not needed, then a second's linger). */
async function rest(page: Page): Promise<void> {
  await page.locator(EARTH).evaluate((el) => (el as unknown as { setView(v: unknown, f: boolean): void }).setView({ yaw: 0, tilt: 0, zoom: 1, panX: 0, panY: 0 }, true));
  await expect.poll(async () => Object.values((await statsOf(page)).tiers).every((width) => width === 1024), { timeout: 15_000 }).toBe(true);
  await settle(page, 2500);
}

test(`soak: ${MINUTES} minutes of turning, zooming, re-timing and toggling`, async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console error: ${m.text()}`);
  });
  await openEarth(page, "time=now&center=10,20&places=2000");
  await page.locator(EARTH).evaluate((el) => el.setAttribute("live-seconds", "5"));

  const t0 = Date.now();
  const end = t0 + MINUTES * 60_000;
  const warmAt = t0 + Math.min(60_000, MINUTES * 15_000);
  let seed = 20261102;
  const random = (): number => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const zooms = [1, 1.5, 2, 3, 5, 7];
  const samples: Sample[] = [];
  let warm: Sample | undefined;
  let nextSample = t0 + Math.min(30_000, MINUTES * 5_000);
  let step = 0;

  while (Date.now() < end) {
    step += 1;
    const move = {
      yaw: (random() - 0.5) * 360,
      tilt: (random() - 0.5) * 120,
      zoom: zooms[Math.floor(random() * zooms.length)]!,
      panX: (random() - 0.5) * 60,
      panY: (random() - 0.5) * 60,
    };
    await page.locator(EARTH).evaluate(
      (el, [v, n]) => {
        const e = el as unknown as { setView(v: unknown, f: boolean): void; clouds: boolean; lights: boolean; time: unknown };
        e.setView(v, true);
        if (n % 9 === 0) e.clouds = !e.clouds;
        if (n % 11 === 0) e.lights = !e.lights;
        if (n % 17 === 0) e.time = n % 34 === 0 ? "now" : Date.UTC(2026, (n * 5) % 12, 1 + (n % 28), n % 24);
      },
      [move, step] as const,
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
  const seconds = (Date.now() - t0) / 1000;
  const drawsPerSecond = (last.draws - warm!.draws) / (last.at - warm!.at);
  console.log(`soak ${MINUTES} min: ${steps(step)} moves, heap ${warm!.heapMB} -> ${last.heapMB} MB, GPU objects ${warm!.all} -> ${last.all}, ${drawsPerSecond.toFixed(2)} draws a second after warm-up, ${seconds.toFixed(0)} s`);

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

const steps = (n: number): string => String(n);
