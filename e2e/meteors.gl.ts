// Meteors seen from space, on the realistic Earth, in a real browser: they start only when switched on, only where it is dark, only while
// the clock runs, and never for a reader who prefers reduced motion until Play. Each streak is random, so these read the layer's own
// counts (`stats.meteors`) and never a pixel.
import { expect, test, type Page } from "@playwright/test";
import { EARTH, openEarth } from "./gl.ts";

test.describe.configure({ mode: "serial" });

interface MeteorStats {
  on: boolean;
  alive: number;
  spawned: number;
  perSecond: number;
  shower: string | null;
  zhr: number;
}
const meteors = (page: Page): Promise<MeteorStats> => page.locator(EARTH).first().evaluate((el) => (Reflect.get(el, "stats") as { meteors: MeteorStats }).meteors);
const note = (page: Page): Promise<string | null> =>
  page.locator(EARTH).evaluate((el) => {
    const line = el.shadowRoot!.getElementById("meteor-note")!;
    return line.hidden ? null : line.textContent;
  });
/** The Geminids' maximum, over North America at night: the radiant stands high there. */
const GEMINIDS = "time=2026-12-14T08:00Z&center=-100,30";

test.describe("with motion allowed", () => {
  test.use({ reducedMotion: "no-preference" });

  test("switched on at the Geminids' maximum, streaks start on the night side, at most nine a second, and the picture says they are an illustration", async ({ page }) => {
    await openEarth(page, `${GEMINIDS}&speed=60&meteors=on`);
    await expect.poll(async () => (await meteors(page)).spawned, { timeout: 15_000 }).toBeGreaterThan(5);
    const first = await meteors(page);
    expect(first.on).toBe(true);
    expect(first.shower).toBe("GEM");
    expect(first.zhr).toBeGreaterThan(100);
    expect(first.perSecond).toBeGreaterThan(2.5);
    expect(first.perSecond).toBeLessThanOrEqual(9);
    await page.waitForTimeout(4000);
    const later = await meteors(page);
    const started = later.spawned - first.spawned;
    expect(started, "streaks started in four seconds").toBeGreaterThan(4);
    expect(started).toBeLessThanOrEqual(4 * 9 + 12);
    expect(later.alive).toBeLessThanOrEqual(48);
    expect(await note(page)).toContain("illustration");
    await expect(page.locator("#meteors")).toHaveAttribute("aria-pressed", "true");
  });

  test("off unless asked for: no streak, no note; the demo's button switches them on and off, and off leaves none alive", async ({ page }) => {
    await openEarth(page, `${GEMINIDS}&speed=60`);
    await page.waitForTimeout(2500);
    expect(await meteors(page)).toMatchObject({ on: false, alive: 0, spawned: 0, perSecond: 0 });
    expect(await note(page)).toBeNull();
    await page.locator("#meteors").click();
    await expect.poll(async () => (await meteors(page)).spawned, { timeout: 15_000 }).toBeGreaterThan(2);
    expect(await note(page)).not.toBeNull();
    expect(new URL(page.url()).searchParams.get("meteors")).toBe("on");
    await page.locator("#meteors").click();
    await expect.poll(async () => (await meteors(page)).alive).toBe(0);
    const stopped = (await meteors(page)).spawned;
    await page.waitForTimeout(2000);
    expect((await meteors(page)).spawned).toBe(stopped);
    expect(await note(page)).toBeNull();
    expect(new URL(page.url()).searchParams.get("meteors")).toBeNull();
  });

  test("next to none on the day side: with the Sun over the middle of the view almost nothing in sight is dark", async ({ page }) => {
    // the June solstice at 12:00 UTC: the Sun is over 0 E, 23.4 N
    // the camera is held over the ground so that the Sun stays over the middle while the clock runs (the default camera, in the stars, lets the Earth turn away from it)
    await openEarth(page, "time=2026-06-21T12:00Z&center=0,23.44&speed=60&meteors=on&camera=ground");
    // the demo opens the 3D looks turning (Auto-turn, 6 degrees a second), which would carry the night side into view: hold the turn so only the clock moves
    await page.locator("kazoku-view-controls").evaluate((el) => (el as HTMLElement & { pause(): void }).pause());
    await page.waitForTimeout(4000);
    const day = await meteors(page);
    expect(day.on).toBe(true);
    // the clock runs, so a sliver of twilight creeps in at the rim: next to nothing, where the night side gives several a second
    expect(day.spawned).toBeLessThanOrEqual(1);
    expect(day.perSecond).toBeLessThan(0.2);
  });

  test("none while the clock is held, and they start when it runs", async ({ page }) => {
    await openEarth(page, `${GEMINIDS}&meteors=on`);
    await page.waitForTimeout(2500);
    expect(await page.locator(EARTH).evaluate((el) => Reflect.get(el, "speed"))).toBe(0);
    expect((await meteors(page)).spawned).toBe(0);
    await page.locator(EARTH).evaluate((el) => el.setAttribute("speed", "1"));
    await expect.poll(async () => (await meteors(page)).spawned, { timeout: 15_000 }).toBeGreaterThan(2);
  });

  test("the note follows the page's language, and meteors-label=off takes it away", async ({ page }) => {
    await openEarth(page, `${GEMINIDS}&speed=60&meteors=on&lang=ja`);
    await expect.poll(() => note(page)).toContain("流星");
    await page.locator(EARTH).evaluate((el) => el.setAttribute("meteors-label", "off"));
    expect(await note(page)).toBeNull();
  });
});

test.describe("for a reader who prefers reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("no streaks until Play, even on a page that opens with the clock running", async ({ page }) => {
    await openEarth(page, `${GEMINIDS}&meteors=on`);
    // taken out and put back with its clock already running: for this reader an element that arrives running is not a Play
    await page.locator(EARTH).evaluate((el) => {
      const parent = el.parentElement!;
      el.remove();
      el.setAttribute("speed", "60");
      parent.append(el);
    });
    await page.locator(`${EARTH}[data-state=live]`).waitFor();
    await page.waitForTimeout(3000);
    expect(await page.locator(EARTH).evaluate((el) => Reflect.get(el, "speed"))).toBe(60);
    expect((await meteors(page)).spawned).toBe(0);
    // a Play is the page setting a speed once the element is in the page
    await page.locator(EARTH).first().evaluate((el) => el.setAttribute("speed", "60"));
    await expect.poll(async () => (await meteors(page)).spawned, { timeout: 15_000 }).toBeGreaterThan(2);
  });
});

test.describe("in the space view", () => {
  test.use({ reducedMotion: "no-preference" });

  const SPACE = "chikyu-space";
  const spaceMeteors = (page: Page): Promise<MeteorStats> => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { meteors: MeteorStats }).meteors);
  const openSpace = async (page: Page, query: string): Promise<void> => {
    await page.goto(`/chikyu-earth/?look=space&${query}`);
    await page.locator(`${SPACE}[data-state=live]`).waitFor();
  };

  test("the same streaks fall round the Earth there: on at the Geminids' maximum, with the note, and none once the Earth is small on the screen", async ({ page }) => {
    await openSpace(page, `${GEMINIDS}&speed=60&meteors=on`);
    await expect.poll(async () => (await spaceMeteors(page)).spawned, { timeout: 20_000 }).toBeGreaterThan(5);
    const first = await spaceMeteors(page);
    expect(first.on).toBe(true);
    expect(first.shower).toBe("GEM");
    expect(first.perSecond).toBeGreaterThan(2.5);
    expect(first.perSecond).toBeLessThanOrEqual(9);
    expect(await page.locator(SPACE).evaluate((el) => el.shadowRoot!.getElementById("meteor-note")!.hidden)).toBe(false);
    await expect(page.locator("#meteors")).toHaveAttribute("aria-pressed", "true");
    // out to the Moon's distance the Earth is a few pixels: no streak is drawn on it
    // (through the page's view controls: they drive the element here, and would put back a zoom set on the element alone)
    await page.locator("kazoku-view-controls").evaluate((el) => (Reflect.get(el, "controller") as { set(v: unknown, f: boolean, r: string): void }).set({ zoom: 0.05 }, true, "test"));
    await expect.poll(async () => (await spaceMeteors(page)).alive, { timeout: 10_000 }).toBe(0);
    const far = (await spaceMeteors(page)).spawned;
    await page.waitForTimeout(2500);
    expect((await spaceMeteors(page)).spawned).toBe(far);
  });

  test("off unless asked for, none while the clock is held, and the demo's button switches them on", async ({ page }) => {
    await openSpace(page, `${GEMINIDS}&speed=60`);
    await page.waitForTimeout(2500);
    expect(await spaceMeteors(page)).toMatchObject({ on: false, alive: 0, spawned: 0 });
    await page.locator("#meteors").click();
    await expect.poll(async () => (await spaceMeteors(page)).spawned, { timeout: 20_000 }).toBeGreaterThan(2);
    await page.locator(SPACE).evaluate((el) => el.setAttribute("speed", "0"));
    await expect.poll(async () => (await spaceMeteors(page)).alive).toBe(0);
    const held = (await spaceMeteors(page)).spawned;
    await page.waitForTimeout(2000);
    expect((await spaceMeteors(page)).spawned).toBe(held);
  });
});
