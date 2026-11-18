// What the satellite tests share (e2e/satellites.gl.ts and e2e/satellites-moving.gl.ts): the page, the stats it reports, and the helpers that change and measure it.
import { expect, type Page } from "@playwright/test";
import { COUNT_SCRIPT, counts, settle, timed, untilArrived } from "./gl.ts";

export const SPACE = "chikyu-space";
export const T = "2026-11-02T18:00Z";
export interface Stats {
  state: string;
  draws: number;
  contexts: number;
  canvas: { width: number; height: number; pixels: number };
  time: number;
  satellites: { groups: number; placed: number; segments: number; tooFast: boolean; dotScale: number; longestStreakPx: number; streakCapPx: number; weight: number; fade: number; earthPx: number; epochMs: number; propagations: number; lastBatchMs: number; maxBatchMs: number; updateMs: number; maxUpdateMs: number; averageUpdateMs: number; updates: number };
}
export const statsOf = (page: Page): Promise<Stats> => page.locator(SPACE).evaluate((el) => Reflect.get(el, "stats") as Stats);

export async function open(page: Page, query = "", groups = "stations"): Promise<void> {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/?look=space&time=${T}&speed=0&center=-100,40&sats=${groups}${query}`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  const wanted = groups.split(",").filter(Boolean).length;
  await expect.poll(async () => (await statsOf(page)).satellites.groups, { timeout: 20_000 }).toBe(wanted);
  await expect.poll(async () => (await statsOf(page)).draws).toBeGreaterThan(0);
  await settle(page);
}

/** A group of this many satellites made from the real Starlink ones, spread round their orbits (test only), shown under the name "many". */
/** Adds the group and says how many draws the view had when it did, read in the same turn as the change. */
export const addMany = (page: Page, count = 6000): Promise<number> =>
  page.evaluate((n) => {
    const tools = Reflect.get(window, "chikyuSatellites") as { createSatellites(sets: unknown[], options?: unknown): unknown; groups: Map<string, { sets: Record<string, number | string>[] }> };
    const base = tools.groups.get("starlink")!.sets;
    const sets = Array.from({ length: n }, (_, i) => ({ ...base[i % base.length]!, NORAD_CAT_ID: 100_000 + i, MEAN_ANOMALY: ((base[i % base.length]!["MEAN_ANOMALY"] as number) + i * 0.37) % 360, RA_OF_ASC_NODE: ((base[i % base.length]!["RA_OF_ASC_NODE"] as number) + i * 0.11) % 360 }));
    const el = document.querySelector("chikyu-space") as unknown as { setSatellites(name: string, group: unknown, style?: unknown): void };
    const draws = (Reflect.get(el, "stats") as { draws: number }).draws;
    el.setSatellites("many", tools.createSatellites(sets), { size: 2, color: "#7fd4ff" });
    return draws;
  }, count);

/** Takes groups away and says how many draws the view had when it did, read in the same turn as the change. */
export const removeGroups = (page: Page, ...names: string[]): Promise<number> =>
  page.locator(SPACE).evaluate((el, groups) => {
    const draws = (Reflect.get(el, "stats") as { draws: number }).draws;
    for (const group of groups) (el as unknown as { setSatellites(n: string, g: null): void }).setSatellites(group, null);
    return draws;
  }, names);

/** The buffers of a group are made and freed by the draw that follows the change, not by the call: wait for that draw (`before` is the count of draws read with the change), then for the view to be still. */
export async function drawnSince(page: Page, before: number): Promise<void> {
  await expect.poll(async () => (await statsOf(page)).draws, { timeout: 30_000, message: "a draw after the change" }).toBeGreaterThan(before);
  await untilArrived(page);
}

export const setSpeed = async (page: Page, speed: number): Promise<void> => {
  await page.locator(SPACE).evaluate((el, value) => Reflect.set(el, "speed", value), speed);
};

/** What a stretch of time cost: frames drawn, GL draw calls, animation frames asked for, SGP4 calls, JS time in the satellites. */
export async function measure(page: Page, ms: number) {
  const { before, after, seconds } = await timed(page, ms, async () => ({ c: await counts(page), s: await statsOf(page) }));
  const [c0, c1, s0, s1] = [before.c, after.c, before.s, after.s];
  return {
    seconds,
    frames: (s1.draws - s0.draws) / seconds,
    glDraws: c1.draws - c0.draws,
    glPerFrame: (c1.draws - c0.draws) / Math.max(1, s1.draws - s0.draws),
    requests: c1.rafRequests - c0.rafRequests,
    propagations: (s1.satellites.propagations - s0.satellites.propagations) / seconds,
    updates: s1.satellites.updates - s0.satellites.updates,
    averageUpdateMs: s1.satellites.averageUpdateMs,
    maxBatchMs: s1.satellites.maxBatchMs,
    gameSeconds: (s1.time - s0.time) / 1000 / seconds,
    stats: s1,
  };
}
