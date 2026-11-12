// The space view full screen and with the planets' pictures (MODULES-848, 850): <chikyu-space immersive> fills the window in any shape, a plain wheel zooms out to the Moon and back, a drag anywhere turns
// it, and the family's gesture check is green (the space view has no pan, as in the panel); the Sun, the planets and the Moon are drawn from wakusei-planets' pictures in the default look, Mars takes its finer tiles close up, and the credit is on the screen.
import { checkGestures } from "@johnmorrisdotca/kazoku-ui/testing";
import { expect, test, type Page } from "@playwright/test";
import { COUNT_SCRIPT, readCounts, settle } from "./gl.ts";
import { routePlanetTiles } from "./tiles-fixture.ts";

const SPACE = "chikyu-space";
const NOV10 = "2026-11-10T04:00Z";
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface Stats {
  draws: number;
  canvas: { width: number; height: number; pixels: number };
  bodies: { look: string; painted: number; moons: number; moon: boolean; tiles: number };
}
const statsOf = (page: Page): Promise<Stats> => page.locator(SPACE).evaluate((el) => Reflect.get(el, "stats") as Stats);
const barState = (page: Page): Promise<{ yaw: number; zoom: number }> => page.locator("kazoku-view-controls").evaluate((el) => Reflect.get(el, "state") as { yaw: number; zoom: number });

async function open(page: Page, query = ""): Promise<void> {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/fullscreen.html?look=space&time=${NOV10}&speed=0${query}`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => (await statsOf(page)).draws).toBeGreaterThan(0);
  await settle(page);
}

for (const [width, height] of [
  [1440, 900],
  [390, 844],
  [2400, 700],
] as const) {
  test(`full screen at ${width} by ${height}: the element and its canvas are the whole window`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await open(page);
    const element = await page.locator(SPACE).evaluate((el) => el.getBoundingClientRect().toJSON() as Box);
    const canvas = await page.locator(SPACE).evaluate((el) => el.shadowRoot!.querySelector("canvas")!.getBoundingClientRect().toJSON() as Box);
    for (const box of [element, canvas]) for (const [key, want] of [["x", 0], ["y", 0], ["width", width], ["height", height]] as const) expect(Math.abs(box[key] - want), `${key}`).toBeLessThanOrEqual(1);
    expect((await statsOf(page)).canvas.pixels).toBeLessThanOrEqual(6_000_000);
  });
}

test("a plain wheel zooms out until the Moon is in view and back in, and never scrolls the page", async ({ page }) => {
  await open(page);
  const moonInView = (): Promise<boolean> =>
    page.locator(SPACE).evaluate((el) => {
      const label = el.shadowRoot!.querySelector<HTMLElement>('.sp-label[data-body="Moon"]');
      if (!label || label.hidden) return false;
      const box = label.getBoundingClientRect();
      return box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight;
    });
  await page.mouse.move(640, 450);
  const start = (await barState(page)).zoom;
  for (let i = 0; i < 12 && !(await moonInView()); i += 1) {
    const before = (await barState(page)).zoom;
    await page.mouse.wheel(0, 300);
    await expect.poll(async () => (await barState(page)).zoom).toBeLessThan(before);
    await settle(page, 300);
  }
  expect(await moonInView(), "the Moon is in view").toBe(true);
  expect((await barState(page)).zoom).toBeLessThan(start);
  for (let i = 0; i < 20 && (await barState(page)).zoom < start; i += 1) {
    const before = (await barState(page)).zoom;
    await page.mouse.wheel(0, -300);
    await expect.poll(async () => (await barState(page)).zoom).toBeGreaterThan(before);
  }
  expect((await barState(page)).zoom).toBeGreaterThanOrEqual(start);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("a drag anywhere on the full-screen space view turns it round the Earth", async ({ page }) => {
  await open(page);
  const before = (await barState(page)).yaw;
  await page.mouse.move(40, 200);
  await page.mouse.down();
  await page.mouse.move(240, 200, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await barState(page)).yaw).not.toBe(before);
});

test("the family's gesture check is green on the full-screen space view", async ({ page }) => {
  // thirteen gestures, each with screenshots drawn in software GL
  test.setTimeout(240_000);
  await open(page);
  // as in the demo's panel (gestures.gl.ts) the space view has no pan, and full screen the plain wheel zooms
  const noPan = "the space view has no pan: the camera looks at the chosen body, and Look at, Go to and Ride along move it";
  const lacks = { "wheel-pan": "in a full-screen view the plain wheel zooms (the immersive mode), and the space view has no pan", "ctrl-drag-pan": noPan, "space-drag-pan": noPan, "middle-drag-pan": noPan, "right-drag-pan": noPan, "touch-pan": noPan, picture: "the picture check follows the moves, and this view has none" };
  const report = await checkGestures(page, SPACE, { lacks });
  expect(report.filter((r) => r.result === "lacks").map((r) => r.gesture)).toEqual(Object.keys(lacks));
});

test("in the default look the planets, the Sun and the Moon are drawn from their pictures, and the credit is on the screen", async ({ page }) => {
  const pictures = new Set<string>();
  page.on("request", (request) => {
    const match = /\/planets\/(\w+)-\d+\.webp$/.exec(request.url());
    if (match) pictures.add(match[1]!);
  });
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/?look=space&time=${NOV10}&speed=0&center=-100,40`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await expect.poll(async () => (await statsOf(page)).bodies.painted, { timeout: 30_000 }).toBe(9);
  expect((await statsOf(page)).bodies.look).toBe("realistic");
  await expect.poll(async () => (await statsOf(page)).bodies.moon, { timeout: 30_000, message: "the Moon is the painter's" }).toBe(true);
  for (const body of ["sun", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto", "moon"]) await expect.poll(() => pictures.has(body), { timeout: 30_000, message: `${body}'s picture` }).toBe(true);
  await expect(page.locator(`${SPACE} #bodies-note`)).toBeVisible();
  await expect(page.locator(`${SPACE} #bodies-note`)).toContainText("CC BY 4.0");
  // the plain spheres take the credit away
  await page.getByRole("group", { name: "Planets", exact: true }).getByRole("button", { name: "Plain", exact: true }).dispatchEvent("click");
  await expect(page.locator(`${SPACE} #bodies-note`)).toBeHidden();
  await expect.poll(async () => (await statsOf(page)).bodies.moon, { timeout: 15_000, message: "the view's own Moon again" }).toBe(false);
  expect((await readCounts(page)).contexts).toBe(1);
});

test("close to Mars its finer map tiles are laid on it, and far away none are held", async ({ page }) => {
  const tiles = await routePlanetTiles(page);
  await open(page);
  await expect(page.locator("#credit-line")).toContainText("CC BY 4.0");
  await page.locator(SPACE).evaluate((el) => Reflect.set(el, "body", "Mars"));
  await page.locator("kazoku-view-controls").evaluate((el) => (Reflect.get(el, "controller") as { set(view: { zoom: number }): void }).set({ zoom: 2.5 }));
  await expect.poll(async () => (await statsOf(page)).bodies.tiles, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  expect(tiles.some((tile) => tile.startsWith("mars/"))).toBe(true);
  await page.locator(SPACE).evaluate((el) => Reflect.set(el, "body", "Earth"));
  await page.locator("kazoku-view-controls").evaluate((el) => (Reflect.get(el, "controller") as { set(view: { zoom: number }): void }).set({ zoom: 1 }));
  await expect.poll(async () => (await statsOf(page)).bodies.tiles, { timeout: 15_000 }).toBe(0);
});
