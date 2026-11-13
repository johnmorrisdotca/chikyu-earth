// The demo's Find box matches a Japanese name. A kana query used to be thrown away before the catalogue was asked.
import { expect, test } from "@playwright/test";

test("typing ハッブル finds Hubble", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/chikyu-earth/?look=space&time=2026-11-02T18:00Z&speed=0");
  await page.locator("chikyu-space[data-state=live]").waitFor({ timeout: 60_000 });
  const search = page.locator("#sat-search");
  await expect(search).toBeVisible();
  await search.fill("ハッブル");
  const hit = page.locator("#sat-results button", { hasText: "Hubble" });
  await expect(hit).toHaveCount(1);
  await expect(page.locator("#sat-results")).toBeVisible();
});
