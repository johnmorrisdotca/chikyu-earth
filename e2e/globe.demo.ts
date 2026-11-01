import { expect, test, type Page } from "@playwright/test";

interface ViewState {
  yaw: number;
  tilt: number;
  zoom: number;
  panX: number;
  panY: number;
  turning: boolean;
}

const CONTROLS = "kazoku-view-controls";
const stateOf = (page: Page): Promise<ViewState> => page.locator(CONTROLS).evaluate((el) => Reflect.get(el, "state") as ViewState);
const markup = (page: Page): Promise<string> => page.locator("chikyu-earth").evaluate((el) => el.shadowRoot?.innerHTML ?? "");

async function ready(page: Page): Promise<void> {
  await page.goto("/chikyu-earth/");
  await expect(page.locator("chikyu-earth svg").first()).toBeVisible();
  await expect(page.locator(`${CONTROLS} .bar`)).toBeVisible();
}

async function touch(page: Page, type: string, id: number, x: number, y: number): Promise<void> {
  await page.locator("#globe").evaluate((el, [t, i, cx, cy]) => {
    el.dispatchEvent(
      new PointerEvent(t as string, {
        pointerId: i as number,
        pointerType: "touch",
        isPrimary: i === 1,
        clientX: cx as number,
        clientY: cy as number,
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: t === "pointerup" ? 0 : 1,
      }),
    );
  }, [type, id, x, y]);
}

test("the globe and shared control bar are in the first viewport", async ({ page }) => {
  await ready(page);
  expect(await page.locator("chikyu-earth path").count()).toBeGreaterThan(50);
  const box = await page.locator(`${CONTROLS} .bar`).boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
});

test("the style control switches the drawing", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "Thick" }).click();
  await expect(page.locator("chikyu-earth")).toHaveAttribute("style", "thick");
});

test("a drag turns the globe", async ({ page }) => {
  await ready(page);
  const before = await markup(page);
  const box = (await page.locator("#globe").boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 90, y, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await stateOf(page)).yaw).not.toBe(0);
  await expect.poll(() => markup(page)).not.toBe(before);
});

test("zoom out, zoom in, 2x and Fit work", async ({ page }) => {
  await ready(page);
  await page.locator(`${CONTROLS} [data-b="in"]`).click();
  expect((await stateOf(page)).zoom).toBeGreaterThan(1);
  await page.locator(`${CONTROLS} [data-b="out"]`).click();
  expect((await stateOf(page)).zoom).toBe(1);
  await page.locator(`${CONTROLS} [data-b="two"]`).click();
  expect((await stateOf(page)).zoom).toBe(2);
  await page.locator(`${CONTROLS} [data-b="fit"]`).click();
  expect((await stateOf(page)).zoom).toBe(1);
  expect((await stateOf(page)).panX).toBe(0);
  expect((await stateOf(page)).panY).toBe(0);
});

test("two fingers pinch and Front returns the home view", async ({ page }) => {
  await ready(page);
  const box = (await page.locator("#globe").boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await touch(page, "pointerdown", 1, x - 50, y);
  await touch(page, "pointerdown", 2, x + 50, y);
  await touch(page, "pointermove", 1, x - 100, y);
  await touch(page, "pointermove", 2, x + 100, y);
  await touch(page, "pointerup", 2, x + 100, y);
  await touch(page, "pointerup", 1, x - 100, y);
  expect((await stateOf(page)).zoom).toBeCloseTo(2, 1);
  await page.locator(`${CONTROLS} [data-b="fit"]`).click();
  await page.locator(`${CONTROLS} [data-b="front"]`).click();
  expect((await stateOf(page)).yaw).toBe(0);
  expect((await stateOf(page)).tilt).toBe(0);
});

test.describe("with motion allowed", () => {
  test.use({ reducedMotion: "no-preference" });

  test("the Earth-rate turn keeps going after a zoom", async ({ page }) => {
    await ready(page);
    await expect.poll(async () => (await stateOf(page)).turning).toBe(true);
    const before = (await stateOf(page)).yaw;
    await page.locator(`${CONTROLS} [data-b="in"]`).click();
    expect((await stateOf(page)).zoom).toBeGreaterThan(1);
    expect((await stateOf(page)).turning).toBe(true);
    await expect.poll(async () => (await stateOf(page)).yaw, { timeout: 7000 }).not.toBe(before);
    expect((await stateOf(page)).turning).toBe(true);
  });
});
