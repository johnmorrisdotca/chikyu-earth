// Auto-turn's pace is kept in the address: a reload or a shared link opens on the pace the reader chose, on the look it was chosen on.
import { expect, test, type Page } from "@playwright/test";

const CONTROLS = "kazoku-view-controls";
const paceButton = (page: Page, pace: number) => page.locator(`${CONTROLS} kazoku-speed-buttons button[data-v="${pace}"]`);

async function showPaces(page: Page): Promise<void> {
  await expect(page.locator(`${CONTROLS} .bar`)).toBeVisible();
  if ((await page.locator(`${CONTROLS} [data-b="more"]`).getAttribute("aria-expanded")) !== "true") await page.locator(`${CONTROLS} [data-b="more"]`).click();
}

async function openRealistic(page: Page, query: string): Promise<void> {
  await page.goto(`/chikyu-earth/?look=realistic&time=2026-11-10T04:00Z&speed=0&${query}`);
  await page.locator("chikyu-earth-realistic[data-state=live]").waitFor({ timeout: 90_000 });
  await showPaces(page);
}

test("the 3D look a link opens on keeps the pace the link names, and a look chosen later starts at its own", async ({ page }) => {
  await openRealistic(page, "pace=2");
  await expect(page.locator(CONTROLS)).toHaveAttribute("pace", "2");
  await expect(paceButton(page, 2)).toHaveAttribute("aria-pressed", "true");

  await paceButton(page, 0.5).click();
  await expect(page).toHaveURL(/[?&]pace=0\.5(&|$)/);
  await page.reload();
  await page.locator("chikyu-earth-realistic[data-state=live]").waitFor({ timeout: 90_000 });
  await showPaces(page);
  await expect(paceButton(page, 0.5), "the reload opens on the pace chosen").toHaveAttribute("aria-pressed", "true");

  await page.locator('button[data-style="line"]').click();
  await expect(page.locator(CONTROLS), "the line globe starts at its own pace, a turn in a minute").toHaveAttribute("pace", "1440");
});

// The view controls keep a pace of 1 in the address when the page starts at another (kazoku-ui 0.38.1), so a reload opens on the 1× chosen and not on the 1440× this page starts at.
test("the line globe's 1× (the Earth's real rate) is kept in the address, and a reload opens on it", async ({ page }) => {
  await page.goto("/chikyu-earth/");
  await showPaces(page);
  await expect(paceButton(page, 1440)).toHaveAttribute("aria-pressed", "true");
  await paceButton(page, 1).click();
  await expect(page).toHaveURL(/[?&]pace=1(&|$)/);
  await page.reload();
  await showPaces(page);
  await expect(paceButton(page, 1), "the reload opens on 1×").toHaveAttribute("aria-pressed", "true");
  // the pace buttons are what a reader sees and the address is what a link carries; the `pace` attribute stays the page's own start (1440), which the address overrides, so it is not asserted
  await expect(page).toHaveURL(/[?&]pace=1(&|$)/);
});
