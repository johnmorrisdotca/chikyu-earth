// Helpers for the realistic Earth's browser tests: open it, read it, take a pixel from it. Not a test file.
import { COUNT_SCRIPT, readCounts, type GlCounts } from "@johnmorrisdotca/kazoku-ui/testing";
import { expect, type Locator, type Page } from "@playwright/test";

export { COUNT_SCRIPT, readCounts };

export interface EarthStats {
  state: string;
  tiers: Record<"day" | "night" | "clouds" | "water", number>;
  tiles: { ready: boolean; level: number | null; held: number; shown: number; loading: number; failed: number; requested: number; heldBytes: number; refused: number; used: Record<string, number> };
  draws: number;
  contexts: number;
  canvas: { width: number; height: number; pixels: number };
  assets: { entries: number; refs: number };
}

export const EARTH = "chikyu-earth-realistic";
/** A fixed moment, so nothing in the picture changes on its own: June solstice, noon UTC. */
export const NOON = "2026-06-21T12:00Z";

export const statsOf = (page: Page): Promise<EarthStats> => page.locator(EARTH).evaluate((el) => Reflect.get(el, "stats") as EarthStats);

/** Open the demo on the realistic look at a fixed time, count GL calls from the first script, and wait for the first draw. */
export async function openEarth(page: Page, query = `time=${NOON}&center=10,20`): Promise<void> {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/?look=realistic&${query}`);
  await page.locator(`${EARTH}[data-state=live]`).waitFor();
  await expect.poll(async () => (await statsOf(page)).draws).toBeGreaterThan(0);
  await settle(page);
}

/** Let loads, a downgrade timer and the draw gate pass: nothing is moving after this. */
export async function settle(page: Page, ms = 700): Promise<void> {
  await page.waitForTimeout(ms);
}

const owned = new WeakSet<Page>();

/**
 * Own the page's clock: install it before the page opens. It then runs as usual until `freezeClock` or `timed` stops it, and `page.clock.runFor(ms)` moves it by exactly `ms`, so a rate counted
 * in that time cannot be changed by how slowly a busy machine draws.
 */
export async function ownClock(page: Page): Promise<void> {
  await page.clock.install();
  owned.add(page);
}

/**
 * How far past the page's own time `freezeClock` pauses. Reading the page's time and asking for the pause are two calls, and the page's clock keeps running between them: on a loaded machine (software GL,
 * several browsers) that takes well over the 50 ms this once allowed, which put the pause point in the past and `pauseAt` threw "Cannot fast-forward to the past". This is far longer than any call takes.
 */
const FREEZE_AHEAD_MS = 3000;

/**
 * Stop an owned clock where it is (a moment ahead of the page's time, `FREEZE_AHEAD_MS`, chosen from the page's own clock); time then moves only by `page.clock.runFor`, until `page.clock.resume()`. */
export async function freezeClock(page: Page): Promise<void> {
  // Reading the page's time and asking for the pause are two calls, and a running clock moves between them: on a machine busy enough (the CI image, software drawing) more than the margin
  // has gone by, and `pauseAt` is asked for a time already behind it (MODULES-1178). That answer is about this race, not the page: read the time again and ask with a wider margin.
  for (const ahead of [FREEZE_AHEAD_MS, FREEZE_AHEAD_MS * 4, FREEZE_AHEAD_MS * 16]) {
    const now = await page.evaluate(() => Date.now());
    try {
      await page.clock.pauseAt(new Date(now + ahead));
      return;
    } catch (error) {
      if (!String(error).includes("Cannot fast-forward to the past")) throw error;
    }
  }
  throw new Error(`freezeClock: the page's clock kept running past ${FREEZE_AHEAD_MS * 16} ms ahead of each reading`);
}

/**
 * Read something, let `ms` pass, read it again. On an owned clock the span is exactly `ms` of the page's time (the clock is stopped for both reads, then runs on); otherwise it is `ms` of this
 * machine's time, as a stopwatch sees it. `seconds` is the span.
 */
export async function timed<T>(page: Page, ms: number, read: () => Promise<T>): Promise<{ before: T; after: T; seconds: number }> {
  if (owned.has(page)) {
    await freezeClock(page);
    const before = await read();
    await page.clock.runFor(ms);
    const after = await read();
    // On an owned clock the page's animation frames come from the clock, not the screen: `runFor` fires a span's frames all at once, so nothing holds the page to what the software GPU can draw,
    // and the GPU is left behind (21.9 s at the end of the 6,000-satellite test at 60x here, 22 to 37 s after the ride test in CI). Wait for it here, with the clock still stopped, so the test that
    // asked for the frames pays for them, not the next page to open, which waited past its 60 s for them in CI.
    const asked = Date.now();
    await drainGpu(page);
    if (Date.now() - asked > 1000) console.log(`timed: the GPU took ${Date.now() - asked} ms to draw the frames of a ${ms} ms span`);
    await page.clock.resume();
    return { before, after, seconds: ms / 1000 };
  }
  const before = await read();
  const t0 = Date.now();
  await page.waitForTimeout(ms);
  const after = await read();
  return { before, after, seconds: (Date.now() - t0) / 1000 };
}

/**
 * Wait until nothing is drawn or asked for any more: the draw and frame-request counts are the same one second apart. Holding a clock (or stopping the controls' turn) leaves one last frame
 * already queued, and that frame is drawn, rightly; on a loaded machine (software GL) it can land more than a second later. A test of "nothing is drawn while held" takes its first reading
 * after this, so it measures rest, not that last frame. If frames keep coming, this fails after `timeout` ms: that is the bug it is there to find.
 */
export async function untilStill(page: Page, timeout = 20_000): Promise<void> {
  const end = Date.now() + timeout;
  let before = await readCounts(page);
  for (;;) {
    await page.waitForTimeout(1000);
    const now = await readCounts(page);
    if (now.draws === before.draws && now.rafRequests === before.rafRequests) return;
    if (Date.now() > end) throw new Error(`still drawing ${timeout} ms after it was held: ${now.draws - before.draws} draws and ${now.rafRequests - before.rafRequests} frames asked for in the last second`);
    before = now;
  }
}

/**
 * Wait until the graphics processor has finished everything the page asked it to draw, and say how long that took (ms). Software drawing (SwiftShader) is slower than the 30 frames a second the element asks for, so a test that draws
 * for a while ends with the GPU behind the page, and the browser then makes the next test wait for it while that test's clock is running: after the ride's frame-rate test the GPU was 33 s behind in CI, which came out of the
 * next test's 60 s (MODULES-805). A test that draws continuously ends with this, so it pays for its own drawing. The read of one pixel is the synchronous call that waits for all the commands before it.
 */
export async function drainGpu(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvases: HTMLCanvasElement[] = [];
    const walk = (root: Document | ShadowRoot): void => {
      canvases.push(...root.querySelectorAll("canvas"));
      for (const el of root.querySelectorAll("*")) if (el.shadowRoot) walk(el.shadowRoot);
    };
    walk(document);
    const t = performance.now();
    for (const canvas of canvases) {
      const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as WebGL2RenderingContext | null;
      gl?.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    }
    return performance.now() - t;
  });
}

export async function counts(page: Page): Promise<GlCounts> {
  return readCounts(page);
}

/** Alive GPU objects of one kind: made minus deleted. */
export const alive = (c: GlCounts, kind: keyof GlCounts["created"]): number => c.created[kind] - c.deleted[kind];

/** The colour of one point of an element as the screen shows it, `fx` and `fy` from 0 to 1 across it. */
export async function pixelAt(page: Page, target: Locator, fx: number, fy: number): Promise<[number, number, number, number]> {
  const png = (await target.screenshot()).toString("base64");
  return page.evaluate(
    async ([data, x, y]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      return Array.from(ctx.getImageData(Math.round((img.width - 1) * (x as number)), Math.round((img.height - 1) * (y as number)), 1, 1).data) as [number, number, number, number];
    },
    [png, fx, fy] as const,
  );
}
