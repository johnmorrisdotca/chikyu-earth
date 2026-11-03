import { expect, test, type Page } from "@playwright/test";

// The family's speed buttons in the demo: the Earth's Auto-turn (0.5×, 1×, 2× of the real rate) in the view controls, and the space view's time speed (multiples of real time).
// The pages open with reduced motion (the config's default), so the buttons stepping here is the reduced-motion check too.
const CONTROLS = "kazoku-view-controls";
const speedButton = (page: Page, value: number) => page.locator(`${CONTROLS} kazoku-speed-buttons button[data-v="${value}"]`);

test("Auto-turn has the family's 0.5×, 1× and 2×, kept in the attribute and the address, and the Earth's own rate is the 1×", async ({ page }) => {
  await page.goto("/chikyu-earth/");
  await expect(page.locator(`${CONTROLS} .bar`)).toBeVisible();
  if ((await page.locator(`${CONTROLS} [data-b="more"]`).getAttribute("aria-expanded")) !== "true") await page.locator(`${CONTROLS} [data-b="more"]`).click();
  await expect(page.locator(`${CONTROLS} kazoku-speed-buttons button`)).toHaveText(["0.5×", "1×", "2×"]);
  await expect(speedButton(page, 1)).toHaveAttribute("aria-pressed", "true");
  expect(await page.locator(CONTROLS).evaluate((el) => Reflect.get(el, "controller").speed as number)).toBeCloseTo(0.004178, 6);
  await speedButton(page, 2).click();
  expect(await page.locator(CONTROLS).evaluate((el) => Reflect.get(el, "controller").speed as number)).toBeCloseTo(0.008356, 6);
  await expect(page.locator(CONTROLS)).toHaveAttribute("pace", "2");
  await expect(page).toHaveURL(/pace=2/);
  await speedButton(page, 1).click();
  await expect(page).not.toHaveURL(/pace=/);
});

test("the time speed row is the same speed buttons, in multiples of real time, and the page keeps no buttons of its own for it", async ({ page }) => {
  await page.goto("/chikyu-earth/?look=space&speed=86400&time=2026-11-02T14:00Z");
  const time = page.locator("#time-speed");
  await expect(time.locator("button")).toHaveText(["0×", "1×", "3600×", "86400×", "−3600×"]);
  await expect(time.locator('button[data-v="86400"]')).toHaveAttribute("aria-pressed", "true");
  expect(await page.locator("[data-speed]").count()).toBe(0);
});
