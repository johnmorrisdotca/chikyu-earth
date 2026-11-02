// Helpers for the realistic Earth's browser tests: open it, read it, take a pixel from it. Not a test file.
import { COUNT_SCRIPT, readCounts, type GlCounts } from "@johnmorrisdotca/kazoku-ui/testing";
import { expect, type Locator, type Page } from "@playwright/test";

export { COUNT_SCRIPT, readCounts };

export interface EarthStats {
  state: string;
  tiers: Record<"day" | "night" | "clouds" | "water", number>;
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
