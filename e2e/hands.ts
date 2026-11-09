// The hands every live view has: drag, two-finger pinch, the wheel, the keys and the limits, checked on whatever page and element they are given. Real mouse, wheel and key events through
// the browser's own input; the pinch goes through Chromium's touch input, as a phone sends it. Plain Playwright, no expect, so the usage script can use it too.
import type { Page } from "@playwright/test";

/** What a page says about the view: the controller's state and its limits. */
export interface ViewReading {
  yaw: number;
  tilt: number;
  zoom: number;
  panX: number;
  panY: number;
  zoomMin: number;
  zoomMax: number;
}

export interface HandsOptions {
  /** The element the hands are on. */
  selector: string;
  /** The view's state and limits: the element's own controller, or the bar's when a bar is bound. */
  read: () => Promise<ViewReading>;
  /** The page's own scroll is not enough room to test the wheel: make it taller. */
  tall?: boolean;
  /** `page` (the default): a real wheel must scroll the page. `event`: the page cannot scroll (an embed), so a plain wheel must only be left alone, not taken. */
  wheel?: "page" | "event";
  /** Send a two-finger pinch (Chromium with touch only). */
  touch?: boolean;
  /** The limits the view must report, from the page's own words. */
  limits?: { zoomMin: number; zoomMax: number };
}

const fail = (message: string): never => {
  throw new Error(message);
};

/** The reading for an element that carries its own controls. */
export const readElement =
  (page: Page, selector: string) =>
  (): Promise<ViewReading> =>
    page.locator(selector).evaluate((el) => {
      const controller = Reflect.get(el, "controller") as { state: Record<string, number>; limits: Record<string, number> } | undefined;
      if (!controller) throw new Error("the element has no controller");
      const { yaw, tilt, zoom, panX, panY } = controller.state as { yaw: number; tilt: number; zoom: number; panX: number; panY: number };
      return { yaw, tilt, zoom, panX, panY, zoomMin: controller.limits["zoomMin"]!, zoomMax: controller.limits["zoomMax"]! };
    });

/** The reading for a page whose `<kazoku-view-controls>` bar owns the hands. */
export const readBar =
  (page: Page) =>
  (): Promise<ViewReading> =>
    page.locator("kazoku-view-controls").evaluate((el) => {
      const controller = Reflect.get(el, "controller") as { state: { yaw: number; tilt: number; zoom: number; panX: number; panY: number }; limits: { zoomMin: number; zoomMax: number } };
      const { yaw, tilt, zoom, panX, panY } = controller.state;
      return { yaw, tilt, zoom, panX, panY, zoomMin: controller.limits.zoomMin, zoomMax: controller.limits.zoomMax };
    });

const centreOf = async (page: Page, selector: string): Promise<{ x: number; y: number; width: number; height: number }> => {
  await page.locator(selector).scrollIntoViewIfNeeded();
  const box = (await page.locator(selector).boundingBox()) ?? fail(`${selector} has no box`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, width: box.width, height: box.height };
};

/** Ctrl and the wheel (or a pinch on a trackpad), sent as the event the browser makes: `steps` of `delta` at the middle of the element. */
export const ctrlWheel = (page: Page, selector: string, delta: number, steps = 1): Promise<void> =>
  page.locator(selector).evaluate(
    (el, [amount, count]) => {
      const box = el.getBoundingClientRect();
      for (let i = 0; i < (count as number); i += 1) {
        el.dispatchEvent(new WheelEvent("wheel", { deltaY: amount as number, ctrlKey: true, bubbles: true, cancelable: true, composed: true, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 }));
      }
    },
    [delta, steps] as const,
  );

/** Two fingers that start `gap` pixels apart about a point and end `gap + spread` apart. */
export async function pinch(page: Page, at: { x: number; y: number }, gap: number, spread: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const points = (d: number) => [
    { x: at.x - d / 2, y: at.y, id: 0 },
    { x: at.x + d / 2, y: at.y, id: 1 },
  ];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(gap) });
  for (let i = 1; i <= 10; i += 1) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points(gap + (spread * i) / 10) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(500);
}

/**
 * Drag, plain wheel at Fit, Ctrl and wheel, the keys, the limits and (with touch) a pinch, in that order, leaving the view at Fit. Throws on the first that does not do what a reader expects.
 * Returns the limits the view reported.
 */
export async function checkHands(page: Page, options: HandsOptions): Promise<{ zoomMin: number; zoomMax: number }> {
  const { selector, read } = options;
  if (options.tall) await page.evaluate(() => (document.body.style.paddingBottom = "3000px"));
  const start = await read();
  if (Math.abs(start.zoom - 1) > 1e-9) fail(`the view did not start at Fit: zoom ${start.zoom}`);

  // Drag: at Fit it turns the picture.
  let at = await centreOf(page, selector);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + Math.min(90, at.width / 4), at.y, { steps: 8 });
  await page.mouse.up();
  const dragged = await read();
  if (Math.abs(dragged.yaw - start.yaw) < 1) fail(`a drag did not turn the view: yaw ${start.yaw} to ${dragged.yaw}`);
  if (Math.abs(dragged.zoom - 1) > 1e-9) fail(`a drag changed the zoom: ${dragged.zoom}`);

  // The plain wheel at Fit scrolls the page and leaves the view alone.
  at = await centreOf(page, selector);
  if (options.wheel === "event") {
    const taken = await page.locator(selector).evaluate((el) => {
      const event = new WheelEvent("wheel", { deltaY: 240, bubbles: true, cancelable: true, composed: true });
      el.dispatchEvent(event);
      return event.defaultPrevented;
    });
    if (taken) fail("the plain wheel at Fit was taken by the view: the page cannot scroll past it");
  } else {
    const scrolledFrom = await page.evaluate(() => window.scrollY);
    await page.mouse.move(at.x, at.y);
    await page.mouse.wheel(0, 240);
    await page.waitForFunction((from) => window.scrollY > from, scrolledFrom, { timeout: 5000 }).catch(() => fail(`the plain wheel at Fit did not scroll the page (scrollY stayed ${scrolledFrom})`));
  }
  const afterWheel = await read();
  if (afterWheel.zoom !== dragged.zoom || afterWheel.panX !== dragged.panX || afterWheel.panY !== dragged.panY) fail(`the plain wheel at Fit moved the view: ${JSON.stringify(afterWheel)}`);

  // Ctrl and the wheel zoom about the pointer.
  at = await centreOf(page, selector);
  await ctrlWheel(page, selector, -240, 3);
  const zoomedIn = await read();
  if (!(zoomedIn.zoom > 1.2)) fail(`Ctrl and the wheel did not zoom in: ${zoomedIn.zoom}`);
  await ctrlWheel(page, selector, 240, 3);
  const backOut = await read();
  if (!(backOut.zoom < zoomedIn.zoom)) fail(`Ctrl and the wheel did not zoom out: ${zoomedIn.zoom} to ${backOut.zoom}`);

  // The limits: pressed all the way in and all the way out, the zoom stops at them.
  await ctrlWheel(page, selector, -3000, 400);
  const most = await read();
  await ctrlWheel(page, selector, 3000, 400);
  const least = await read();
  const reported = { zoomMin: least.zoomMin, zoomMax: most.zoomMax };
  if (Math.abs(most.zoom / most.zoomMax - 1) > 1e-6) fail(`all the way in stopped at ${most.zoom}, not at the limit ${most.zoomMax}`);
  if (Math.abs(least.zoom / least.zoomMin - 1) > 1e-6) fail(`all the way out stopped at ${least.zoom}, not at the limit ${least.zoomMin}`);
  if (options.limits && (Math.abs(reported.zoomMax / options.limits.zoomMax - 1) > 1e-9 || Math.abs(reported.zoomMin / options.limits.zoomMin - 1) > 1e-9)) {
    fail(`the limits are ${reported.zoomMin} to ${reported.zoomMax}, not ${options.limits.zoomMin} to ${options.limits.zoomMax}`);
  }

  // The keys: + zooms, an arrow turns, 0 puts the zoom back to Fit.
  await page.locator(selector).focus();
  await page.keyboard.press("0");
  const fitted = await read();
  if (Math.abs(fitted.zoom - 1) > 1e-9) fail(`0 did not put the view back to Fit: zoom ${fitted.zoom}`);
  const turnedFrom = fitted.yaw;
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const arrowed = await read();
  if (Math.abs(arrowed.yaw - turnedFrom) < 1) fail(`the arrow keys did not turn the view: yaw ${turnedFrom} to ${arrowed.yaw}`);
  await page.keyboard.press("+");
  await page.keyboard.press("+");
  const plus = await read();
  if (!(plus.zoom > 1.2)) fail(`+ did not zoom in: ${plus.zoom}`);
  await page.keyboard.press("0");

  if (options.touch) {
    at = await centreOf(page, selector);
    const before = await read();
    await pinch(page, at, 60, 120);
    const pinched = await read();
    if (!(pinched.zoom > before.zoom * 1.3)) fail(`fingers apart did not zoom in: ${before.zoom} to ${pinched.zoom}`);
    await pinch(page, at, 180, -120);
    const closed = await read();
    if (!(closed.zoom < pinched.zoom * 0.8)) fail(`fingers together did not zoom out: ${pinched.zoom} to ${closed.zoom}`);
    await page.locator(selector).focus();
    await page.keyboard.press("0");
  }
  return reported;
}
