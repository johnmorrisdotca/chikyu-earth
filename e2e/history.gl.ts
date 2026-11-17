// A satellite's history and the Observe view (MODULES-1118), in a real browser: `setSatelliteHistory` places the ISS from its element set, not before its launch, shaded as a prediction after the newest set; `observe` rides outside it
// with a trail of its last N orbits drawn as one line, rebuilt only when the clock moves; nothing is drawn at rest, and nothing once the view is off. The clock is the test's own (`speed=0`, the view's controls paused).
// With HISTORY_THROTTLE set the browser's CPU is slowed by that factor, for the repeats under load.
import { expect, test, type Page } from "@playwright/test";
import { COUNT_SCRIPT, untilStill } from "./gl.ts";
import { routeElements } from "./recorded.ts";

test.beforeEach(({ page }) => routeElements(page));
test.describe.configure({ mode: "serial" });

const SPACE = "chikyu-space";
/** The recorded stations' elements are of 2 November 2026 at 10:25 UTC. */
const NEAR = "2026-11-02T12:00Z";
const THROTTLE = Number(process.env.HISTORY_THROTTLE ?? 0);

interface Stats {
  draws: number;
  satellites: { groups: number; estimated: number; trailPoints: number; trailBuilds: number };
}
const statsOf = (page: Page): Promise<Stats> => page.locator(SPACE).evaluate((el) => Reflect.get(el, "stats") as Stats);

async function open(page: Page): Promise<void> {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/?look=space&time=${NEAR}&speed=0&center=-100,40&sats=stations`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "satelliteGroups") as { name: string }[]).some((group) => group.name === "stations")), { timeout: 20_000 }).toBe(true);
  await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { pause(): void }).pause());
  if (THROTTLE > 1) await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  await untilStill(page);
}

/** Do `act` in the page and wait for the draw it asks for, then for rest. */
async function change(page: Page, act: (el: HTMLElement, tools: Tools) => void): Promise<Stats> {
  const before = await page.locator(SPACE).evaluate((el, source) => {
    const draws = (Reflect.get(el, "stats") as { draws: number }).draws;
    (new Function(`return (${source})`)() as (e: unknown, t: unknown) => void)(el, Reflect.get(window, "chikyuSatellites"));
    return draws;
  }, act.toString());
  await expect.poll(async () => (await statsOf(page)).draws, { timeout: 30_000, message: "a draw after the change" }).toBeGreaterThan(before);
  await untilStill(page);
  return statsOf(page);
}
interface Tools {
  createSatelliteHistory(sets: unknown[], options?: unknown): unknown;
  groups: Map<string, { sets: Record<string, number | string>[] }>;
}

/** How many of the history's one satellite are placed now (0 or 1): a placed satellite may still be on the far side of the Earth, which `placeSatellite` would call not visible. */
const placed = (page: Page): Promise<number> =>
  page.locator(SPACE).evaluate((el) => (Reflect.get(el, "satelliteGroups") as { name: string; placed: number }[]).find((group) => group.name === "history:25544")?.placed ?? -1);

test("the history places the ISS, not before its launch and shaded as a prediction after its newest set, and Observe draws a trail of its last orbits and nothing at rest", async ({ page }) => {
  await open(page);
  // the history: the ISS's recorded set, launched on 2 November at 11:00 (so before that it is not drawn)
  const made = await change(page, (el, tools) => {
    const sets = tools.groups.get("stations")!.sets.filter((set) => set["NORAD_CAT_ID"] === 25544);
    const history = tools.createSatelliteHistory(sets, { launch: "2026-11-02T11:00:00Z" });
    (el as unknown as { setSatelliteHistory(id: number, h: unknown): unknown }).setSatelliteHistory(25544, history);
  });
  expect(made.satellites.groups, "the history is a group of its own").toBeGreaterThanOrEqual(2);
  expect(await placed(page), "12:00 is after the launch and after the set's epoch (10:25): placed").toBe(1);
  expect(made.satellites.estimated, "after the newest set it is a prediction").toBe(1);

  const early = await change(page, (el) => el.setAttribute("time", "2026-11-02T10:30Z"));
  expect(await placed(page), "before the launch: not drawn").toBe(0);
  expect(early.satellites.estimated).toBe(0);
  await change(page, (el) => el.setAttribute("time", "2026-11-02T12:00Z"));
  expect(await placed(page)).toBe(1);

  // Observe: outside the satellite, with a trail of 3 orbits
  const on = await change(page, (el) => void (el as unknown as { observe(id: number, o: unknown): boolean }).observe(25544, { orbits: 3 }));
  const observing = await page.locator(SPACE).evaluate((el) => (el as unknown as { observing: { orbits: number } | null }).observing);
  expect(observing?.orbits).toBe(3);
  // 3 orbits at 96 points, less the part before the launch (11:00 to 12:00 is under 1 orbit): the trail is short, but it is there and it ends at the satellite
  expect(on.satellites.trailPoints, "a trail since the launch").toBeGreaterThan(10);
  expect(on.satellites.trailPoints).toBeLessThan(3 * 96);

  // later, the launch long past: the full 3 orbits
  const later = await change(page, (el) => el.setAttribute("time", "2026-11-02T20:00Z"));
  expect(later.satellites.trailPoints, "3 orbits of 96 points, and the satellite").toBeGreaterThanOrEqual(3 * 96);
  expect(later.satellites.trailPoints).toBeLessThanOrEqual(3 * 96 + 2);
  expect(later.satellites.trailBuilds).toBeGreaterThan(on.satellites.trailBuilds);

  // nothing is drawn at rest, and no trail is rebuilt
  await untilStill(page);
  const held = await statsOf(page);
  await page.evaluate(async () => {
    for (let frame = 0; frame < 20; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  const rested = await statsOf(page);
  expect(rested.draws, "no draw at rest").toBe(held.draws);
  expect(rested.satellites.trailBuilds, "no trail built at rest").toBe(held.satellites.trailBuilds);

  // the clock moves a little: the trail is built again, to the same length
  const moved = await change(page, (el) => el.setAttribute("time", "2026-11-02T20:05Z"));
  expect(moved.satellites.trailBuilds).toBeGreaterThan(later.satellites.trailBuilds);
  expect(Math.abs(moved.satellites.trailPoints - later.satellites.trailPoints)).toBeLessThanOrEqual(2);

  // off: no trail, no view
  const off = await change(page, (el) => void (el as unknown as { observe(id: null): boolean }).observe(null));
  expect(off.satellites.trailPoints).toBe(0);
  expect(await page.locator(SPACE).evaluate((el) => (el as unknown as { observing: unknown }).observing)).toBeNull();
  await untilStill(page);
  const quiet = await statsOf(page);
  await page.waitForTimeout(600);
  expect((await statsOf(page)).draws, "nothing drawn at rest after the view is off").toBe(quiet.draws);

  // days after its newest set: a prediction (shaded)
  const week = await change(page, (el) => el.setAttribute("time", "2026-11-12T12:00Z"));
  expect(await placed(page)).toBe(1);
  expect(week.satellites.estimated).toBe(1);
});
