import { expect, test } from "@playwright/test";

// The space view's time speed through the family's replay bar: a speed alone moves nothing until Play, Play is kept in the address, the speed is kept when it is not the hour a second the bar starts at, and Now keeps the clock as it is.
// The replay bar leaves Play off for a reader who prefers reduced motion (the config's default), so this is a reader with no preference.
test.use({ reducedMotion: "no-preference" });
const SPACE = "chikyu-space";
const press = (page: import("@playwright/test").Page, value: number) => page.locator(`#replay button[data-v="${value}"]`);
const speedOf = (page: import("@playwright/test").Page) => page.locator(SPACE).evaluate((el) => Reflect.get(el, "speed") as number);

test("Play runs the clock at the speed pressed and the address keeps it; 3600× is the start and leaves the address; Now goes on from now at the same speed", async ({ page }) => {
  await page.goto("/chikyu-earth/?look=space&time=2026-11-02T14:00Z&speed=0&center=-100,40");
  await page.locator(`${SPACE}[data-state=live]`).waitFor();
  await expect(page.locator('#replay [data-act="play"]')).toHaveAttribute("aria-pressed", "false");
  expect(await speedOf(page)).toBe(0);
  await expect(press(page, 3600)).toHaveAttribute("aria-pressed", "true");
  await press(page, 86400).click();
  expect(await speedOf(page), "a speed alone moves nothing").toBe(0);
  await expect(page).toHaveURL(/speed=86400/);
  await page.locator('#replay [data-act="play"]').click();
  expect(await speedOf(page)).toBe(86400);
  await expect(page).toHaveURL(/play=on/);
  await press(page, -3600).click();
  expect(await speedOf(page)).toBe(-3600);
  await expect(press(page, -3600)).toHaveAttribute("aria-pressed", "true");
  await press(page, 3600).click();
  expect(await speedOf(page)).toBe(3600);
  await expect(page).not.toHaveURL(/speed=/);
  await press(page, 86400).click();
  await page.locator("#now").click();
  expect(await speedOf(page), "Now does not stop or change the clock").toBe(86400);
  await expect(press(page, 86400)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#now")).toHaveAttribute("aria-pressed", "true");
});
