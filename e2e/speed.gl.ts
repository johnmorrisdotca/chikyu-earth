import { expect, test } from "@playwright/test";

// The space view's time speed through the family's speed buttons: a press sets the clock's speed and the address, 1× is the start and leaves the address, and Now goes back to it.
const SPACE = "chikyu-space";
const press = (page: import("@playwright/test").Page, value: number) => page.locator(`#time-speed button[data-v="${value}"]`);

test("a press of 3600× runs the clock an hour a second and is kept in the address; Now puts it back to 1×", async ({ page }) => {
  await page.goto("/chikyu-earth/?look=space&time=2026-11-02T14:00Z&speed=0&center=-100,40");
  await page.locator(`${SPACE}[data-state=live]`).waitFor();
  await expect(press(page, 0)).toHaveAttribute("aria-pressed", "true");
  await press(page, 3600).click();
  expect(await page.locator(SPACE).evaluate((el) => Reflect.get(el, "speed") as number)).toBe(3600);
  await expect(page).toHaveURL(/speed=3600/);
  await press(page, -3600).click();
  expect(await page.locator(SPACE).evaluate((el) => Reflect.get(el, "speed") as number)).toBe(-3600);
  await expect(press(page, -3600)).toHaveAttribute("aria-pressed", "true");
  await press(page, 1).click();
  await expect(page).not.toHaveURL(/speed=/);
  await press(page, 86400).click();
  await page.locator("#now").click();
  expect(await page.locator(SPACE).evaluate((el) => Reflect.get(el, "speed") as number)).toBe(1);
  await expect(press(page, 1)).toHaveAttribute("aria-pressed", "true");
});
