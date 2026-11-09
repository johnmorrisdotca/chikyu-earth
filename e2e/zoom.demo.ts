// Every live view zooms and pans: drag, two-finger pinch, the plain wheel at Fit (scrolls the page), Ctrl and the wheel, the keys and the limits, on the demo (whose bar owns the hands), the
// code builder's preview and the embed page (whose element carries them), at desk and phone sizes. The line globe needs no WebGL; the 3D looks are in zoom.gl.ts.
import { expect, test } from "@playwright/test";
import { checkHands, readBar, readElement } from "./hands.ts";

const LINE = { zoomMin: 0.1, zoomMax: 20 };

test("the demo's line globe: the bar's hands drag, wheel, key and stop at the element's limits", async ({ page }) => {
  await page.goto("/chikyu-earth/");
  await expect(page.locator("chikyu-earth svg")).toBeVisible();
  await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { pause(): void }).pause());
  await expect(page.locator("chikyu-earth")).toHaveAttribute("data-kazoku-bar", "");
  await checkHands(page, { selector: "chikyu-earth", read: readBar(page), limits: LINE, touch: true });
});

test("the code builder's preview carries its own hands", async ({ page }) => {
  await page.goto("/chikyu-earth/builder.html");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
  const preview = '[part="preview"] chikyu-earth';
  await expect(page.locator(preview)).toHaveCount(1);
  await expect(page.locator(preview)).not.toHaveAttribute("data-kazoku-bar", "");
  await checkHands(page, { selector: preview, read: readElement(page, preview), limits: LINE, tall: true, touch: true });
});

test("the embed page is still by default, and with turn=1 the element carries its hands", async ({ page }) => {
  await page.goto("/chikyu-earth/embed.html?look=thick&center=0,20");
  await expect(page.locator("chikyu-earth svg")).toBeVisible();
  await expect(page.locator("chikyu-earth")).toHaveAttribute("controls", "none");
  const still = await page.locator("chikyu-earth").evaluate((el) => el.shadowRoot?.innerHTML ?? "");
  const box = (await page.locator("#frame").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  expect(await page.locator("chikyu-earth").evaluate((el) => el.shadowRoot?.innerHTML ?? ""), "a drag on a still embed does nothing").toBe(still);

  await page.goto("/chikyu-earth/embed.html?look=thick&center=0,20&turn=1");
  await expect(page.locator("chikyu-earth svg")).toBeVisible();
  await expect(page.locator("chikyu-earth")).not.toHaveAttribute("controls", "none");
  await checkHands(page, { selector: "chikyu-earth", read: readElement(page, "chikyu-earth"), limits: LINE, wheel: "event", touch: true });
});

test("controls=none takes the hands off a line globe, and zoom-max sets its range", async ({ page }) => {
  await page.goto("/chikyu-earth/embed.html?look=thick&center=0,20&turn=1");
  await expect(page.locator("chikyu-earth svg")).toBeVisible();
  await page.locator("chikyu-earth").evaluate((el) => el.setAttribute("zoom-max", "8"));
  await expect.poll(async () => (await readElement(page, "chikyu-earth")()).zoomMax).toBe(8);
  await page.locator("chikyu-earth").evaluate((el) => el.setAttribute("controls", "none"));
  const before = await page.locator("chikyu-earth").evaluate((el) => el.shadowRoot?.innerHTML ?? "");
  const box = (await page.locator("chikyu-earth").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  expect(await page.locator("chikyu-earth").evaluate((el) => el.shadowRoot?.innerHTML ?? "")).toBe(before);
});
