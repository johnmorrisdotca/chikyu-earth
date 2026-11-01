import { expect, test } from "@playwright/test";

test("the globe draws country outlines", async ({ page }) => {
  await page.goto("/chikyu-earth/");
  await expect(page.locator("chikyu-earth svg").first()).toBeVisible();
  expect(await page.locator("chikyu-earth path").count()).toBeGreaterThan(50);
});

test("the style control switches the drawing", async ({ page }) => {
  await page.goto("/chikyu-earth/");
  await page.getByRole("button", { name: "Thick" }).click();
  await expect(page.locator("chikyu-earth")).toHaveAttribute("style", "thick");
});
