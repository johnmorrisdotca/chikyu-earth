// Satellites far from today, as an estimate (MODULES-1296): off by default, so a satellite more than 30 days from its elements is left out; with `estimate-far` it is placed by the same orbit code, drawn lighter, and said to be an estimate
// (with how far from its elements the moment is) in `stats`, `placeSatellite`, `chikyu-satellite-click` and `chikyu-satellite-visibility`. The clock is the test's own: `speed=0` at a moment 36 days after the recorded elements, the
// view's controls paused. With ESTIMATE_THROTTLE set the browser's CPU is slowed by that factor, for the repeats under load.
import { expect, test, type Page } from "@playwright/test";
import { COUNT_SCRIPT, untilStill } from "./gl.ts";
import { routeElements } from "./recorded.ts";

test.beforeEach(({ page }) => routeElements(page));
test.describe.configure({ mode: "serial" });

const SPACE = "chikyu-space";
/** The recorded stations' elements are of 2 November 2026: this is 36 days after, past the 30-day limit. */
const FAR = "2026-12-08T12:00Z";
const NEAR = "2026-11-22T12:00Z";
const THROTTLE = Number(process.env.ESTIMATE_THROTTLE ?? 0);

interface Stats {
  draws: number;
  satellites: { placed: number; estimated: number };
}
interface Place {
  x: number;
  y: number;
  visible: boolean;
  estimated: boolean;
}
const statsOf = (page: Page): Promise<Stats> => page.locator(SPACE).evaluate((el) => Reflect.get(el, "stats") as Stats);

async function open(page: Page, time: string): Promise<void> {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/?look=space&time=${time}&speed=0&center=-100,40&sats=stations`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "satelliteGroups") as { name: string }[]).some((group) => group.name === "stations")), { timeout: 20_000 }).toBe(true);
  await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { pause(): void }).pause());
  if (THROTTLE > 1) await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  await untilStill(page);
}

/** Do `act` in the page and wait for the draw it asks for: the draw count is read in the same turn as the change. */
async function change(page: Page, act: (el: HTMLElement) => void): Promise<Stats> {
  const before = await page.locator(SPACE).evaluate((el, source) => {
    const draws = (Reflect.get(el, "stats") as { draws: number }).draws;
    (new Function(`return (${source})`)() as (e: unknown) => void)(el);
    return draws;
  }, act.toString());
  await expect.poll(async () => (await statsOf(page)).draws, { timeout: 30_000, message: "a draw after the change" }).toBeGreaterThan(before);
  await untilStill(page);
  return statsOf(page);
}

const visibleStations = (page: Page): Promise<{ index: number; x: number; y: number; estimated: boolean }[]> =>
  page.locator(SPACE).evaluate((el) => {
    const space = el as unknown as { satelliteGroups: { name: string; count: number }[]; placeSatellite(ref: unknown): Place | null };
    const count = space.satelliteGroups.find((group) => group.name === "stations")!.count;
    const out: { index: number; x: number; y: number; estimated: boolean }[] = [];
    for (let index = 0; index < count; index += 1) {
      const at = space.placeSatellite({ group: "stations", index });
      if (at?.visible) out.push({ index, x: at.x, y: at.y, estimated: at.estimated });
    }
    return out;
  });

test("36 days from the elements: left out as ever, and placed as an estimate with estimate-far, then left out again without it; nothing is drawn at rest", async ({ page }) => {
  await open(page, FAR);
  const off = await statsOf(page);
  expect(off.satellites.placed, "past the 30-day limit nothing is placed").toBe(0);
  expect(off.satellites.estimated).toBe(0);

  const on = await change(page, (el) => el.setAttribute("estimate-far", ""));
  expect(on.satellites.placed, "the estimate places them").toBeGreaterThan(5);
  expect(on.satellites.estimated, "and every one is an estimate").toBe(on.satellites.placed);
  expect(await page.locator(SPACE).evaluate((el) => (el as unknown as { estimateFar: boolean }).estimateFar)).toBe(true);

  await untilStill(page);
  const held = (await statsOf(page)).draws;
  await page.evaluate(async () => {
    for (let frame = 0; frame < 20; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  expect((await statsOf(page)).draws, "estimates shown, nothing is drawn at rest").toBe(held);

  const gone = await change(page, (el) => el.removeAttribute("estimate-far"));
  expect(gone.satellites.placed, "off again, left out again").toBe(0);
  expect(gone.satellites.estimated).toBe(0);
});

test("20 days from the elements is no estimate with the option on", async ({ page }) => {
  await open(page, NEAR);
  const before = await statsOf(page);
  expect(before.satellites.placed).toBeGreaterThan(5);
  const on = await change(page, (el) => el.setAttribute("estimate-far", ""));
  expect(on.satellites.placed, "the same satellites").toBe(before.satellites.placed);
  expect(on.satellites.estimated, "inside the limit none is an estimate").toBe(0);
});

test("an estimated satellite says so when it is pressed and when it comes into view, with how far from its elements the moment is", async ({ page }) => {
  await open(page, FAR);
  await change(page, (el) => el.setAttribute("estimate-far", ""));
  const seen = await visibleStations(page);
  expect(seen.length, "a station is in the picture").toBeGreaterThan(0);
  expect(seen.every((one) => one.estimated), "placeSatellite says estimated").toBe(true);
  await page.locator(SPACE).evaluate((el) => {
    const log: { type: string; detail: unknown }[] = [];
    Reflect.set(window, "__log", log);
    for (const type of ["chikyu-satellite-click", "chikyu-satellite-visibility"]) el.addEventListener(type, (event) => log.push({ type, detail: (event as CustomEvent).detail }));
    (el as unknown as { labelSatellites(group: string): void }).labelSatellites("stations");
  });
  await expect
    .poll(async () => page.evaluate(() => (Reflect.get(window, "__log") as { type: string }[]).filter((entry) => entry.type === "chikyu-satellite-visibility").length), { timeout: 20_000 })
    .toBeGreaterThan(0);
  const told = await page.evaluate(() => (Reflect.get(window, "__log") as { type: string; detail: { visible: boolean; estimated: boolean; estimatedDays: number } }[]).find((entry) => entry.type === "chikyu-satellite-visibility" && entry.detail.visible)!.detail);
  expect(told.estimated).toBe(true);
  expect(told.estimatedDays, "36 days from the elements of 2 November").toBeGreaterThan(34);
  expect(told.estimatedDays).toBeLessThan(38);

  const box = (await page.locator(SPACE).boundingBox())!;
  await page.mouse.click(box.x + seen[0]!.x, box.y + seen[0]!.y);
  await expect.poll(async () => page.evaluate(() => (Reflect.get(window, "__log") as { type: string }[]).filter((entry) => entry.type === "chikyu-satellite-click").length), { timeout: 20_000 }).toBeGreaterThan(0);
  const clicked = await page.evaluate(() => (Reflect.get(window, "__log") as { type: string; detail: { estimated: boolean; estimatedDays: number; info: { estimated: boolean; estimatedDays: number } } }[]).find((entry) => entry.type === "chikyu-satellite-click")!.detail);
  expect(clicked.estimated).toBe(true);
  expect(clicked.info.estimated, "in info too").toBe(true);
  expect(clicked.estimatedDays).toBeGreaterThan(34);
  expect(clicked.info.estimatedDays).toBe(clicked.estimatedDays);
});
