// The demo's Wide layout (kazoku-ui's <kazoku-wide-toggle>) and its zoom readout: the panel beside the view in Normal and below a full-width view in Wide, the globe growing to the room
// and staying round, the T key and the address, the language of the button, the phone's one column, and the readout between zoom out and zoom in on the buttons, the wheel and a pinch.
import { expect, test, type Page } from "@playwright/test";

const CONTROLS = "kazoku-view-controls";
const READOUT = `${CONTROLS} [data-b="level"] [data-o="zoom"]`;
const TOGGLE = "kazoku-wide-toggle";

const rect = async (page: Page, selector: string) => (await page.locator(selector).boundingBox())!;

async function open(page: Page, query = ""): Promise<void> {
  await page.goto(`/chikyu-earth/${query}`);
  await expect(page.locator("chikyu-earth svg").first()).toBeVisible();
  await expect(page.locator(`${CONTROLS} .bar`)).toBeVisible();
  await page.locator(CONTROLS).evaluate((el) => (el as unknown as { pause(): void }).pause());
}

/** A phone: 640 px and under, where the layout is one column and the toggle is hidden. */
const isPhone = (viewport: { width: number } | null): boolean => (viewport?.width ?? 1280) <= 640;

test.describe("the layout", () => {
  test.beforeEach(({ viewport }) => {
    test.skip(isPhone(viewport), "the phone is one column and has its own test");
  });

  test("Normal puts the panel beside the view, the bar under the view, and the globe at 420", async ({ page }) => {
    await open(page);
    await expect(page.locator("html")).not.toHaveAttribute("data-wide", "on");
    const view = await rect(page, ".kazoku-view");
    const side = await rect(page, ".kazoku-side");
    const bar = await rect(page, CONTROLS);
    const globe = await rect(page, "#globe");
    expect(side.x, "the panel is a column at the right").toBeGreaterThanOrEqual(view.x + view.width);
    expect(bar.y, "the bar is under the view").toBeGreaterThanOrEqual(view.y + view.height - 1);
    expect(bar.x, "and in the view's column").toBeLessThan(side.x);
    expect(globe.width).toBeLessThanOrEqual(420);
    expect(Math.abs(globe.width - globe.height)).toBeLessThan(1);
  });

  test("Wide is theatre mode: the view takes the page's column, centred, the panel goes below, and the globe grows and stays round", async ({ page }) => {
    await open(page);
    const normal = await rect(page, "#globe");
    const mainBox = await rect(page, "main");
    await page.locator(TOGGLE).getByRole("button").click();
    await expect(page.locator("html")).toHaveAttribute("data-wide", "on");
    const view = await rect(page, ".kazoku-view");
    const bar = await rect(page, CONTROLS);
    const side = await rect(page, ".kazoku-side");
    const globe = await rect(page, "#globe");
    const viewport = page.viewportSize()!;
    const wideMain = await rect(page, "main");
    const pad = await page.locator("main").evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
    expect(wideMain.width, "the page keeps its width (Wide is not the window's width)").toBeCloseTo(mainBox.width, 0);
    expect(view.width, "the view takes the page's own column").toBeCloseTo(wideMain.width - 2 * pad, 0);
    expect(Math.abs(view.x - wideMain.x - (wideMain.x + wideMain.width - view.x - view.width)), "and is centred").toBeLessThanOrEqual(1);
    expect(view.height, "no taller than 80vh").toBeLessThanOrEqual(viewport.height * 0.8 + 1);
    expect(bar.y, "the bar stays with the view, under it").toBeGreaterThanOrEqual(view.y + view.height - 1);
    expect(side.y, "the panel is below the bar").toBeGreaterThanOrEqual(bar.y + bar.height - 1);
    expect(side.width, "and as wide as the view").toBeGreaterThan(view.width - 2);
    expect(globe.width, "the globe grew").toBeGreaterThan(normal.width * 1.3);
    expect(Math.abs(globe.width - globe.height), "and is still round").toBeLessThan(1);
    expect(globe.y).toBeGreaterThanOrEqual(view.y);
    expect(globe.y + globe.height).toBeLessThanOrEqual(view.y + view.height + 1);
    // the drawing follows the new size: the SVG fills the globe's box
    const svg = await rect(page, "#globe chikyu-earth svg");
    expect(Math.abs(svg.width - globe.width)).toBeLessThan(2);
    // the panel's boxes are a row of cards, and Normal puts everything back
    const boxes = await page.locator(".controls .box").evaluateAll((nodes) => nodes.filter((n) => n.getBoundingClientRect().height > 0).map((n) => n.getBoundingClientRect().width));
    expect(boxes.length).toBeGreaterThan(0);
    await page.locator(TOGGLE).getByRole("button").click();
    await expect(page.locator("html")).not.toHaveAttribute("data-wide", "on");
    expect((await rect(page, "#globe")).width).toBeLessThanOrEqual(420);
  });

  test("the view and the bar stay inside the page at the smaller desk size, Normal and Wide", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    for (const query of ["", "?wide=on"]) {
      await open(page, query);
      const doc = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      expect(doc.scroll, `no sideways scroll ${query}`).toBeLessThanOrEqual(doc.client);
      const globe = await rect(page, "#globe");
      expect(globe.width).toBeGreaterThanOrEqual(380);
    }
  });
});

test.describe("the toggle, the T key and the address", () => {
  test.beforeEach(({ viewport }) => {
    test.skip(isPhone(viewport), "the toggle is hidden on a phone");
  });

  test("?wide=on opens Wide, T switches, and the address follows the page and the look", async ({ page }) => {
    await open(page, "?wide=on");
    await expect(page.locator("html")).toHaveAttribute("data-wide", "on");
    await expect(page.locator(TOGGLE).getByRole("button")).toContainText("Normal");
    await page.keyboard.press("t");
    await expect(page.locator("html")).not.toHaveAttribute("data-wide", "on");
    await expect.poll(() => new URL(page.url()).searchParams.has("wide")).toBe(false);
    await expect(page.locator(TOGGLE).getByRole("button")).toContainText("Wide");
    await page.keyboard.press("t");
    await expect(page.locator("html")).toHaveAttribute("data-wide", "on");
    await expect.poll(() => new URL(page.url()).searchParams.get("wide")).toBe("on");
    // another choice of the page keeps ?wide=on
    await page.getByRole("button", { name: "Thick" }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("look")).toBe("thick");
    expect(new URL(page.url()).searchParams.get("wide")).toBe("on");
  });

  test("T does nothing while a text field has the keys", async ({ page }) => {
    await open(page);
    await page.locator("#places").scrollIntoViewIfNeeded();
    await page.locator(".controls").evaluate((root) => {
      const input = document.createElement("input");
      input.id = "typing";
      root.append(input);
    });
    await page.locator("#typing").focus();
    await page.keyboard.press("t");
    await expect(page.locator("html")).not.toHaveAttribute("data-wide", "on");
  });

  test("the toggle speaks the page's language, and follows the family chooser", async ({ page }) => {
    await open(page);
    await expect(page.locator(TOGGLE).getByRole("button")).toContainText("Wide");
    await page.getByRole("button", { name: "日本語" }).first().click();
    await expect(page.locator(TOGGLE).getByRole("button")).toContainText("ワイド");
    await page.keyboard.press("t");
    await expect(page.locator(TOGGLE).getByRole("button")).toContainText("ふつう");
    await page.getByRole("button", { name: "English" }).first().click();
    await expect(page.locator(TOGGLE).getByRole("button")).toContainText("Normal");
    // a page opened in Japanese says so from the start (and the device remembered Wide, so the button offers Normal)
    await open(page, "?lang=ja");
    await expect(page.locator("html")).toHaveAttribute("data-wide", "on");
    await expect(page.locator(TOGGLE).getByRole("button")).toContainText("ふつう");
  });

  test("Wide at a desk draws the line globe large, as a vector", async ({ page }) => {
    // a vector stays sharp at any size; the 3D looks redraw at the new size inside the caps, and wide.gl.ts checks that
    await open(page, "?wide=on");
    const svg = await rect(page, "#globe chikyu-earth svg");
    expect(svg.width).toBeGreaterThan(500);
  });
});

test.describe("the phone", () => {
  test.beforeEach(({ viewport }) => {
    test.skip(!isPhone(viewport), "the desk has its own layout tests");
  });

  for (const query of ["", "?wide=on"]) {
    test(`is one column, view then bar then panel, with no toggle ${query}`, async ({ page }) => {
      await open(page, query);
      await expect(page.locator(TOGGLE).getByRole("button")).toBeHidden();
      const view = await rect(page, ".kazoku-view");
      const bar = await rect(page, CONTROLS);
      const side = await rect(page, ".kazoku-side");
      const width = page.viewportSize()!.width;
      expect(bar.y).toBeGreaterThanOrEqual(view.y + view.height - 1);
      expect(side.y).toBeGreaterThanOrEqual(bar.y + bar.height - 1);
      for (const box of [view, bar, side]) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      }
      expect(Math.abs(side.x - view.x), "one column").toBeLessThan(1);
      const doc = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      expect(doc.scroll).toBeLessThanOrEqual(doc.client);
    });
  }
});

test.describe("the zoom readout", () => {
  const readout = async (page: Page): Promise<string> => ((await page.locator(READOUT).textContent()) ?? "").trim();

  test("is shown between zoom out and zoom in, at Fit says 1×, and changes on the buttons", async ({ page }) => {
    await open(page);
    await expect(page.locator(READOUT)).toBeVisible();
    expect(await readout(page)).toBe("1×");
    const out = await rect(page, `${CONTROLS} [data-b="out"]`);
    const level = await rect(page, `${CONTROLS} [data-b="level"]`);
    const inn = await rect(page, `${CONTROLS} [data-b="in"]`);
    expect(out.x + out.width).toBeLessThanOrEqual(level.x + 1);
    expect(level.x + level.width).toBeLessThanOrEqual(inn.x + 1);
    expect(Math.abs(out.y - level.y), "on one row").toBeLessThan(4);
    await page.locator(`${CONTROLS} [data-b="in"]`).click();
    const zoomed = await readout(page);
    expect(zoomed).not.toBe("1×");
    expect(parseFloat(zoomed)).toBeGreaterThan(1);
    await page.locator(`${CONTROLS} [data-b="out"]`).click();
    expect(await readout(page)).toBe("1×");
  });

  test("changes on Ctrl and the wheel, and on a two-finger pinch, and Fit takes it back", async ({ page }) => {
    await open(page);
    const box = await rect(page, "#globe");
    const wheel = (deltaY: number): Promise<void> =>
      page.locator("#globe chikyu-earth").evaluate(
        (el, [dy, x, y]) => {
          el.dispatchEvent(new WheelEvent("wheel", { deltaY: dy as number, ctrlKey: true, bubbles: true, cancelable: true, composed: true, clientX: x as number, clientY: y as number }));
        },
        [deltaY, box.x + box.width / 2, box.y + box.height / 2],
      );
    await wheel(-240);
    await expect.poll(async () => parseFloat(await readout(page))).toBeGreaterThan(1);
    const afterWheel = parseFloat(await readout(page));
    await wheel(240);
    await expect.poll(async () => parseFloat(await readout(page))).toBeLessThan(afterWheel);
    await page.locator(`${CONTROLS} [data-b="level"]`).click();
    expect(await readout(page)).toBe("1×");
    const touch = (type: string, id: number, x: number, y: number): Promise<void> =>
      page.locator("#globe chikyu-earth").evaluate(
        (el, [t, i, cx, cy]) => {
          el.dispatchEvent(new PointerEvent(t as string, { pointerId: i as number, pointerType: "touch", isPrimary: i === 1, clientX: cx as number, clientY: cy as number, bubbles: true, cancelable: true, button: 0, buttons: t === "pointerup" ? 0 : 1 }));
        },
        [type, id, x, y],
      );
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await touch("pointerdown", 1, x - 40, y);
    await touch("pointerdown", 2, x + 40, y);
    await touch("pointermove", 1, x - 90, y);
    await touch("pointermove", 2, x + 90, y);
    await touch("pointerup", 2, x + 90, y);
    await touch("pointerup", 1, x - 90, y);
    await expect.poll(async () => parseFloat(await readout(page))).toBeGreaterThan(1.5);
  });
});
