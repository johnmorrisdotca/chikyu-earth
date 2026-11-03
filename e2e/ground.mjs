// e2e-ground.mjs: the family's shared browser check of the drag rule (spx-stats docs/package-work.md, "A drag moves the object with the pointer"). Copied unchanged into a package's
// e2e/ folder (as e2e/ground.mjs) and never edited there; kazoku-ui's docs/drag-rule.md says how to use it. Not a test file: a test imports it.
//
//   import { checkFollowsTheHand, checkExactGrab } from "./ground.mjs";
//   test("the globe follows the hand", async ({ page }) => { await open(page); await checkFollowsTheHand(page, { view: "#globe", controls: "kazoku-view-controls", autoTurn: "right" }); });
//
// It moves a real pointer and real keys, takes a picture of the view before and after, and finds how far the ground moved by sliding the middle of the first picture over the second.
// The rule: the surface under the pointer follows the pointer (drag right and it moves right, drag up and it moves up), the arrow keys agree, Auto-turn goes the object's real way,
// and, where a package turns a globe or any piece with a known on-screen radius, the touched point stays under the pointer (exact grab).
import { expect } from "@playwright/test";

/**
 * The best shift of `after` against `before`, both as grey values (one number a pixel, row by row) `w` by `h`: slide the middle of `before` over `after` up to `reach` pixels each way.
 * @param {ArrayLike<number>} before
 * @param {ArrayLike<number>} after
 * @param {number} w
 * @param {number} h
 * @param {number} reach
 * @param {[number, number, number, number]} [window] the part of `before` that is slid, as shares of its width and height: left, right, top, bottom (the middle 40%: 0.3, 0.7, 0.3, 0.7)
 * @returns {{ x: number, y: number, error: number }}
 */
export function bestShift(before, after, w, h, reach, window = [0.3, 0.7, 0.3, 0.7]) {
  const x0 = Math.round(w * window[0]);
  const x1 = Math.round(w * window[1]);
  const y0 = Math.round(h * window[2]);
  const y1 = Math.round(h * window[3]);
  let best = { x: 0, y: 0, error: Infinity };
  for (let dy = -reach; dy <= reach; dy += 1) {
    for (let dx = -reach; dx <= reach; dx += 1) {
      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1; y += 3) {
        const ys = y + dy;
        if (ys < 0 || ys >= h) continue;
        for (let x = x0; x < x1; x += 3) {
          const xs = x + dx;
          if (xs < 0 || xs >= w) continue;
          sum += Math.abs(before[y * w + x] - after[ys * w + xs]);
          n += 1;
        }
      }
      const error = n === 0 ? Infinity : sum / n;
      if (error < best.error) best = { x: dx, y: dy, error };
    }
  }
  return best;
}

/**
 * Which way the ground moved between two pictures of a view (PNG buffers): `x` pixels to the right (negative: left), `y` pixels down (negative: up), and `error`, how different the
 * pictures still are at that shift (large when they have nothing in common).
 * @param {import("@playwright/test").Page} page
 * @param {Buffer} before
 * @param {Buffer} after
 * @param {number} [reach]
 * @param {[number, number, number, number]} [window] the part of the first picture that is slid (see `bestShift`)
 */
export async function groundShift(page, before, after, reach = 60, window) {
  const grey = (data) =>
    page.evaluate(async (png) => {
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const rgba = ctx.getImageData(0, 0, img.width, img.height).data;
      const out = new Array(img.width * img.height);
      for (let i = 0; i < out.length; i += 1) out[i] = Math.round(rgba[i * 4] * 0.3 + rgba[i * 4 + 1] * 0.59 + rgba[i * 4 + 2] * 0.11);
      return { w: img.width, h: img.height, out };
    }, data.toString("base64"));
  const [p, q] = [await grey(before), await grey(after)];
  return bestShift(p.out, q.out, p.w, p.h, reach, window);
}

/**
 * A real pointer drag from the middle of `target` by `dx` and `dy` pixels, in ten steps, with the pointer left up at the end.
 * @param {import("@playwright/test").Page} page
 * @param {import("@playwright/test").Locator} target
 * @param {number} dx
 * @param {number} dy
 */
export async function dragBy(page, target, dx, dy) {
  const box = await target.boundingBox();
  if (box === null) throw new Error("the view has no box to drag");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i += 1) await page.mouse.move(x + (dx * i) / 10, y + (dy * i) / 10);
  await page.mouse.up();
}

/**
 * Do `act`, then say how far the ground of `view` moved on the screen.
 * @param {import("@playwright/test").Page} page
 * @param {import("@playwright/test").Locator} view
 * @param {() => Promise<void>} act
 * @param {{ settle?: number, reach?: number, window?: [number, number, number, number] }} [options]
 */
export async function movedBy(page, view, act, options = {}) {
  const before = await view.screenshot({ scale: "css" });
  await act();
  await page.waitForTimeout(options.settle ?? 600);
  const after = await view.screenshot({ scale: "css" });
  return groundShift(page, before, after, options.reach ?? 70, options.window);
}

/**
 * The drag rule: the ground follows the hand. Drag right and it moves right, drag up and it moves up, the right and up arrow keys agree, and (with `autoTurn`) Auto-turn goes the way
 * the object really turns. The view is put back after each step. Fails with a message that says what moved and where.
 * @param {import("@playwright/test").Page} page
 * @param {{ view: string, picture?: string, window?: [number, number, number, number], controls?: string, min?: number, settle?: number, keys?: boolean, autoTurn?: "right" | "left" | false, distance?: number }} options
 *   `view` is the selector of the element the hands are bound to; `picture` the selector of what is photographed (the view by default; give the globe's own canvas when the view is much wider than the globe, so the middle of the picture is ground); `window` the part of the picture that is followed, as shares `[left, right, top, bottom]` (the middle 40%; give the part that holds the object when it is thin, such as a rocket); `controls` the selector of the `<kazoku-view-controls>` (needed for Auto-turn); `min` the pixels that count as moved (8; the other axis may move by up to the larger of `min` and 3);
 *   `distance` the pixels dragged (30); `keys: false` skips the arrow keys; `autoTurn` the direction the ground goes while Auto-turn runs, in a view whose Auto-turn is the object's own turn.
 */
export async function checkFollowsTheHand(page, options) {
  const { view, picture = view, window, controls = "kazoku-view-controls", min = 8, settle = 600, keys = true, autoTurn = false, distance = 30 } = options;
  const target = page.locator(view);
  const move = (act) => movedBy(page, page.locator(picture), act, { settle, window });
  const right = await move(() => dragBy(page, target, distance, 0));
  expect(right.x, `a drag right moves the ground right (moved ${right.x},${right.y})`).toBeGreaterThan(min);
  expect(Math.abs(right.y), "and not up or down").toBeLessThan(Math.max(min, 3));
  await dragBy(page, target, -distance, 0);
  const up = await move(() => dragBy(page, target, 0, -distance));
  expect(up.y, `a drag up moves the ground up (moved ${up.x},${up.y})`).toBeLessThan(-min);
  expect(Math.abs(up.x), "and not sideways").toBeLessThan(Math.max(min, 3));
  await dragBy(page, target, 0, distance);
  await page.waitForTimeout(settle);
  if (keys) {
    await target.focus();
    const arrowRight = await move(() => page.keyboard.press("ArrowRight"));
    expect(arrowRight.x, `the right arrow moves the ground right (moved ${arrowRight.x},${arrowRight.y})`).toBeGreaterThan(min);
    await page.keyboard.press("ArrowLeft");
    const arrowUp = await move(() => page.keyboard.press("ArrowUp"));
    expect(arrowUp.y, `the up arrow moves the ground up (moved ${arrowUp.x},${arrowUp.y})`).toBeLessThan(-min);
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(settle);
  }
  if (autoTurn) {
    const turn = await move(async () => {
      await page.locator(controls).evaluate((el) => {
        el.controller.speed = 6;
        el.controller.play();
      });
      await page.waitForTimeout(1500);
      await page.locator(controls).evaluate((el) => el.pause());
    });
    if (autoTurn === "right") expect(turn.x, `Auto-turn moves the ground right (moved ${turn.x},${turn.y})`).toBeGreaterThan(min);
    else expect(turn.x, `Auto-turn moves the ground left (moved ${turn.x},${turn.y})`).toBeLessThan(-min);
  }
}

/**
 * Exact grab: a drag of a few pixels moves the ground at the middle of the view by as many pixels, so the touched point stays under the pointer. Use it on a globe or any piece
 * whose on-screen radius is known (`radius`, in pixels), with the view set to `grab-radius` to match.
 * @param {import("@playwright/test").Page} page
 * @param {{ view: string, picture?: string, radius: number, tolerance?: number, settle?: number, reach?: number }} options
 *   `picture` is what is photographed (the view by default; see `checkFollowsTheHand`); `tolerance` is the share of the drag the ground may differ by (0.2).
 */
export async function checkExactGrab(page, options) {
  const { view, picture = view, radius, tolerance = 0.2, settle = 600, reach } = options;
  const target = page.locator(view);
  const photo = page.locator(picture);
  const pixels = Math.max(12, Math.round(radius * 0.15));
  const moved = await movedBy(page, photo, () => dragBy(page, target, pixels, 0), { settle, reach: reach ?? pixels * 2 });
  expect(Math.abs(moved.x - pixels), `a drag of ${pixels} px moves the ground at the middle by ${pixels} px, within ${Math.round(tolerance * 100)}% (moved ${moved.x},${moved.y})`).toBeLessThanOrEqual(Math.max(2, pixels * tolerance));
  expect(Math.abs(moved.y), "and not up or down").toBeLessThanOrEqual(Math.max(2, pixels * tolerance));
  await dragBy(page, target, -pixels, 0);
  const upward = await movedBy(page, photo, () => dragBy(page, target, 0, -pixels), { settle, reach: reach ?? pixels * 2 });
  expect(Math.abs(upward.y + pixels), `a drag up of ${pixels} px moves the ground at the middle up by ${pixels} px, within ${Math.round(tolerance * 100)}% (moved ${upward.x},${upward.y})`).toBeLessThanOrEqual(Math.max(2, pixels * tolerance));
  await dragBy(page, target, 0, pixels);
}
