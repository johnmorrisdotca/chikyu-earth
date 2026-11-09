// Helpers for the realistic Earth's browser tests: open it, read it, take a pixel from it. Not a test file.
import { COUNT_SCRIPT, readCounts, type GlCounts } from "@johnmorrisdotca/kazoku-ui/testing";
import { expect, type Locator, type Page } from "@playwright/test";

export { COUNT_SCRIPT, readCounts };

export interface EarthStats {
  state: string;
  tiers: Record<"day" | "night" | "clouds" | "water", number>;
  tiles: { ready: boolean; level: number | null; held: number; shown: number; loading: number; failed: number; requested: number };
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

/** Stop an owned clock where it is; time then moves only by `page.clock.runFor`, until `page.clock.resume()`. */
export async function freezeClock(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(new Date(now + 50));
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
    await page.clock.resume();
    return { before, after, seconds: ms / 1000 };
  }
  const before = await read();
  const t0 = Date.now();
  await page.waitForTimeout(ms);
  const after = await read();
  return { before, after, seconds: (Date.now() - t0) / 1000 };
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
