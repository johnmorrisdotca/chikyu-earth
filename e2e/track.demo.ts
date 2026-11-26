// The small flat map: one satellite's point, its ground track and the night side, drawn by chizu. The moment is fixed by `at`.
import { expect, test } from "@playwright/test";

const PAGE = "/chikyu-earth/track.html?at=2026-11-03T12:00:00Z";

test("it draws the night side, the ground track and the point under the satellite, and no WebGL", async ({ page }) => {
  await page.goto(PAGE);
  const map = page.locator("chikyu-track");
  await expect(map.locator(".cz-overlay-area").first()).toBeAttached();
  await expect(map.locator(".cz-overlay-line[data-id='past']").first()).toBeAttached();
  await expect(map.locator(".cz-overlay-line[data-id='coming']").first()).toBeAttached();
  await expect(map.locator(".cz-overlay-mark").first()).toBeAttached();
  await expect(map.locator("canvas")).toHaveCount(0);
  await expect(map.locator(".czm-controls")).toHaveCount(0);
});
