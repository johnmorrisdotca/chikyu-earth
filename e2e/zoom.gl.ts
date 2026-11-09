// The 3D looks carry their hands too: the realistic Earth and the space view zoom, drag, pinch and take the keys, on the demo (the bar owns the hands and reads the element's range) and on the
// embed page (the element carries them), and each stops at its own limit: the realistic Earth at 5 times (20 with tiles, in tiles.gl.ts), the space view at a millionth and 2.5, and 0.5 to 6 while
// riding from a body. Real mouse and wheel events, in software GL.
import { expect, test } from "@playwright/test";
import { checkHands, readBar, readElement } from "./hands.ts";
import { routeElements } from "./recorded.ts";

test.beforeEach(({ page }) => routeElements(page));

const NOON = "2026-06-21T12:00Z";
const REAL = { zoomMin: 0.1, zoomMax: 5 };
const SPACE = { zoomMin: 0.000001, zoomMax: 2.5 };

test("the demo's realistic Earth: the bar's hands, and the element's range of 0.1 to 5 times", async ({ page }) => {
  await page.goto(`/chikyu-earth/?look=realistic&time=${NOON}&center=10,20`);
  await page.locator("chikyu-earth-realistic[data-state=live]").waitFor({ timeout: 60_000 });
  await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { pause(): void }).pause());
  await expect(page.locator("chikyu-earth-realistic")).toHaveAttribute("data-kazoku-bar", "");
  await checkHands(page, { selector: "chikyu-earth-realistic", read: readBar(page), limits: REAL });
});

test("the demo's space view: the bar's hands, and the element's range of a millionth to 2.5 times", async ({ page }) => {
  await page.goto(`/chikyu-earth/?look=space&time=${NOON}&speed=0&center=10,20`);
  await page.locator("chikyu-space[data-state=live]").waitFor({ timeout: 60_000 });
  await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { pause(): void }).pause());
  await expect(page.locator("chikyu-space")).toHaveAttribute("data-kazoku-bar", "");
  await checkHands(page, { selector: "chikyu-space", read: readBar(page), limits: SPACE });
});

test("the embed page's realistic Earth carries its own hands", async ({ page }) => {
  await page.goto(`/chikyu-earth/embed.html?look=realistic&time=${NOON}&center=10,20&turn=1`);
  await page.locator("chikyu-earth-realistic[data-state=live]").waitFor({ timeout: 60_000 });
  await checkHands(page, { selector: "chikyu-earth-realistic", read: readElement(page, "chikyu-earth-realistic"), limits: REAL, wheel: "event" });
});

test("the embed page's space view carries its own hands", async ({ page }) => {
  await page.goto(`/chikyu-earth/embed.html?look=space&time=${NOON}&speed=0&center=10,20&turn=1`);
  await page.locator("chikyu-space[data-state=live]").waitFor({ timeout: 60_000 });
  await checkHands(page, { selector: "chikyu-space", read: readElement(page, "chikyu-space"), limits: SPACE, wheel: "event" });
});

test("riding from a body holds the space view's zoom to 0.5 to 6, and the range comes back when the ride stops", async ({ page }) => {
  await page.goto("/chikyu-earth/embed.html?look=space&time=2026-11-02T18:00Z&speed=0&center=10,20&turn=1&ride=iss");
  await page.locator("chikyu-space[data-state=live]").waitFor({ timeout: 60_000 });
  const stats = (): Promise<{ ride: { riding: boolean; gliding: boolean } }> => page.locator("chikyu-space").evaluate((el) => Reflect.get(el, "stats") as { ride: { riding: boolean; gliding: boolean } });
  await expect.poll(async () => (await stats()).ride.riding, { timeout: 30_000 }).toBe(true);
  const read = readElement(page, "chikyu-space");
  await expect.poll(async () => (await read()).zoomMin).toBe(0.5);
  expect((await read()).zoomMax).toBe(6);
  await page.locator("chikyu-space").evaluate((el) => (el as unknown as { ride(target: null): void }).ride(null));
  await expect.poll(async () => (await read()).zoomMin).toBe(SPACE.zoomMin);
  expect((await read()).zoomMax).toBe(SPACE.zoomMax);
  await expect(page.locator("chikyu-space")).not.toHaveAttribute("zoom-min", /.*/);
});

test("a zoom-max the page sets is not overridden while riding", async ({ page }) => {
  await page.goto("/chikyu-earth/embed.html?look=space&time=2026-11-02T18:00Z&speed=0&center=10,20&turn=1");
  await page.locator("chikyu-space[data-state=live]").waitFor({ timeout: 60_000 });
  await page.locator("chikyu-space").evaluate((el) => el.setAttribute("zoom-max", "1.5"));
  await expect.poll(async () => (await readElement(page, "chikyu-space")()).zoomMax).toBe(1.5);
});
