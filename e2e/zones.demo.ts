// The date the page shows is the page's own local time (MODULES-955). CI runs in UTC, so a box that showed UTC would pass there and fail on a Mac. The check is made inside the page: the runner's time-zone data can disagree with the browser's (in November 2026 Node put America/Vancouver an hour away from Chromium).
import { expect, test, type Page } from "@playwright/test";

const START = "2026-11-02T18:00:00Z";

test.beforeEach(({ browserName }, info) => {
  test.skip(browserName !== "chromium" || info.project.name !== "chromium-desk", "the zone is set on the desk Chromium");
});

/** Every local date box on the page, compared with `new Date` in that page. */
async function boxesMatchThePage(page: Page, zone: string): Promise<void> {
  await page.goto(`/chikyu-earth/?look=space&speed=0&time=${START}`);
  await page.locator("chikyu-space[data-state=live]").waitFor({ timeout: 90_000 });
  const read = await page.evaluate((iso) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const inputs = [...document.querySelectorAll("input[type='datetime-local']")].map((el) => ({
      id: el.id,
      value: (el as HTMLInputElement).value.slice(0, 16),
    }));
    return { local, zone: Intl.DateTimeFormat().resolvedOptions().timeZone, inputs };
  }, START);
  expect(read.zone, "the browser is in the zone under test").toBe(zone);
  expect(read.inputs.length, "the page shows a date").toBeGreaterThan(0);
  for (const input of read.inputs) expect(input.value, `${input.id} is the page's local time`).toBe(read.local);
}

test.describe("America/Vancouver", () => {
  test.use({ timezoneId: "America/Vancouver" });

  test("the shown time matches the page's own date", async ({ page }) => {
    await boxesMatchThePage(page, "America/Vancouver");
  });
});

test.describe("Asia/Tokyo", () => {
  test.use({ timezoneId: "Asia/Tokyo" });

  test("the shown time matches the page's own date", async ({ page }) => {
    await boxesMatchThePage(page, "Asia/Tokyo");
  });
});
