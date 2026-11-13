// The date follows the clock and Play runs it (MODULES-784, MODULES-755), in a real browser: at 86400x for two seconds the date box reads a later day; riding along the Moon keeps it moving; Play starts from the
// date shown, Pause holds it and writes it to the address, Back returns to the date chosen, and the address keeps play, the speed and the date. Nothing is drawn while paused. The box is never written while the
// reader is typing in it, a reader who prefers reduced motion gets Play left off, links from before the bar still work, and the realistic Earth tells the page when its "now" clock steps.
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
const SPACE = "chikyu-space";

/** The date box as milliseconds. It shows local time to the minute, so it is read in the page's own time zone: the runner's time-zone data can differ from the browser's (in November 2026 Node put America/Vancouver at UTC-8 and Chromium at UTC-7). */
const boxMs = (page: Page): Promise<number> => page.locator("#when").evaluate((el) => new Date((el as HTMLInputElement).value).getTime());
/** The date box moves on from `from` by at least `by` milliseconds: waited for, because a busy machine draws slowly and the box follows the clock only when the page gets to run. */
const boxMovesOn = (page: Page, from: number, by: number, message: string) => expect.poll(async () => (await boxMs(page)) - from, { timeout: 20_000, message }).toBeGreaterThanOrEqual(by);
const play = (page: Page) => page.locator('#replay [data-act="play"]');
const back = (page: Page) => page.locator('#replay [data-act="start"]');
const speed = (page: Page, value: number) => page.locator(`#replay button[data-v="${value}"]`);
/** One value in the address, as it reads now. */
const param = (page: Page, key: string): string | null => new URL(page.url()).searchParams.get(key);
/** The page writes the address a moment after a choice (kazoku-ui's address state waits 250 ms), so a check waits for the value rather than for a fixed time. */
const inAddress = (page: Page, key: string, message?: string) => expect.poll(() => param(page, key), { timeout: 5000, ...(message ? { message } : {}) });
/** The address's `time` as milliseconds (NaN when there is none), waited for like `inAddress`. */
const timeInAddress = (page: Page, message?: string) => expect.poll(() => Date.parse(param(page, "time") ?? ""), { timeout: 5000, ...(message ? { message } : {}) });

async function open(page: Page, query: string): Promise<void> {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`${PAGE}?look=space&center=-100,40&${query}`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 90_000 });
}

test("at 86400x for two seconds the date box reads a later day, and the element tells the page a few times a second at most", async ({ page }) => {
  await page.addInitScript(() => {
    const log: { at: number; running: boolean }[] = [];
    Reflect.set(window, "__timechange", log);
    addEventListener("DOMContentLoaded", () => document.addEventListener("chikyu-timechange", (e) => log.push({ at: performance.now(), running: (e as CustomEvent<{ running: boolean }>).detail.running }), true));
  });
  await open(page, `time=${START}&play=on&speed=86400`);
  await expect(play(page)).toHaveAttribute("aria-pressed", "true");
  const before = await boxMs(page);
  await boxMovesOn(page, before, DAY, "the box moved on a day");
  // told at least three times: waited for, as the box is (the rate is judged below over everything that arrived)
  await expect.poll(async () => ((await page.evaluate(() => Reflect.get(window, "__timechange"))) as { running: boolean }[]).filter((e) => e.running).length, { message: "told while time runs", timeout: 20_000 }).toBeGreaterThanOrEqual(3);
  const log = (await page.evaluate(() => Reflect.get(window, "__timechange"))) as { at: number; running: boolean }[];
  const running = log.filter((e) => e.running);
  for (let i = 1; i < running.length; i += 1) expect(running[i]!.at - running[i - 1]!.at, "no more than four a second").toBeGreaterThanOrEqual(240);
  // it holds: told once, at once
  await play(page).click();
  await page.waitForTimeout(300);
  const held = ((await page.evaluate(() => Reflect.get(window, "__timechange"))) as { at: number; running: boolean }[]).filter((e) => !e.running);
  expect(held.length, "told once when it holds").toBe(1);
});

test("riding along the Moon starts the clock and the date box keeps moving", async ({ page }) => {
  await open(page, `time=${START}&speed=0`);
  await expect(play(page)).toHaveAttribute("aria-pressed", "false");
  const before = await boxMs(page);
  await page.locator('[data-ride="Moon"]').dispatchEvent("click");
  await expect(play(page)).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await boxMs(page)) - before, { message: "the box moved on while riding the Moon", timeout: 8000 }).toBeGreaterThanOrEqual(3600_000);
  const later = await boxMs(page);
  await boxMovesOn(page, later, 1, "and keeps moving");
});

test("Play runs the clock from the date shown, Pause holds it, Back returns to the date chosen, and the address keeps it", async ({ page }) => {
  await open(page, `time=${START}`);
  const start = await boxMs(page);
  expect(Date.parse(START) - start, "the box shows the address's date").toBeLessThan(60_000);
  await page.waitForTimeout(400);
  expect(param(page, "play")).toBeNull();
  await page.waitForTimeout(1000);
  expect(await boxMs(page), "held until Play").toBe(start);

  await play(page).click();
  await inAddress(page, "play").toBe("on");
  await boxMovesOn(page, start, 3600_001, "Play moves the date on from the date shown");
  const running = await boxMs(page);

  await play(page).click();
  await expect(play(page)).toHaveAttribute("aria-pressed", "false");
  await page.waitForTimeout(400);
  const held = await boxMs(page);
  expect(held).toBeGreaterThanOrEqual(running);
  await page.waitForTimeout(1500);
  expect(await boxMs(page), "Pause holds the date").toBe(held);
  await inAddress(page, "play", "play leaves the address").toBeNull();
  await timeInAddress(page, "the date it stopped on is in the address").toBeGreaterThan(Date.parse(START));
  expect(Math.abs(Date.parse(param(page, "time")!) - held), "and is the date shown").toBeLessThan(120_000);

  // Play again goes on from there, and Back goes to the date the reader chose, not where Pause was
  await play(page).click();
  await boxMovesOn(page, held, 1800_001, "Play goes on from the date it was held on");
  await back(page).click();
  await expect(play(page)).toHaveAttribute("aria-pressed", "false");
  expect(await boxMs(page), "Back returns to the chosen date").toBe(start);
  await page.waitForTimeout(1000);
  expect(await boxMs(page), "and holds there").toBe(start);
  await timeInAddress(page, "the address has the chosen date").toBe(Date.parse(START));
  await inAddress(page, "play").toBeNull();
});

test("a date at 'now' is not jumped past: Play starts from the date shown", async ({ page }) => {
  await open(page, "speed=0");
  const shown = await boxMs(page);
  await page.waitForTimeout(1500);
  await speed(page, 1).click();
  await play(page).click();
  await page.waitForTimeout(1500);
  expect(Math.abs((await boxMs(page)) - shown), "real time from the date shown, not from a later now").toBeLessThan(5 * 60_000);
  await timeInAddress(page, "the moment it started from is in the address").toBeGreaterThan(0);
});

test("a speed is kept in the address and a reader who returns finds Play and the speed as they were", async ({ page }) => {
  await open(page, `time=${START}`);
  await speed(page, 86400).click();
  await play(page).click();
  await inAddress(page, "speed").toBe("86400");
  await inAddress(page, "play").toBe("on");
  await page.reload();
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 90_000 });
  await expect(play(page)).toHaveAttribute("aria-pressed", "true");
  await expect(speed(page, 86400)).toHaveAttribute("aria-pressed", "true");
});

test("links from before the bar: speed=0 stays held, a speed alone keeps running, and a date alone is shown as it says, held", async ({ page }) => {
  await open(page, `time=${START}&speed=0`);
  await expect(play(page)).toHaveAttribute("aria-pressed", "false");
  expect(await page.locator(SPACE).evaluate((el) => Reflect.get(el, "speed") as number)).toBe(0);
  const start = await boxMs(page);
  await page.waitForTimeout(800);
  expect(await boxMs(page)).toBe(start);

  await page.goto(`${PAGE}?look=space&center=-100,40&time=${START}&speed=86400`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 90_000 });
  await expect(play(page)).toHaveAttribute("aria-pressed", "true");
  await expect(speed(page, 86400)).toHaveAttribute("aria-pressed", "true");
  expect(await page.locator(SPACE).evaluate((el) => Reflect.get(el, "speed") as number)).toBe(86400);
  await expect.poll(async () => (await boxMs(page)) - start, { timeout: 5000 }).toBeGreaterThanOrEqual(DAY);

  await page.goto(`${PAGE}?look=space&center=-100,40&time=${START}`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 90_000 });
  await expect(play(page)).toHaveAttribute("aria-pressed", "false");
  expect(await page.locator(SPACE).evaluate((el) => Reflect.get(el, "speed") as number)).toBe(0);
});

test("a link that says nothing about the clock opens moving, from now, at the first speed where motion shows, and the date box runs with it (MODULES-815)", async ({ page }) => {
  const opened = Date.now();
  await open(page, "");
  await expect(play(page)).toHaveAttribute("aria-pressed", "true");
  await expect(speed(page, 3600)).toHaveAttribute("aria-pressed", "true");
  expect(await page.locator(SPACE).evaluate((el) => Reflect.get(el, "speed") as number), "the element's clock runs at an hour a second").toBe(3600);
  const before = await boxMs(page);
  // The clock has run at an hour a second since the page opened, so "from now" is from the moment it opened: no earlier
  // than then, and no later than an hour for every second since, with a minute of slack for the box's rounding.
  const ranFor = Date.now() - opened;
  expect(before, "from now, not a date before the page opened").toBeGreaterThan(opened - 60_000);
  expect(before, "from now, not further on than the clock could have run").toBeLessThan(opened + 3600 * ranFor + 60_000);
  await expect.poll(async () => (await boxMs(page)) - before, { message: "the date box ran on", timeout: 8000 }).toBeGreaterThanOrEqual(3600_000);
  await inAddress(page, "play").toBe("on");
  // the reader's Pause is written to the address and a link made then stays held
  await play(page).click();
  await expect(play(page)).toHaveAttribute("aria-pressed", "false");
  await timeInAddress(page, "the date it stopped on is in the address").toBeGreaterThan(before);
  await inAddress(page, "play").toBeNull();
  await page.reload();
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 90_000 });
  await expect(play(page)).toHaveAttribute("aria-pressed", "false");
  expect(await page.locator(SPACE).evaluate((el) => Reflect.get(el, "speed") as number), "held after a Pause").toBe(0);
});

test("a Pause with no date to keep (Now while held) is written as play=off, and a link made then opens held", async ({ page }) => {
  await open(page, "");
  await play(page).click();
  await expect(play(page)).toHaveAttribute("aria-pressed", "false");
  await page.locator("#now").click();
  await inAddress(page, "play").toBe("off");
  await inAddress(page, "time").toBeNull();
  await page.reload();
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 90_000 });
  await expect(play(page)).toHaveAttribute("aria-pressed", "false");
  expect(await page.locator(SPACE).evaluate((el) => Reflect.get(el, "speed") as number)).toBe(0);
  await play(page).click();
  await inAddress(page, "play").toBe("on");
});

test("the line and the thick globe turn on their own when the page opens", async ({ page }) => {
  for (const look of ["line", "thick"]) {
    await page.goto(`${PAGE}?look=${look}`);
    await page.locator("chikyu-earth").waitFor();
    const lon = (): Promise<number> => page.locator("kazoku-view-controls").evaluate((el) => (Reflect.get(el, "state") as { yaw: number }).yaw);
    expect(await page.locator("kazoku-view-controls").evaluate((el) => (Reflect.get(el, "state") as { turning: boolean }).turning), `the ${look} globe is turning on its own`).toBe(true);
    const start = await lon();
    await expect.poll(async () => Math.abs((await lon()) - start), { message: `the ${look} globe turned`, timeout: 8000 }).toBeGreaterThan(0.001);
  }
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
  // the view controls' own Auto-turn is on for a reader with no motion preference and asks for frames of its own: it is stopped, so what is left is the clock's
  await page.locator("kazoku-view-controls").evaluate((el) => (el as HTMLElement & { pause(): void }).pause());
  // a frame is already queued when Pause lands (the hold's own last draw, and one the controls' turn had asked for) and a loaded machine draws it late: rest is measured once it has landed
  await untilStill(page);
  const before = await readCounts(page);
  await page.waitForTimeout(3000);
  const after = await readCounts(page);
  expect(after.draws, "no draws while paused").toBe(before.draws);
  expect(after.rafRequests, "no frames asked for while paused").toBe(before.rafRequests);
});

test("the realistic Earth held at 'now' (play=off) tells the page when its clock steps, and once when it is given a date", async ({ page }) => {
  await page.addInitScript(() => {
    const log: { at: number; running: boolean; time: number }[] = [];
    Reflect.set(window, "__timechange", log);
    addEventListener("DOMContentLoaded", () => document.addEventListener("chikyu-timechange", (e) => log.push({ at: performance.now(), ...(e as CustomEvent<{ running: boolean; time: number }>).detail }), true));
  });
  await page.goto(`${PAGE}?look=realistic&center=-100,40&play=off`);
  await page.locator("chikyu-earth-realistic[data-state=live]").waitFor({ timeout: 90_000 });
  await page.locator("chikyu-earth-realistic").evaluate((el) => el.setAttribute("live-seconds", "1"));
  // told at least twice: wait for the second telling (a slow runner is late, not wrong); the rate is judged below over everything that arrived
  const told = (): Promise<number> => page.evaluate(() => (Reflect.get(window, "__timechange") as unknown[]).length);
  await expect.poll(told, { message: "told while it follows the clock", timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  const log = (await page.evaluate(() => Reflect.get(window, "__timechange"))) as { at: number; running: boolean; time: number }[];
  expect(log.every((e) => e.running && Math.abs(e.time - Date.now()) < 60_000)).toBe(true);
  // a one-second interval: one late tick makes the next gap short on a busy machine (CI saw 1,206 ms then 794 ms), so the rate is checked over the whole run, where a second timer or a double send would show
  const span = log.at(-1)!.at - log[0]!.at;
  expect(log.length - 1, `no more than once a second (${log.length} in ${Math.round(span)} ms)`).toBeLessThanOrEqual(Math.round(span / 1000));
  // the log is measured in the same turn of the page that gives the date: a one-second tick (running: true) between a count taken here and the date given there is the follow of the clock, not an extra telling (MODULES-1272)
  const mark = await page.evaluate(() => {
    const field = document.querySelector<HTMLInputElement>("#when")!;
    const mark = (Reflect.get(window, "__timechange") as unknown[]).length;
    field.value = "2026-06-21T12:00";
    field.dispatchEvent(new Event("change", { bubbles: true }));
    return mark;
  });
  await page.waitForTimeout(2500);
  const after = (await page.evaluate(() => Reflect.get(window, "__timechange"))) as { running: boolean }[];
  expect(after.slice(mark).map((e) => e.running), "once, held, and nothing more").toEqual([false]);
});

test.describe("a reader who prefers reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("gets Play left off but ready, even from an address that asks for it, and the reader's own press starts it", async ({ page }) => {
    await open(page, `time=${START}&play=on&speed=86400`);
    await expect(play(page)).toHaveAttribute("aria-pressed", "false");
    await expect(play(page)).toBeEnabled();
    expect(await page.locator(SPACE).evaluate((el) => Reflect.get(el, "speed") as number)).toBe(0);
    const before = await boxMs(page);
    await page.waitForTimeout(1200);
    expect(await boxMs(page)).toBe(before);
    await page.waitForTimeout(400);
    expect(param(page, "play")).toBeNull();
    // the reader's own press is what starts it, at the speed the address asked for
    await play(page).click();
    await expect(play(page)).toHaveAttribute("aria-pressed", "true");
    await boxMovesOn(page, before, 1800_000, "the reader's press starts the clock");
  });

  test("a link that says nothing opens still, with Play off (John has not decided yet whether it moves: OPEN_MOVING_WITH_REDUCED_MOTION in demo/demo.ts)", async ({ page }) => {
    await open(page, "");
    await expect(play(page)).toHaveAttribute("aria-pressed", "false");
    expect(await page.locator(SPACE).evaluate((el) => Reflect.get(el, "speed") as number)).toBe(0);
    const before = await boxMs(page);
    await page.waitForTimeout(1200);
    expect(await boxMs(page)).toBe(before);
  });
});
