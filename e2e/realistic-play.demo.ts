// Play for the realistic Earth (MODULES-799), in a real browser, like e2e/date-play.demo.ts does for the space view: at 86400x for two seconds the date box reads a later day and the Sun
// has moved with it; Play starts from the date shown, Pause holds it and writes it to the address, Back returns to the date chosen, and the address keeps play, the speed and the date.
// Nothing is drawn while paused. A link that says nothing opens moving, from now, at an hour a second (MODULES-815); links from before the clock still work (a date holds, `speed=0` holds), and a reader who prefers reduced motion gets Play left off and a still view.
import { COUNT_SCRIPT, readCounts } from "@johnmorrisdotca/kazoku-ui/testing";
import { expect, test, type Page } from "@playwright/test";
import { untilStill } from "./gl.ts";

test.beforeEach(({ browserName }, info) => {
  test.skip(browserName !== "chromium" || info.project.name !== "chromium-desk", "WebGL is drawn in the desk Chromium here, in software");
});
test.use({ reducedMotion: "no-preference" });

const PAGE = "/chikyu-earth/";
const START = "2026-11-02T14:00:00Z";
const DAY = 86_400_000;
const EARTH = "chikyu-earth-realistic";

/** The date box as milliseconds (it shows local time to the minute). */
const boxMs = async (page: Page): Promise<number> => Date.parse(await page.locator("#when").inputValue());
const play = (page: Page) => page.locator('#replay [data-act="play"]');
const back = (page: Page) => page.locator('#replay [data-act="start"]');
const speed = (page: Page, value: number) => page.locator(`#replay button[data-v="${value}"]`);
const clockOf = (page: Page) => page.locator(EARTH).evaluate((el) => ({ time: Reflect.get(el, "time") as number | "now", speed: Reflect.get(el, "speed") as number, attribute: el.getAttribute("speed") }));
/** One value in the address, as it reads now. */
const param = (page: Page, key: string): string | null => new URL(page.url()).searchParams.get(key);
/** The page writes the address a moment after a choice (kazoku-ui's address state waits 250 ms), so a check waits for the value rather than for a fixed time. */
const inAddress = (page: Page, key: string, message?: string) => expect.poll(() => param(page, key), { timeout: 5000, ...(message ? { message } : {}) });
/** The address's `time` as milliseconds (NaN when there is none), waited for like `inAddress`. */
const timeInAddress = (page: Page, message?: string) => expect.poll(() => Date.parse(param(page, "time") ?? ""), { timeout: 5000, ...(message ? { message } : {}) });
/** The date box moves on from `from` by at least `by` milliseconds: waited for, because a busy machine draws the realistic Earth slowly and the box follows the clock only when the page gets to run. */
const boxMovesOn = (page: Page, from: number, by: number, message: string) => expect.poll(async () => (await boxMs(page)) - from, { timeout: 15_000, message }).toBeGreaterThanOrEqual(by);

async function open(page: Page, query: string): Promise<void> {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`${PAGE}?look=realistic&center=-100,40${query ? `&${query}` : ""}`);
  await page.locator(`${EARTH}[data-state=live]`).waitFor({ timeout: 90_000 });
  // the view controls' own Auto-turn is on for a reader with no motion preference and asks for frames of its own: these tests are about the clock's
  await page.locator("kazoku-view-controls").evaluate((el) => (el as HTMLElement & { pause(): void }).pause());
}

test("at 86400x for two seconds the date box reads a later day, and the element tells the page a few times a second at most", async ({ page }) => {
  await page.addInitScript(() => {
    const log: { at: number; running: boolean }[] = [];
    Reflect.set(window, "__timechange", log);
    addEventListener("DOMContentLoaded", () => document.addEventListener("chikyu-timechange", (e) => log.push({ at: performance.now(), running: (e as CustomEvent<{ running: boolean }>).detail.running }), true));
  });
  await open(page, `time=${START}&play=on&speed=86400`);
  await expect(play(page)).toHaveAttribute("aria-pressed", "true");
  await expect(speed(page, 86400)).toHaveAttribute("aria-pressed", "true");
  const before = await boxMs(page);
  await boxMovesOn(page, before, DAY, "the box moved on a day");
  const state = await clockOf(page);
  expect(state.speed).toBe(86_400);
  expect(typeof state.time === "number" && state.time - Date.parse(START), "the element's own clock has run on from the date").toBeGreaterThanOrEqual(DAY);
  const log = (await page.evaluate(() => Reflect.get(window, "__timechange"))) as { at: number; running: boolean }[];
  const running = log.filter((e) => e.running);
  expect(running.length, "told while time runs").toBeGreaterThanOrEqual(3);
  for (let i = 1; i < running.length; i += 1) expect(running[i]!.at - running[i - 1]!.at, "no more than four a second").toBeGreaterThanOrEqual(240);
  await play(page).click();
  await page.waitForTimeout(300);
  const held = ((await page.evaluate(() => Reflect.get(window, "__timechange"))) as { at: number; running: boolean }[]).filter((e) => !e.running);
  expect(held.length, "told once when it holds").toBe(1);
});

test("the Sun moves with the clock: the light on the same ground differs a quarter of a day apart, and the clouds drift", async ({ page }) => {
  await open(page, `time=${START}`);
  const picture = async (): Promise<string> => (await page.locator(EARTH).screenshot()).toString("base64");
  await page.waitForTimeout(800);
  const first = await picture();
  const from = await boxMs(page);
  await speed(page, 86400).click();
  await play(page).click();
  await boxMovesOn(page, from, DAY / 2, "the clock ran on");
  await play(page).click();
  await page.waitForTimeout(1000);
  const second = await picture();
  expect(second, "the picture changed while the clock ran").not.toBe(first);
});

test("Play runs the clock from the date shown, Pause holds it, Back returns to the date chosen, and the address keeps it", async ({ page }) => {
  await open(page, `time=${START}`);
  const start = await boxMs(page);
  expect(Date.parse(START) - start, "the box shows the address's date").toBeLessThan(60_000);
  await page.waitForTimeout(400);
  expect(param(page, "play")).toBeNull();
  await page.waitForTimeout(1000);
  expect(await boxMs(page), "held until Play").toBe(start);
  expect((await clockOf(page)).speed, "a date holds without a speed").toBe(0);

  await play(page).click();
  await inAddress(page, "play").toBe("on");
  await boxMovesOn(page, start, 3600_000, "Play moves the date on from the date shown");
  const running = await boxMs(page);

  await play(page).click();
  await expect(play(page)).toHaveAttribute("aria-pressed", "false");
  await page.waitForTimeout(400);
  const held = await boxMs(page);
  expect(held).toBeGreaterThanOrEqual(running);
  await page.waitForTimeout(1500);
  expect(await boxMs(page), "Pause holds the date").toBe(held);
  expect((await clockOf(page)).speed).toBe(0);
  await inAddress(page, "play", "play leaves the address").toBeNull();
  await timeInAddress(page, "the date it stopped on is in the address").toBeGreaterThan(Date.parse(START));
  expect(Math.abs(Date.parse(param(page, "time")!) - held), "and is the date shown").toBeLessThan(120_000);

  // Play again goes on from there, and Back goes to the date the reader chose, not where Pause was
  await play(page).click();
  await boxMovesOn(page, held, 1800_000, "Play goes on from the date it was held on");
  await back(page).click();
  await expect(play(page)).toHaveAttribute("aria-pressed", "false");
  expect(await boxMs(page), "Back returns to the chosen date").toBe(start);
  await page.waitForTimeout(1000);
  expect(await boxMs(page), "and holds there").toBe(start);
  await timeInAddress(page, "the address has the chosen date").toBe(Date.parse(START));
  await inAddress(page, "play").toBeNull();
});

test("a speed is kept in the address and a reader who returns finds Play and the speed as they were", async ({ page }) => {
  await open(page, `time=${START}`);
  await speed(page, 86400).click();
  await play(page).click();
  await inAddress(page, "speed").toBe("86400");
  await inAddress(page, "play").toBe("on");
  await page.reload();
  await page.locator(`${EARTH}[data-state=live]`).waitFor({ timeout: 90_000 });
  await expect(play(page)).toHaveAttribute("aria-pressed", "true");
  await expect(speed(page, 86400)).toHaveAttribute("aria-pressed", "true");
  expect((await clockOf(page)).speed).toBe(86_400);
});

test("links from before the clock: a date holds, and a link that says nothing opens moving, from now, at an hour a second (MODULES-815)", async ({ page }) => {
  await open(page, `time=${START}`);
  expect((await clockOf(page)).attribute, "no speed given").toBeNull();
  const start = await boxMs(page);
  await page.waitForTimeout(1500);
  expect(await boxMs(page), "a date holds still").toBe(start);

  await page.goto(`${PAGE}?look=realistic&center=-100,40`);
  await page.locator(`${EARTH}[data-state=live]`).waitFor({ timeout: 90_000 });
  await expect(play(page)).toHaveAttribute("aria-pressed", "true");
  await expect(speed(page, 3600)).toHaveAttribute("aria-pressed", "true");
  const moving = await clockOf(page);
  expect(moving.speed, "the element's clock runs at an hour a second").toBe(3600);
  expect(moving.attribute).toBe("3600");
  const shown = await boxMs(page);
  expect(Math.abs(shown - Date.now()), "from now").toBeLessThan(5 * 60_000);
  await boxMovesOn(page, shown, 3600_000, "and the date box runs with it");
  await inAddress(page, "play").toBe("on");
  expect(param(page, "time"), "no date in the address while it runs from now").toBeNull();

  // Back to a date that was "now": it follows the real clock again, and the address says it is held with no date
  await back(page).click();
  await page.waitForTimeout(500);
  expect((await clockOf(page)).time, "Back returns to following the real clock").toBe("now");
  await inAddress(page, "time", "and the address has no date").toBeNull();
  await inAddress(page, "play", "and says it is held").toBe("off");
  await page.reload();
  await page.locator(`${EARTH}[data-state=live]`).waitFor({ timeout: 90_000 });
  await expect(play(page)).toHaveAttribute("aria-pressed", "false");
  expect((await clockOf(page)).speed, "a link made then opens following the real clock, not moving").toBe(1);
  await page.locator(EARTH).evaluate((el) => el.setAttribute("live-seconds", "1"));
  await page.waitForTimeout(2300);
  expect(Math.abs((await boxMs(page)) - Date.now()), "and the box follows it").toBeLessThan(5 * 60_000);
});

test("speed=0 on a plain link holds the realistic Earth where it opened", async ({ page }) => {
  await open(page, "speed=0");
  await expect(play(page)).toHaveAttribute("aria-pressed", "false");
  expect((await clockOf(page)).speed).toBe(0);
  const start = await boxMs(page);
  await page.waitForTimeout(1500);
  expect(await boxMs(page)).toBe(start);
});

test("Now puts a paused Earth back on the real clock", async ({ page }) => {
  await open(page, `time=${START}&play=on&speed=3600`);
  await play(page).click();
  expect((await clockOf(page)).speed).toBe(0);
  await page.locator("#now").click();
  await page.waitForTimeout(400);
  const state = await clockOf(page);
  expect(state.time).toBe("now");
  expect(state.speed).toBe(1);
});

test("the box is left alone while the reader is typing in it", async ({ page }) => {
  await open(page, `time=${START}&play=on&speed=86400`);
  await page.locator("#when").focus();
  const typed = await page.locator("#when").inputValue();
  await page.waitForTimeout(1500);
  expect(await page.locator("#when").inputValue(), "not written while it has the focus").toBe(typed);
  await page.locator("#when").blur();
  await expect.poll(() => page.locator("#when").inputValue(), { timeout: 5000 }).not.toBe(typed);
});

test("nothing is drawn while paused, and the clock stops asking for frames", async ({ page }) => {
  await open(page, `time=${START}&play=on&speed=86400`);
  await page.waitForTimeout(800);
  await play(page).click();
  await expect(play(page)).toHaveAttribute("aria-pressed", "false");
  await untilStill(page);
  const before = await readCounts(page);
  await page.waitForTimeout(3000);
  const after = await readCounts(page);
  expect(after.draws, "no draws while paused").toBe(before.draws);
  expect(after.rafRequests, "no frames asked for while paused").toBe(before.rafRequests);
});

test("a speed on the element itself runs it, and an element with none follows its time", async ({ page }) => {
  await open(page, `time=${START}`);
  const state = await page.locator(EARTH).evaluate(async (el) => {
    const read = () => ({ time: Reflect.get(el, "time") as number | "now", speed: Reflect.get(el, "speed") as number });
    const held = read();
    el.setAttribute("speed", "3600");
    // an hour of the clock's time, waited for (a busy machine runs the page late), for at most 15 s
    for (const end = Date.now() + 15_000; Number(read().time) - Number(held.time) < 3600_000 && Date.now() < end; ) await new Promise((resolve) => setTimeout(resolve, 100));
    const running = read();
    Reflect.set(el, "speed", 0);
    const stopped = read();
    await new Promise((resolve) => setTimeout(resolve, 600));
    const still = read();
    el.removeAttribute("speed");
    return { held, running, stopped, still, after: read(), attribute: el.getAttribute("speed") };
  });
  expect(state.held.speed).toBe(0);
  expect(state.running.speed).toBe(3600);
  expect(Number(state.running.time) - Date.parse(START), "an hour a second, from the date").toBeGreaterThan(3600_000);
  expect(state.stopped.time, "setting the speed to 0 holds the moment reached").toBe(state.still.time);
  expect(state.after.speed, "the speed taken off: a date holds").toBe(0);
  expect(state.attribute).toBeNull();
});

test.describe("a reader who prefers reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("gets Play left off, even from an address that asks for it", async ({ page }) => {
    await open(page, `time=${START}&play=on&speed=86400`);
    await expect(play(page)).toHaveAttribute("aria-pressed", "false");
    await expect(play(page)).toBeDisabled();
    expect((await clockOf(page)).speed).toBe(0);
    const before = await boxMs(page);
    await page.waitForTimeout(1200);
    expect(await boxMs(page)).toBe(before);
    await page.waitForTimeout(400);
    expect(param(page, "play")).toBeNull();
  });

  test("a link that says nothing opens still, following the real clock, with Play off (John has not decided yet: OPEN_MOVING_WITH_REDUCED_MOTION in demo/demo.ts)", async ({ page }) => {
    await open(page, "");
    await expect(play(page)).toHaveAttribute("aria-pressed", "false");
    await expect(play(page)).toBeDisabled();
    const state = await clockOf(page);
    expect(state.attribute, "no speed given").toBeNull();
    expect(state.speed, "real time").toBe(1);
  });
});
