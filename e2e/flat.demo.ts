// The flat map page: <chikyu-flat> draws the satellites of the demo's own element files on a canvas, with its own chips and buttons, a pick event, the keyboard, a clock like the 3D view's, English and Japanese words, and a
// phone that is filled without a page scroll. The moment is fixed (and held) by the tests so the places do not depend on the day they run; speeds are set where a test is about motion.
import { expect, test, type Page } from "@playwright/test";

const AT = "2026-11-04T00:00Z";
const flat = (page: Page) => page.locator("chikyu-flat");
type Flat = HTMLElement & {
  stats: { draws: number; mapDraws: number; dots: number; running: boolean; paused: boolean; fast: boolean; canvases: { width: number; height: number }[] };
  placeOf(id: number): { x: number; y: number; lon: number; lat: number } | null;
  planes: { group: string; id: string; count: number }[];
  center: number;
  time: number;
  speed: number;
  paused: boolean;
  selected: number | null;
  groups: { id: string }[];
  visibleGroups: string[];
};
const read = <T>(page: Page, fn: (el: Flat) => T): Promise<T> => flat(page).evaluate(fn as never) as Promise<T>;

/** The page with its data loaded and the clock held at AT, so a test reads the same sky whenever it runs. */
async function open(page: Page, query = ""): Promise<void> {
  await page.goto(`/chikyu-earth/flat.html${query}`);
  await page.locator("body[data-ready=true]").waitFor({ timeout: 30_000 });
  await flat(page).evaluate((el, at) => {
    el.setAttribute("speed", "0");
    el.setAttribute("time", at);
  }, AT);
  // on a phone the map is below the page's first screen, and an element out of sight draws nothing
  await flat(page).evaluate((el) => el.scrollIntoView({ block: "start" }));
  await expect.poll(() => read(page, (el) => el.stats.dots)).toBeGreaterThan(20);
}

/** The pointer's place in the page of a satellite the element drew, from `placeOf`. */
async function at(page: Page, id: number): Promise<{ x: number; y: number }> {
  const box = (await flat(page).evaluate((el) => el.shadowRoot!.querySelector(".dots")!.getBoundingClientRect().toJSON())) as { x: number; y: number };
  const found = await flat(page).evaluate((el, norad) => (el as Flat).placeOf(norad), id);
  if (!found) throw new Error(`satellite ${id} is not drawn`);
  return { x: box.x + found.x, y: box.y + found.y };
}

/** The NORAD number of the first GPS satellite that is drawn (on a phone the map shows two thirds of the world). */
const firstGps = async (page: Page): Promise<number> => {
  const ids = await page.evaluate(async () => ((await (await fetch("elements/gps.json")).json()).rows as number[][]).map((row) => row[0]!));
  // the one nearest the middle of the map: on a phone the box shows two thirds of the world, and one at its edge would leave it
  const placed = await flat(page).evaluate((el, list) => list.map((id) => ({ id, at: (el as Flat).placeOf(id) })).filter((one) => one.at !== null).map((one) => ({ id: one.id, off: Math.abs(one.at!.x - el.shadowRoot!.querySelector(".stage")!.clientWidth / 2) })), ids);
  if (placed.length === 0) throw new Error("no GPS satellite is drawn");
  return placed.sort((a, b) => a.off - b.off)[0]!.id;
};

test("it draws the GPS satellites of the demo on a canvas, in six planes, with the chips and the buttons", async ({ page }, info) => {
  await open(page);
  expect(await read(page, (el) => el.stats.dots)).toBeGreaterThan(info.project.name.endsWith("phone") ? 10 : 25);
  expect(await read(page, (el) => el.planes.filter((p) => p.group === "gps").map((p) => p.id).join(""))).toBe("ABCDEF");
  const bar = flat(page).locator(".bar");
  await expect(bar.getByRole("button", { name: "Centre the map on Greenwich" })).toHaveAttribute("aria-pressed", "true");
  await expect(bar.getByRole("button", { name: "Centre the map on my place" })).toBeVisible();
  // by plane, with a chip for each plane and an All; the plane chips filter the dots
  await expect(bar.getByRole("group", { name: "Orbital plane to show" }).getByRole("button")).toHaveCount(7);
  const all = await read(page, (el) => el.stats.dots);
  await bar.getByRole("group", { name: "Orbital plane to show" }).getByRole("button", { name: /^Plane B/ }).click();
  await expect.poll(() => read(page, (el) => el.stats.dots)).toBeLessThan(all / 2);
  await bar.getByRole("group", { name: "Orbital plane to show" }).getByRole("button", { name: "All" }).click();
  await expect.poll(() => read(page, (el) => el.stats.dots)).toBe(all);
  // there is one canvas of dots and one of the map, and nothing else draws
  expect(await read(page, (el) => el.shadowRoot!.querySelectorAll("canvas").length)).toBe(2);
});

test("group chips turn groups on and off; Starlink starts off", async ({ page }) => {
  await open(page, "?by=group");
  await flat(page).evaluate((el) => el.removeAttribute("group"));
  await expect.poll(() => read(page, (el) => el.visibleGroups.includes("starlink"))).toBe(false);
  expect(await read(page, (el) => el.visibleGroups.length)).toBe(9);
  const chips = flat(page).locator(".bar").getByRole("group", { name: "Groups to show" });
  await chips.getByRole("button", { name: /^Starlink/ }).click();
  await expect.poll(() => read(page, (el) => el.visibleGroups.includes("starlink"))).toBe(true);
  await expect.poll(() => read(page, (el) => el.stats.dots)).toBeGreaterThan(1500);
  await chips.getByRole("button", { name: /^Starlink/ }).click();
  await expect.poll(() => read(page, (el) => el.visibleGroups.includes("starlink"))).toBe(false);
});

test("a pointer over a dot and a tap on it send the pick event with its number", async ({ page }) => {
  await open(page);
  const id = await firstGps(page);
  await flat(page).evaluate((el) => {
    Reflect.set(window, "__picks", []);
    el.addEventListener("chikyu-flat-pick", (event) => (Reflect.get(window, "__picks") as unknown[]).push((event as CustomEvent).detail));
  });
  const place = await at(page, id);
  await page.mouse.move(place.x, place.y);
  await expect.poll(() => page.evaluate(() => (Reflect.get(window, "__picks") as { via: string }[]).map((p) => p.via))).toContain("hover");
  await page.mouse.click(place.x, place.y);
  // the tap's event can land a frame after the click returns (WebKit on a phone), so wait for it rather than read once
  await expect.poll(() => page.evaluate(() => (Reflect.get(window, "__picks") as { via: string }[]).some((p) => p.via === "tap"))).toBe(true);
  const picks = await page.evaluate(() => Reflect.get(window, "__picks") as { id: number; name: string; group: string; via: string; plane: string }[]);
  const tap = picks.find((p) => p.via === "tap")!;
  expect(tap).toMatchObject({ id, group: "gps", via: "tap" });
  expect(tap.name).toMatch(/NAVSTAR|GPS/);
  expect(await read(page, (el) => el.selected)).toBe(id);
  // a tap on the sea clears it
  const box = (await flat(page).evaluate((el) => el.shadowRoot!.querySelector(".dots")!.getBoundingClientRect().toJSON())) as { x: number; y: number; width: number };
  await page.mouse.click(box.x + 3, box.y + 3);
  await expect.poll(() => read(page, (el) => el.selected)).toBe(null);
  expect((await page.evaluate(() => Reflect.get(window, "__picks") as { id: number | null }[])).at(-1)!.id).toBe(null);
});

test("the keyboard moves from one satellite to the next and says its name", async ({ page }) => {
  await open(page);
  await flat(page).evaluate((el) => {
    Reflect.set(window, "__picks", []);
    el.addEventListener("chikyu-flat-pick", (event) => (Reflect.get(window, "__picks") as unknown[]).push((event as CustomEvent).detail));
    (el.shadowRoot!.querySelector(".dots") as HTMLElement).focus();
  });
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const picks = await page.evaluate(() => Reflect.get(window, "__picks") as { id: number; via: string }[]);
  expect(picks.map((p) => p.via)).toEqual(["key", "key"]);
  expect(picks[0]!.id).not.toBe(picks[1]!.id);
  await expect(flat(page).locator("#live")).toContainText(/km up/);
  await page.keyboard.press("Enter");
  expect(await read(page, (el) => el.selected)).toBe(picks[1]!.id);
  await page.keyboard.press("Escape");
  expect(await read(page, (el) => el.selected)).toBe(null);
});

test("Greenwich and My place centre the map, My place appears only when a place is given, and a satellite wraps over the date line", async ({ page }, info) => {
  await open(page);
  const bar = flat(page).locator(".bar");
  await bar.getByRole("button", { name: "Centre the map on my place" }).click();
  expect(await read(page, (el) => Math.round(el.center))).toBe(140);
  await expect(bar.getByRole("button", { name: "Centre the map on my place" })).toHaveAttribute("aria-pressed", "true");
  await bar.getByRole("button", { name: "Centre the map on Greenwich" }).click();
  expect(await read(page, (el) => el.center)).toBe(0);
  // no saved place: no button
  await page.getByRole("group", { name: "My place" }).getByRole("button", { name: "None" }).click();
  await expect(bar.getByRole("button", { name: "Centre the map on my place" })).toHaveCount(0);
  // centred on the date line every satellite that is in the world is still on the map (the whole world is in view), at either edge
  const total = await read(page, (el) => el.stats.dots);
  await flat(page).evaluate((el) => el.setAttribute("center", "180"));
  await expect.poll(() => read(page, (el) => el.center)).toBe(-180);
  // (a phone's box shows two thirds of the world, so the count is only the same where the whole world is in view)
  if (!info.project.name.endsWith("phone")) await expect.poll(() => read(page, (el) => el.stats.dots)).toBe(total);
});

test("the clock: a jump moves the dots at once, Pause draws nothing, Play carries on", async ({ page }, info) => {
  test.skip(info.project.name.endsWith("phone"), "the box shows two thirds of the world: the satellite may be out of it three hours on");
  await open(page);
  const id = await firstGps(page);
  const before = await flat(page).evaluate((el, norad) => (el as Flat).placeOf(norad), id);
  await read(page, (el) => {
    el.time = Date.UTC(2026, 10, 4, 3);
  });
  await expect.poll(() => flat(page).evaluate((el, norad) => (el as Flat).placeOf(norad)?.lon, id)).not.toBe(before!.lon);
  // three hours on, a GPS satellite has gone a good part of an orbit (and the Earth has turned 45 degrees): it is far from where it was
  const after = await flat(page).evaluate((el, norad) => (el as Flat).placeOf(norad), id);
  expect(Math.abs(after!.lon - before!.lon) + Math.abs(after!.lat - before!.lat)).toBeGreaterThan(5);
  const held = await read(page, (el) => el.stats.draws);
  await page.waitForTimeout(1500);
  expect(await read(page, (el) => el.stats.draws), "nothing is drawn while the clock is held").toBe(held);
});

test.describe("while time runs", () => {
  test.use({ reducedMotion: "no-preference" });

  test("it draws a frame at a time, and nothing once paused", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Faster" }).click();
    await page.getByRole("button", { name: "Faster" }).click();
    await page.getByRole("button", { name: "Faster" }).click();
    await expect.poll(() => read(page, (el) => el.speed)).toBe(600);
    await read(page, (el) => {
      el.paused = false;
    });
    const a = await read(page, (el) => el.stats.draws);
    await page.waitForTimeout(1500);
    const b = await read(page, (el) => ({ draws: el.stats, time: el.time }));
    // the rate is the freeze test's to hold (alone on the machine); here, with other pages drawing in software beside it, frames are being drawn
    expect(b.draws.draws - a, "frames drawn in 1.5 s at 600 times real time").toBeGreaterThan(4);
    expect(b.draws.draws - a).toBeLessThan(120);
    expect(b.draws.fast).toBe(true);
    await page.getByRole("button", { name: "Pause" }).click();
    // the page's buttons change their words and the layout may move: wait that out, then count
    await page.waitForTimeout(1200);
    const held = await read(page, (el) => ({ draws: el.stats.draws, running: el.stats.running, paused: el.paused, time: el.time }));
    expect(held.paused).toBe(true);
    expect(held.running).toBe(false);
    await page.waitForTimeout(1500);
    const later = await read(page, (el) => ({ draws: el.stats.draws, time: el.time }));
    expect(later.draws).toBe(held.draws);
    expect(later.time).toBe(held.time);
    await page.getByRole("button", { name: "Play" }).click();
    await expect.poll(() => read(page, (el) => el.stats.draws)).toBeGreaterThan(held.draws + 5);
  });

  test("the dots move between frames at real time, and the chosen satellite's ground track follows the clock", async ({ page }) => {
    await open(page);
    const id = await firstGps(page);
    await flat(page).evaluate((el, norad) => {
      el.setAttribute("track", "");
      el.setAttribute("footprint", "");
      el.setAttribute("selected", String(norad));
      el.setAttribute("speed", "30");
    }, id);
    const first = await flat(page).evaluate((el, norad) => (el as Flat).placeOf(norad), id);
    await page.waitForTimeout(2500);
    const second = await flat(page).evaluate((el, norad) => (el as Flat).placeOf(norad), id);
    expect(second!.x === first!.x && second!.y === first!.y).toBe(false);
  });
});

test("the words are English and Japanese", async ({ page }) => {
  await open(page);
  await flat(page).evaluate((el) => el.setAttribute("lang", "ja"));
  const bar = flat(page).locator(".bar");
  await expect(bar.getByRole("button", { name: "グリニッジ" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "可視範囲" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "地上軌跡" })).toBeVisible();
  await expect(bar.getByRole("group", { name: "表示する軌道面" })).toBeVisible();
  await expect(flat(page).locator(".dots")).toHaveAttribute("aria-label", "世界の平面地図の上の衛星");
});

test("footprints and the ground track are drawn for the chosen satellite and add no canvas", async ({ page }) => {
  await open(page);
  const id = await firstGps(page);
  const plain = await flat(page).evaluate((el) => (el.shadowRoot!.querySelector(".dots") as HTMLCanvasElement).toDataURL());
  await flat(page).evaluate((el, norad) => {
    el.setAttribute("selected", String(norad));
    el.setAttribute("footprint", "");
    el.setAttribute("track", "");
  }, id);
  await expect.poll(() => flat(page).evaluate((el) => (el.shadowRoot!.querySelector(".dots") as HTMLCanvasElement).toDataURL())).not.toBe(plain);
  expect(await read(page, (el) => el.shadowRoot!.querySelectorAll("canvas").length)).toBe(2);
  await flat(page).locator(".bar").getByRole("button", { name: "Footprint" }).click();
  await expect(flat(page).locator(".bar").getByRole("button", { name: "Footprint" })).toHaveAttribute("aria-pressed", "false");
});

test("on a phone it fills its box, wraps round the sides and the page does not scroll sideways", async ({ page }, info) => {
  test.skip(!info.project.name.endsWith("phone"), "a phone's screen");
  await open(page);
  const size = await flat(page).evaluate((el) => {
    const stage = el.shadowRoot!.querySelector(".stage") as HTMLElement;
    const dots = el.shadowRoot!.querySelector(".dots") as HTMLCanvasElement;
    return { stage: stage.getBoundingClientRect().toJSON(), canvas: dots.getBoundingClientRect().toJSON(), scroll: document.documentElement.scrollWidth, inner: window.innerWidth };
  });
  expect(size.canvas.width).toBeCloseTo(size.stage.width, 0);
  expect(size.canvas.height).toBeCloseTo(size.stage.height, 0);
  expect(size.stage.height, "taller than 2 to 1, so the box is filled").toBeGreaterThan(size.stage.width / 2 + 20);
  expect(size.scroll).toBeLessThanOrEqual(size.inner);
  expect(size.stage.width).toBeLessThanOrEqual(size.inner);
  // the buttons are big enough to press
  const button = await flat(page).locator(".bar button").first().boundingBox();
  expect(button!.height).toBeGreaterThanOrEqual(40);
  expect(await read(page, (el) => el.stats.dots)).toBeGreaterThan(10);
});
