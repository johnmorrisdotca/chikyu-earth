// The space view in a real browser: the right things in the right places, and the same performance budget as the Earth from space.
import { expect, test, type Page } from "@playwright/test";
import { COUNT_SCRIPT, readCounts, alive, counts, pixelAt, settle } from "./gl.ts";

test.describe.configure({ mode: "serial" });

const SPACE = "chikyu-space";
interface SpaceStats {
  state: string;
  draws: number;
  contexts: number;
  canvas: { width: number; height: number; pixels: number };
  tiers: Record<string, number>;
  distance: number;
  time: number;
  lookups: number;
}
const statsOf = (page: Page): Promise<SpaceStats> => page.locator(SPACE).evaluate((el) => Reflect.get(el, "stats") as SpaceStats);
const NOV2 = "2026-11-02T14:00Z";

async function open(page: Page, query = `time=${NOV2}&speed=0&center=-100,40`): Promise<void> {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/?look=space&${query}`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor();
  await expect.poll(async () => (await statsOf(page)).draws).toBeGreaterThan(0);
  await settle(page);
}

// a click that does not scroll the page: a view scrolled out of sight is rightly not drawn
const jump = (page: Page, name: string): Promise<void> => page.getByRole("group", { name: "Go to" }).getByRole("button", { name, exact: true }).dispatchEvent("click");

test("the Earth is lit from where the Sun is: its east side by day at 14:00 UTC over North America, in one context", async ({ page }) => {
  await open(page);
  expect((await readCounts(page)).contexts).toBe(1);
  const left = await pixelAt(page, page.locator(SPACE), 0.3, 0.5);
  const right = await pixelAt(page, page.locator(SPACE), 0.7, 0.5);
  const sum = (c: number[]): number => c[0]! + c[1]! + c[2]!;
  expect(sum(right), "the east side is in sunlight").toBeGreaterThan(sum(left) + 60);
});

test("the Moon is drawn half lit, and the Sun, the Moon and the planets are named", async ({ page }) => {
  await open(page);
  await jump(page, "Moon");
  await settle(page, 1200);
  const names = await page.locator(SPACE).evaluate((el) => [...el.shadowRoot!.querySelectorAll(".sp-label:not([hidden])")].map((n) => n.textContent));
  expect(names).toEqual(expect.arrayContaining(["Earth", "Moon"]));
  await jump(page, "Solar system");
  await settle(page, 1200);
  const named = (): Promise<(string | null)[]> => page.locator(SPACE).evaluate((el) => [...el.shadowRoot!.querySelectorAll(".sp-label:not([hidden])")].map((n) => n.textContent));
  // the planets are drawn in software, shaded: the labels follow the draw, which may take a while
  await expect.poll(named, { timeout: 20_000 }).toEqual(expect.arrayContaining(["Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Neptune", "Pluto"]));
});

test("paused, nothing is drawn and no frame is asked for; at real time, at most one draw in 6 seconds", async ({ page }) => {
  await open(page);
  const before = await counts(page);
  await page.waitForTimeout(4000);
  const after = await counts(page);
  expect(after.draws).toBe(before.draws);
  expect(after.rafRequests).toBe(before.rafRequests);
  await page.locator(SPACE).evaluate((el) => Reflect.set(el, "speed", 1));
  await settle(page, 500);
  const real = await counts(page);
  await page.waitForTimeout(6000);
  const later = await counts(page);
  console.log(`real time: ${later.draws - real.draws} draw calls in 6 s`);
  expect(later.draws - real.draws).toBeLessThanOrEqual(6);
});

test("a day a second: time runs at that rate, at most 30 draws a second, a lookup of the ephemeris about once a second", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "1 day a second" }).click();
  await settle(page, 500);
  const s0 = await statsOf(page);
  const t0 = Date.now();
  await page.waitForTimeout(5000);
  const s1 = await statsOf(page);
  const seconds = (Date.now() - t0) / 1000;
  const perSecond = (s1.time - s0.time) / 86_400_000 / seconds;
  const draws = (s1.draws - s0.draws) / seconds;
  const lookups = (s1.lookups - s0.lookups) / seconds;
  console.log(`1 day a second: ${perSecond.toFixed(2)} days a second, ${draws.toFixed(1)} draws a second, ${lookups.toFixed(2)} ephemeris lookups a second`);
  expect(perSecond).toBeGreaterThan(0.8);
  expect(perSecond).toBeLessThan(1.25);
  expect(draws).toBeLessThanOrEqual(31);
  expect(lookups, "lookups come in pairs, once a game-second span").toBeLessThanOrEqual(2.6);
});

test("the pictures follow the zoom and go back after it, and nothing is held twice", async ({ page }) => {
  await open(page);
  // three makes one empty texture of its own the first time a body with no picture is drawn: look at the planets once before counting.
  await jump(page, "Solar system");
  await settle(page, 1200);
  await jump(page, "Earth");
  await settle(page, 1200);
  const base = alive(await counts(page), "Texture");
  await page.locator("kazoku-view-controls").evaluate((el) => (Reflect.get(el, "controller") as { set(v: unknown, f: boolean, r: string): void }).set({ zoom: 2.5 }, true, "test"));
  await expect.poll(async () => (await statsOf(page)).tiers["day"] ?? 0).toBeGreaterThanOrEqual(2048);
  await settle(page, 1200);
  expect(alive(await counts(page), "Texture")).toBeLessThanOrEqual(base + 5);
  await jump(page, "Solar system");
  await expect.poll(async () => (await statsOf(page)).tiers["day"] ?? 1024, { timeout: 12_000 }).toBe(1024);
  await settle(page, 2000);
  expect(alive(await counts(page), "Texture"), "the larger pictures are freed again").toBe(base);
});

test("out of sight or hidden, a game clock running at a day a second draws nothing", async ({ page }) => {
  await open(page, `time=${NOV2}&speed=86400&center=-100,40`);
  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.style.height = "4000px";
    document.body.prepend(spacer);
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
  const before = await counts(page);
  await page.waitForTimeout(2500);
  const after = await counts(page);
  expect(after.draws).toBe(before.draws);
  expect(after.rafRequests).toBe(before.rafRequests);
});

test("taking the element away frees what it held", async ({ page }) => {
  await open(page);
  await jump(page, "Moon");
  await page.getByRole("button", { name: "Line" }).click();
  await expect(page.locator(SPACE)).toHaveCount(0);
  await page.waitForTimeout(3000);
  const gone = await counts(page);
  expect(alive(gone, "Texture")).toBeLessThanOrEqual(4);
  expect(alive(gone, "Buffer")).toBe(0);
  expect(alive(gone, "Program")).toBe(0);
});

test("a lost context is recovered", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  const draws = (await statsOf(page)).draws;
  await page.locator(SPACE).evaluate((el) => {
    const ext = (el.shadowRoot!.querySelector("canvas")!.getContext("webgl2") as WebGL2RenderingContext).getExtension("WEBGL_lose_context")!;
    Reflect.set(window, "__lose", ext);
    ext.loseContext();
  });
  await expect(page.locator(SPACE)).toHaveAttribute("data-state", "lost");
  await page.evaluate(() => (Reflect.get(window, "__lose") as { restoreContext(): void }).restoreContext());
  await expect(page.locator(SPACE)).toHaveAttribute("data-state", "live");
  await page.locator(SPACE).evaluate((el) => Reflect.set(el, "scale", "true"));
  await expect.poll(async () => (await statsOf(page)).draws).toBeGreaterThan(draws);
  expect(errors).toEqual([]);
});

test("a body can be looked at: the camera goes to it, and choosing its name by keyboard does the same and says how big and far it is", async ({ page }) => {
  await open(page);
  await page.getByRole("group", { name: "Look at" }).getByRole("button", { name: "Jupiter", exact: true }).click();
  await expect.poll(async () => (await statsOf(page)).distance).toBeCloseTo(3.4 * 1.8, 0);
  await expect(page.locator("#body-info")).toContainText("Jupiter: radius 69,911 km");
  await jump(page, "Solar system");
  await settle(page, 800);
  await page.locator(SPACE).evaluate((el) => (el.shadowRoot!.querySelector('button.sp-label[data-body="Mars"]') as HTMLButtonElement).focus());
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await statsOf(page)).distance).toBeCloseTo(3.4 * 0.6, 0);
  await expect(page.locator("#body-info")).toContainText("Mars: radius 3,390 km");
});

async function moonPlace(page: Page): Promise<{ x: number; y: number }> {
  await open(page);
  await jump(page, "Moon");
  await settle(page, 1000);
  await page.locator(SPACE).scrollIntoViewIfNeeded();
  await settle(page, 300);
  return page.locator(SPACE).evaluate((el) => {
    const label = el.shadowRoot!.querySelector('button.sp-label[data-body="Moon"]') as HTMLElement;
    const box = el.getBoundingClientRect();
    const m = /translate\((-?\d+)px,\s*(-?\d+)px\)/.exec(label.style.transform)!;
    return { x: box.left + Number(m[1]) - 14, y: box.top + Number(m[2]) + 8 };
  });
}

test("pressing on a planet chooses it", async ({ page }) => {
  const place = await moonPlace(page);
  await page.mouse.click(place.x, place.y);
  await expect(page.locator("#body-info")).toContainText("Moon: radius 1,737 km");
});

test("a drag that turns the view does not choose the body it began on", async ({ page }) => {
  const place = await moonPlace(page);
  await page.mouse.move(place.x, place.y);
  await page.mouse.down();
  await page.mouse.move(place.x + 40, place.y + 5, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator("#body-info")).toBeHidden();
});

test.describe("the controls' Auto-turn", () => {
  test.use({ reducedMotion: "no-preference" });

  test("at the Earth's own rate it moves nothing a person can see in seconds, so it draws about once in half a minute, not thirty times a second", async ({ page }) => {
    await open(page);
    await page.locator("kazoku-view-controls").evaluate((el) => {
      const controls = el as HTMLElement & { state: { turning: boolean }; play(): void };
      if (!controls.state.turning) controls.play();
    });
    await settle(page, 800);
    const before = await statsOf(page);
    const c0 = await counts(page);
    await page.waitForTimeout(8000);
    const after = await statsOf(page);
    const c1 = await counts(page);
    console.log(`Auto-turn in the space view: ${after.draws - before.draws} draws in 8 s (the page asked for ${c1.rafCallbacks - c0.rafCallbacks} animation frames)`);
    expect(c1.rafCallbacks - c0.rafCallbacks, "the controls themselves are turning").toBeGreaterThan(100);
    expect(after.draws - before.draws).toBeLessThanOrEqual(1);
  });
});

interface Bodies {
  bodies: { look: string; painted: number; moons: number };
  contexts: number;
}
const bodiesOf = (page: Page): Promise<Bodies> => page.locator(SPACE).evaluate((el) => Reflect.get(el, "stats") as Bodies);

test("the Sun, the planets and Pluto are drawn by wakusei-planets, painted or realistic, and a plain sphere is one click away", async ({ page }) => {
  await open(page, `time=${NOV2}&speed=0&center=-100,40&bodies=painted`);
  await expect.poll(async () => (await bodiesOf(page)).bodies.painted, { timeout: 30_000 }).toBe(9);
  expect((await bodiesOf(page)).bodies.look).toBe("painted");
  expect((await readCounts(page)).contexts).toBe(1);
  await page.getByRole("group", { name: "Planets", exact: true }).getByRole("button", { name: "Shaded", exact: true }).dispatchEvent("click");
  await expect.poll(async () => (await bodiesOf(page)).bodies.look).toBe("realistic");
  await page.getByRole("group", { name: "Planets", exact: true }).getByRole("button", { name: "Plain", exact: true }).dispatchEvent("click");
  await expect.poll(async () => (await bodiesOf(page)).bodies.look).toBe("plain");
  await expect.poll(async () => (await bodiesOf(page)).bodies.painted, { timeout: 15_000 }).toBe(9);
});

test("zoomed in on Jupiter its moons are there, at the places the ephemeris gives, and Pluto is a body to look at", async ({ page }) => {
  await open(page, `time=${NOV2}&speed=0&center=-100,40&bodies=realistic`);
  await page.getByRole("group", { name: "Go to" }).getByRole("button", { name: "Jupiter and its moons", exact: true }).dispatchEvent("click");
  await expect.poll(async () => (await bodiesOf(page)).bodies.moons, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  await page.getByRole("group", { name: "Look at" }).getByRole("button", { name: "Pluto", exact: true }).dispatchEvent("click");
  await expect.poll(async () => (await statsOf(page)).distance, { timeout: 15_000 }).toBeGreaterThan(0);
  expect((await bodiesOf(page)).contexts).toBe(1);
});

/** The share of the pixels of the Earth's disc (the middle of the view) that are not nearly black. */
const brightShare = async (page: Page): Promise<number> => {
  const png = (await page.locator(SPACE).screenshot()).toString("base64");
  return page.evaluate(async (data) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    const size = Math.floor(bitmap.width * 0.4);
    const { data: px } = context.getImageData(Math.floor((bitmap.width - size) / 2), Math.floor((bitmap.height - size) / 2), size, size);
    let bright = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i]! + px[i + 1]! + px[i + 2]! > 60) bright += 1;
    return bright / (px.length / 4);
  }, png);
};

test("the night side: the true Sun leaves it dark, Always lit and Night boost show the land", async ({ page }) => {
  // 14:00 UTC on 2 November: it is night over the Pacific and Asia (the Earth fills the middle of the view)
  await open(page, `time=${NOV2}&speed=0&center=140,10`);
  const dark = await brightShare(page);
  expect(dark, "the true Sun: the night side is dark").toBeLessThan(0.25);
  const choose = (name: string): Promise<void> => page.getByRole("group", { name: "Light", exact: true }).getByRole("button", { name, exact: true }).dispatchEvent("click");
  await choose("Always lit");
  await expect.poll(() => brightShare(page), { timeout: 20_000, message: "Always lit shows the surface" }).toBeGreaterThan(0.6);
  await choose("Night boost");
  await expect.poll(() => brightShare(page), { timeout: 20_000, message: "Night boost raises the night side" }).toBeGreaterThan(dark + 0.1);
  await expect(page).toHaveURL(/light=boost/);
  await choose("Sun");
  await expect.poll(() => brightShare(page), { timeout: 20_000 }).toBeLessThan(0.25);
  await expect(page).not.toHaveURL(/[?&]light=/);
});

test("the realistic Earth takes the same lighting from its attribute and the address", async ({ page }) => {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/embed.html?look=realistic&time=${NOV2}&center=140,10&light=lit`);
  await page.locator("chikyu-earth-realistic[data-state=live]").waitFor({ timeout: 60_000 });
  await settle(page, 1500);
  const png = (await page.locator("chikyu-earth-realistic").screenshot()).toString("base64");
  const share = await page.evaluate(async (data) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    const { data: px } = context.getImageData(Math.floor(bitmap.width * 0.3), Math.floor(bitmap.height * 0.3), Math.floor(bitmap.width * 0.4), Math.floor(bitmap.height * 0.4));
    let bright = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i]! + px[i + 1]! + px[i + 2]! > 60) bright += 1;
    return bright / (px.length / 4);
  }, png);
  expect(share, "always lit: the night side of the realistic Earth is not black").toBeGreaterThan(0.6);
});
