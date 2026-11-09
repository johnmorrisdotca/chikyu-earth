// Centre (kazoku-ui 0.12): zoom in, drag the globe far off, press Centre, and it is back in the middle at Fit and the default angle, with the same picture as at the start.
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const CONTROLS = "kazoku-view-controls";
interface ViewState {
  yaw: number;
  tilt: number;
  zoom: number;
  panX: number;
  panY: number;
}
const stateOf = (page: Page): Promise<ViewState> => page.locator(CONTROLS).evaluate((el) => Reflect.get(el, "state") as ViewState);
const picture = (page: Page): Promise<string> => page.locator("#globe").evaluate((el) => (el.querySelector("chikyu-earth") as HTMLElement).shadowRoot?.querySelector(".holder")?.innerHTML ?? "");

test("line: drag the globe far off, press Centre, and it is back in the middle", async ({ page }) => {
  await page.goto("/chikyu-earth/?look=line&speed=0&center=25,-31");
  await page.locator("chikyu-earth svg").first().waitFor();
  await page.locator(CONTROLS).evaluate((el) => (el as unknown as { pause(): void }).pause());
  const start = await picture(page);
  expect(await page.locator(`${CONTROLS} [data-b="centre"]`).isVisible(), "no Centre button while the view is at Fit").toBe(false);

  for (let i = 0; i < 3; i += 1) await page.locator(`${CONTROLS} [data-b="in"]`).click();
  await expect.poll(async () => (await stateOf(page)).zoom, { message: "zoomed in" }).toBeGreaterThan(2);
  // kazoku-ui 0.26: a plain drag always turns; the middle button moves the picture
  // the clicks on the zoom buttons scrolled the page; the drag needs the globe in the window
  await page.locator("#globe").scrollIntoViewIfNeeded();
  const box = (await page.locator("#globe").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down({ button: "middle" });
  // far off, and still inside the page's window, where the pointer's moves are delivered on every machine
  await page.mouse.move(box.x + box.width / 2 + 280, box.y + box.height / 2 + 140, { steps: 12 });
  await page.mouse.up({ button: "middle" });
  const off = await stateOf(page);
  expect(Math.hypot(off.panX, off.panY), `the globe was dragged away (${JSON.stringify(off)}, view ${JSON.stringify(box)} in ${JSON.stringify(page.viewportSize())})`).toBeGreaterThan(100);
  expect(Math.abs(off.panX), "but the pan is held, so the globe cannot be lost").toBeLessThanOrEqual(box.width * off.zoom);
  await expect(page.locator(`${CONTROLS} [data-b="centre"]`)).toBeVisible();

  await page.locator(`${CONTROLS} [data-b="centre"]`).click();
  await expect.poll(async () => (await stateOf(page)).zoom).toBe(1);
  const back = await stateOf(page);
  expect([back.panX, back.panY, back.yaw, back.tilt], "Fit, no pan, the default angle").toEqual([0, 0, 0, 0]);
  await expect(page.locator(`${CONTROLS} [data-b="centre"]`)).toBeHidden();
  await expect.poll(() => picture(page)).toBe(start);
});

test("the Earth from space and the space view: Centre brings the zoom back to Fit", async ({ page }) => {
  for (const look of ["realistic", "space"]) {
    await page.goto(`/chikyu-earth/?look=${look}&speed=0&center=25,-31&time=2026-11-03T07:30Z`);
    await page.locator(look === "space" ? "chikyu-space[data-state=live]" : "chikyu-earth-realistic[data-state=live]").waitFor({ timeout: 90_000 });
    await page.locator(CONTROLS).evaluate((el) => (el as unknown as { pause(): void }).pause());
    await page.locator(`${CONTROLS} [data-b="in"]`).click();
    await page.locator(`${CONTROLS} [data-b="in"]`).click();
    expect((await stateOf(page)).zoom).toBeGreaterThan(1);
    await page.locator(`${CONTROLS} [data-b="centre"]`).click();
    await expect.poll(async () => (await stateOf(page)).zoom, { message: look }).toBe(1);
  }
});
