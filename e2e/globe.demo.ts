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

/** Back to Fit: the Fit button, or on a narrow screen (the horizontal layout) the zoom readout, which is Fit there. */
async function fit(page: Page): Promise<void> {
  const button = page.locator(`${CONTROLS} [data-b="fit"]`);
  await ((await button.isVisible()) ? button : page.locator(`${CONTROLS} [data-b="level"]`)).click();
}

async function touch(page: Page, type: string, id: number, x: number, y: number): Promise<void> {
  // the bar is for the element, so that is where the fingers are
  await page.locator("#globe chikyu-earth").evaluate((el, [t, i, cx, cy]) => {
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

test("the globe, and the control bar's first row, are in the first viewport", async ({ page }) => {
  await ready(page);
  expect(await page.locator("chikyu-earth path").count()).toBeGreaterThan(50);
  const globe = await page.locator("#globe").boundingBox();
  const bar = await page.locator(`${CONTROLS} .bar`).boundingBox();
  const viewport = page.viewportSize();
  expect(globe).not.toBeNull();
  expect(bar).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(globe!.y).toBeGreaterThanOrEqual(0);
  expect(globe!.y + globe!.height).toBeLessThanOrEqual(viewport!.height);
  expect(bar!.y).toBeGreaterThanOrEqual(0);
  // The family's header takes the top of a phone; the bar's first row (the angle slider, Auto-turn) must still be on screen.
  expect(bar!.y + 56).toBeLessThanOrEqual(viewport!.height);
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

test("zoom out, zoom in and Fit work", async ({ page }) => {
  await ready(page);
  await page.locator(`${CONTROLS} [data-b="in"]`).click();
  expect((await stateOf(page)).zoom).toBeGreaterThan(1);
  await page.locator(`${CONTROLS} [data-b="out"]`).click();
  expect((await stateOf(page)).zoom).toBe(1);
  await page.locator(`${CONTROLS} [data-b="in"]`).click();
  await page.locator(`${CONTROLS} [data-b="in"]`).click();
  expect((await stateOf(page)).zoom).toBeGreaterThan(1.5);
  await fit(page);
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
  await fit(page);
  await page.locator(`${CONTROLS} [data-b="front"]`).click();
  expect((await stateOf(page)).yaw).toBe(0);
  expect((await stateOf(page)).tilt).toBe(0);
});

test("reduced motion leaves the globe still", async ({ page }) => {
  await ready(page);
  const before = await stateOf(page);
  const drawn = await markup(page);
  expect(before.turning).toBe(false);
  await page.waitForTimeout(1200);
  expect((await stateOf(page)).yaw).toBe(before.yaw);
  expect(await markup(page)).toBe(drawn);
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
