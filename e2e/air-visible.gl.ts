// The air at whole-Earth zoom (MODULES-904): drawn 3 times its real thickness unless a page says otherwise, with a line that says so, and `air-thickness="1"` draws it true.
// On the realistic Earth and in the space view alike; the glow is measured from the pixels, on the desk and at a phone's width with the light air.
import { expect, test, type Page } from "@playwright/test";
import { COUNT_SCRIPT, settle, statsOf } from "./gl.ts";

const EARTH = "chikyu-earth-realistic";
const SPACE = "chikyu-space";
/** Noon in November: with `camera=sun` and `center=0,0` the Sun is straight at the camera, so every limb is the day side. */
const NOV2 = "2026-11-02T12:00Z";
const BACKGROUND = "#04060c";

async function open(page: Page, element: string, query: string, fullScreen = false): Promise<void> {
  await page.addInitScript(COUNT_SCRIPT);
  const address = fullScreen ? "fullscreen.html?" : `?look=${element === EARTH ? "realistic" : "space"}&`;
  await page.goto(`/chikyu-earth/${address}time=${NOV2}&speed=0&camera=sun&center=0,0&${query}`);
  await page.locator(`${element}[data-state=live]`).waitFor({ timeout: 60_000 });
  await page.addStyleTag({ content: `${element}{background:${BACKGROUND}}` });
  // wait on the first draw itself (the element's own counter), however long a loaded machine takes to make it: the test's own time is the limit, not a fixed 5 s (MODULES-1194)
  if (element === EARTH) await page.waitForFunction((tag) => (Reflect.get(document.querySelector(tag)!, "stats") as { draws: number }).draws > 0, EARTH, { timeout: 0 });
  await settle(page, 1500);
}

/** How many pixels of the row through the middle of the element are lighter than its background: the Earth's disc and the glow of the air on either side of it. */
async function span(page: Page, element: string): Promise<number> {
  const png = (await page.locator(element).screenshot()).toString("base64");
  return page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const row = ctx.getImageData(0, Math.round(img.height / 2), img.width, 1).data;
    const base = 4 + 6 + 12;
    let lit = 0;
    for (let x = 0; x < img.width; x++) if (row[x * 4]! + row[x * 4 + 1]! + row[x * 4 + 2]! > base + 9) lit += 1;
    return lit;
  }, png);
}

const noteOf = (page: Page, element: string): Promise<{ hidden: boolean; text: string }> =>
  page.locator(element).evaluate((el) => {
    const note = el.shadowRoot!.getElementById("air-note")!;
    return { hidden: note.hidden, text: note.textContent ?? "" };
  });

for (const [name, element] of [
  ["realistic Earth", EARTH],
  ["space view", SPACE],
] as const) {
  test.describe(`the ${name}`, () => {
    test("with no setting the air is drawn 3 times its real thickness, and says so; at 1 it is true and says nothing", async ({ page }) => {
      await open(page, element, "");
      expect(await page.locator(element).evaluate((el) => Reflect.get(el, "airThickness"))).toBe(3);
      const shown = await noteOf(page, element);
      expect(shown.hidden).toBe(false);
      expect(shown.text).toBe("The air is drawn 3 times its real thickness so it can be seen.");
      await page.locator(element).evaluate((el) => el.setAttribute("air-thickness", "1"));
      expect(await page.locator(element).evaluate((el) => Reflect.get(el, "airThickness"))).toBe(1);
      expect((await noteOf(page, element)).hidden).toBe(true);
      await page.locator(element).evaluate((el) => el.setAttribute("air-thickness", "2.5"));
      expect((await noteOf(page, element)).text).toContain("2.5 times");
      await page.locator(element).evaluate((el) => el.setAttribute("air-label", "off"));
      expect((await noteOf(page, element)).hidden).toBe(true);
    });

    test("the glow of the air at the limb is wider at 3 than at 1 (the true thickness), by pixels counted on the row through the middle", async ({ page }) => {
      // the realistic Earth is measured on the full-screen page, where it is largest (the whole-Earth zoom of a home page); the space view in the demo
      await open(page, element, "air-thickness=1", element === EARTH);
      const thin = await span(page, element);
      await page.locator(element).evaluate((el) => el.setAttribute("air-thickness", "3"));
      await settle(page, 1500);
      const thick = await span(page, element);
      console.log(`${name}: lit pixels on the middle row ${thin} at 1, ${thick} at 3`);
      expect(thick).toBeGreaterThanOrEqual(thin + (element === EARTH ? 10 : 5));
    });
  });
}

test.describe("on a phone", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test("with the light air that a phone gets, the thickened ring is plainly there and the true one is a hair", async ({ page }) => {
    await open(page, EARTH, "air-thickness=1");
    expect(await page.evaluate(() => matchMedia("(pointer: coarse) and (hover: none)").matches), "the device reads as a phone, so the air is the light one").toBe(true);
    const thin = await span(page, EARTH);
    await page.locator(EARTH).evaluate((el) => el.setAttribute("air-thickness", "3"));
    await settle(page, 1500);
    const thick = await span(page, EARTH);
    console.log(`phone, air=light: lit pixels on the middle row ${thin} at 1, ${thick} at 3`);
    expect(thick).toBeGreaterThanOrEqual(thin + 5);
  });
});

test("the full-screen page says the air is thickened in its own line, and one press draws it true", async ({ page }) => {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/fullscreen.html?time=${NOV2}&speed=0&camera=sun&center=0,0`);
  await page.locator(`${EARTH}[data-state=live]`).waitFor({ timeout: 60_000 });
  const line = page.locator("#air-line");
  await expect(line).toHaveText("The air is drawn 3 times its real thickness so it can be seen.");
  const button = page.getByRole("button", { name: "True air thickness" });
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(line).toBeHidden();
  expect(await page.locator(EARTH).evaluate((el) => Reflect.get(el, "airThickness"))).toBe(1);
  await button.click();
  await expect(line).toBeVisible();
  expect(await page.locator(EARTH).evaluate((el) => Reflect.get(el, "airThickness"))).toBe(3);
});
