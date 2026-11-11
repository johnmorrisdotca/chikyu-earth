// Meteors seen from space, on the realistic Earth, in a real browser: they start only when switched on, only where it is dark, only while
// the clock runs, and never for a reader who prefers reduced motion until Play. Each streak is random, so these read the layer's own
// counts (`stats.meteors`) and never a pixel.
import { expect, test, type Page } from "@playwright/test";
import { EARTH, openEarth } from "./gl.ts";

test.describe.configure({ mode: "serial" });

interface MeteorStats {
  on: boolean;
  strength: number;
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
    // Streaks start at random (a Poisson process), so a count over a few seconds can land well off its mean: four seconds at the top rate of nine a second has a mean of 36 and a spread of 6.
    // Count over ten seconds of this page's own time (read in the page, not guessed from the wait) and hold the count to what the rate says, with room for chance of five spreads.
    const clock = (): Promise<number> => page.evaluate(() => performance.now());
    const t0 = await clock();
    const before = (await meteors(page)).spawned;
    await page.waitForTimeout(10_000);
    const later = await meteors(page);
    const seconds = ((await clock()) - t0) / 1000;
    const started = later.spawned - before;
    const rate = Math.min(first.perSecond, later.perSecond);
    const top = 9 * seconds;
    expect(started, `streaks started in ${seconds.toFixed(1)} s at ${rate.toFixed(1)} a second`).toBeGreaterThan(rate * seconds - 5 * Math.sqrt(rate * seconds));
    expect(started, `streaks started in ${seconds.toFixed(1)} s, where nine a second is the most`).toBeLessThanOrEqual(top + 5 * Math.sqrt(top));
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
    // the address is written a moment after a choice (kazoku-ui's address state waits 250 ms): waited for, not read once
    await expect.poll(() => new URL(page.url()).searchParams.get("meteors"), { timeout: 5000 }).toBe("on");
    await page.locator("#meteors").click();
    await expect.poll(async () => (await meteors(page)).alive).toBe(0);
    const stopped = (await meteors(page)).spawned;
    await page.waitForTimeout(2000);
    expect((await meteors(page)).spawned).toBe(stopped);
    expect(await note(page)).toBeNull();
    await expect.poll(() => new URL(page.url()).searchParams.get("meteors"), { timeout: 5000 }).toBeNull();
  });

  test("next to none on the day side: with the Sun over the middle of the view almost nothing in sight is dark", async ({ page }) => {
    // the June solstice at 12:00 UTC: the Sun is over 0 E, 23.4 N
    // the camera is held over the ground so that the Sun stays over the middle while the clock runs (the default camera, in the stars, lets the Earth turn away from it)
    await openEarth(page, "time=2026-06-21T12:00Z&center=0,23.44&speed=60&meteors=on&camera=ground");
    // the demo opens the 3D looks turning (Auto-turn, 6 degrees a second), which would carry the night side into view: hold the turn so only the clock moves
    await page.locator("kazoku-view-controls").evaluate((el) => (el as HTMLElement & { pause(): void }).pause());
    // the turn is held and the view put back where the Sun is over the middle: what is in sight is then the same whatever the machine's speed, so the rate it gives is the same too
    await page.locator("kazoku-view-controls").evaluate((el) => (Reflect.get(el, "controller") as { set(v: unknown, f: boolean, r: string): void }).set({ yaw: 0, tilt: 0 }, true, "test"));
    await page.waitForTimeout(1500);
    const before = (await meteors(page)).spawned;
    await page.waitForTimeout(4000);
    const day = await meteors(page);
    expect(day.on).toBe(true);
    // the clock runs, so a sliver of twilight creeps in at the rim: next to nothing, where the night side gives several a second
    expect(day.perSecond).toBeLessThan(0.2);
    // chance can still start one or two at that rate; the night side starts dozens in the same time
    expect(day.spawned - before).toBeLessThanOrEqual(3);
  });

  test("none while the clock is held, and they start when it runs", async ({ page }) => {
    await openEarth(page, `${GEMINIDS}&meteors=on`);
    await page.waitForTimeout(2500);
    expect(await page.locator(EARTH).evaluate((el) => Reflect.get(el, "speed"))).toBe(0);
    expect((await meteors(page)).spawned).toBe(0);
    await page.locator(EARTH).evaluate((el) => el.setAttribute("speed", "1"));
    await expect.poll(async () => (await meteors(page)).spawned, { timeout: 15_000 }).toBeGreaterThan(2);
  });

  test("meteors-strength: 1 when the page says nothing, a number from 0 to 1 whatever is written, and the property writes the attribute", async ({ page }) => {
    await openEarth(page, `${GEMINIDS}&speed=60&meteors=on`);
    expect((await meteors(page)).strength).toBe(1);
    const read = (): Promise<{ property: number; strength: number }> =>
      page.locator(EARTH).evaluate((el) => ({ property: Reflect.get(el, "meteorsStrength") as number, strength: (Reflect.get(el, "stats") as { meteors: { strength: number } }).meteors.strength }));
    for (const [written, expected] of [["0.3", 0.3], ["7", 1], ["-1", 0], ["soft", 1], ["0", 0]] as const) {
      await page.locator(EARTH).evaluate((el, value) => el.setAttribute("meteors-strength", value), written);
      expect(await read(), `meteors-strength="${written}"`).toEqual({ property: expected, strength: expected });
    }
    await page.locator(EARTH).evaluate((el) => Reflect.set(el, "meteorsStrength", 0.45));
    expect(await page.locator(EARTH).evaluate((el) => el.getAttribute("meteors-strength"))).toBe("0.45");
    await page.locator(EARTH).evaluate((el) => el.removeAttribute("meteors-strength"));
    expect((await read()).property).toBe(1);
  });

  test("a low meteors-strength draws fewer streaks a second, but still some, and the real shower is the same", async ({ page }) => {
    await openEarth(page, `${GEMINIDS}&speed=60&meteors=on`);
    await expect.poll(async () => (await meteors(page)).spawned, { timeout: 15_000 }).toBeGreaterThan(5);
    const full = await meteors(page);
    expect(full.perSecond).toBeGreaterThan(2.5);
    await page.locator(EARTH).evaluate((el) => el.setAttribute("meteors-strength", "0.3"));
    // the layer surveys the sky again as soon as the strength changes, and reports the rate it now draws
    await expect.poll(async () => (await meteors(page)).perSecond, { timeout: 15_000 }).toBeLessThan(full.perSecond * 0.6);
    const low = await meteors(page);
    expect(low.strength).toBe(0.3);
    expect(low.perSecond).toBeGreaterThan(0);
    // what is real does not move: the same shower and the same hourly rate
    expect(low.shower).toBe(full.shower);
    expect(low.zhr).toBeCloseTo(full.zhr, 0);
    // fewer, not none
    const at = low.spawned;
    await expect.poll(async () => (await meteors(page)).spawned, { timeout: 20_000 }).toBeGreaterThan(at + 1);
    // the picture still says the streaks are an illustration
    expect(await note(page)).toContain("illustration");
  });

  test("meteors-strength=0 draws none, keeps the note and the shower, and a strength above 0 brings them back", async ({ page }) => {
    await openEarth(page, `${GEMINIDS}&speed=60&meteors=on&meteors-strength=0`);
    // the sky is surveyed and the shower found, with no streak started
    await expect.poll(async () => (await meteors(page)).shower, { timeout: 15_000 }).toBe("GEM");
    await expect.poll(() => meteors(page)).toMatchObject({ on: true, strength: 0, alive: 0, spawned: 0, perSecond: 0 });
    expect(await note(page)).toContain("illustration");
    // the clock is running and the night side is in view: nothing but the strength is holding them back
    await page.locator(EARTH).evaluate((el) => el.setAttribute("meteors-strength", "0.5"));
    await expect.poll(async () => (await meteors(page)).spawned, { timeout: 15_000 }).toBeGreaterThan(2);
    // and to 0 again: every streak goes at once and no more start
    await page.locator(EARTH).evaluate((el) => el.setAttribute("meteors-strength", "0"));
    await expect.poll(async () => (await meteors(page)).alive).toBe(0);
    const held = (await meteors(page)).spawned;
    await expect.poll(async () => (await meteors(page)).perSecond).toBe(0);
    expect((await meteors(page)).spawned).toBe(held);
  });

  test("the demo's strength buttons set meteors-strength on the element and in the address, and Full puts the default back", async ({ page }) => {
    await openEarth(page, `${GEMINIDS}&speed=60&meteors=on`);
    await expect(page.locator('#meteor-strength [data-meteor-strength="1"]')).toHaveClass(/\bon\b/);
    await page.locator('#meteor-strength [data-meteor-strength="0.3"]').click();
    await expect.poll(async () => (await meteors(page)).strength).toBe(0.3);
    // the address follows the click on its own schedule: wait for it to say so
    await expect.poll(() => new URL(page.url()).searchParams.get("meteors-strength")).toBe("0.3");
    await expect(page.locator('#meteor-strength [data-meteor-strength="0.3"]')).toHaveClass(/\bon\b/);
    await page.locator('#meteor-strength [data-meteor-strength="1"]').click();
    await expect.poll(async () => (await meteors(page)).strength).toBe(1);
    await expect.poll(() => new URL(page.url()).searchParams.get("meteors-strength")).toBeNull();
    expect(await page.locator(EARTH).evaluate((el) => el.hasAttribute("meteors-strength"))).toBe(false);
  });

  test("a link with meteors-strength opens at that strength, with its button marked", async ({ page }) => {
    await openEarth(page, `${GEMINIDS}&speed=60&meteors=on&meteors-strength=0.5`);
    expect((await meteors(page)).strength).toBe(0.5);
    await expect(page.locator('#meteor-strength [data-meteor-strength="0.5"]')).toHaveClass(/\bon\b/);
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

  test("the space view takes meteors-strength too: fewer streaks at a low one, none at 0", async ({ page }) => {
    await openSpace(page, `${GEMINIDS}&speed=60&meteors=on`);
    await expect.poll(async () => (await spaceMeteors(page)).spawned, { timeout: 20_000 }).toBeGreaterThan(5);
    const full = await spaceMeteors(page);
    expect(full.strength).toBe(1);
    await page.locator(SPACE).evaluate((el) => el.setAttribute("meteors-strength", "0.3"));
    await expect.poll(async () => (await spaceMeteors(page)).perSecond, { timeout: 15_000 }).toBeLessThan(full.perSecond * 0.6);
    expect(await page.locator(SPACE).evaluate((el) => Reflect.get(el, "meteorsStrength"))).toBe(0.3);
    await page.locator(SPACE).evaluate((el) => Reflect.set(el, "meteorsStrength", 0));
    await expect.poll(async () => (await spaceMeteors(page)).alive).toBe(0);
    // the sky is surveyed again at the next draw after the change, and the rate it reports follows: wait for it, never read it the moment the last streak is gone
    await expect.poll(() => spaceMeteors(page)).toMatchObject({ strength: 0, perSecond: 0 });
    expect(await page.locator(SPACE).evaluate((el) => el.shadowRoot!.getElementById("meteor-note")!.hidden)).toBe(false);
    const held = (await spaceMeteors(page)).spawned;
    // back to the full look: they start again
    await page.locator(SPACE).evaluate((el) => el.removeAttribute("meteors-strength"));
    await expect.poll(async () => (await spaceMeteors(page)).spawned, { timeout: 20_000 }).toBeGreaterThan(held + 2);
  });
});
