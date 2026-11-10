// The credits: every page of the demo shows where its pictures and numbers come from, and a link to every credit, without opening a menu. The family pages carry them in the footer, the bare pages made for an iframe
// in the top corner (the globe) or under the list (the passes). On a phone none of it runs off the side or sits on a control.
import { expect, test, type Page } from "@playwright/test";

const NOTICE = "https://github.com/johnmorrisdotca/chikyu-earth/blob/main/NOTICE.md";
const PAGES = ["", "kids.html", "passes.html"];
const FLAT_FRAMES = ["embed.html", "embed.html?look=thick&graticule=1&center=10,30", "passes-embed.html", "passes-embed.html?lat=51.5&lon=-0.12&sat=all"];

/** The link's box is on the page, and the page is no wider than the screen. */
async function fits(page: Page, selector: string): Promise<void> {
  const box = (await page.locator(selector).first().boundingBox())!;
  const size = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(size.width + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width + 1);
}

/** The globe frame has no button, field or other link for the corner credit to sit on, and the passes frame's credit comes after its list, never on top of it. */
async function coversNothing(page: Page, path: string): Promise<void> {
  if (path.startsWith("embed")) {
    expect(await page.locator("button, input, select, a:not([data-testid=frame-credit])").count()).toBe(0);
    return;
  }
  const credit = (await page.getByTestId("frame-credit").boundingBox())!;
  const list = (await page.locator("chikyu-passes").boundingBox())!;
  expect(credit.y).toBeGreaterThanOrEqual(list.y + list.height - 1);
}

for (const lang of ["en", "ja"] as const) {
  for (const path of PAGES) {
    test(`${path || "the home page"} in ${lang} shows its sources and a link to every credit in the footer`, async ({ page }) => {
      await page.goto(`/chikyu-earth/${path}${path.includes("?") ? "&" : "?"}lang=${lang}`);
      const footer = page.locator("footer");
      await expect(footer.locator('[data-say="foot"]')).toContainText(lang === "ja" ? "Natural Earth、地球の画像はNASA" : "country outlines from Natural Earth, Earth pictures from NASA");
      const all = footer.locator(`a[href="${NOTICE}"]`);
      await expect(all).toBeVisible();
      await expect(all).toContainText(lang === "ja" ? "出典" : "credit");
      await all.scrollIntoViewIfNeeded();
      await fits(page, `footer a[href="${NOTICE}"]`);
    });
  }
  for (const path of FLAT_FRAMES) {
    test(`${path} in ${lang} names its sources and links every credit`, async ({ page }) => {
      await page.goto(`/chikyu-earth/${path}${path.includes("?") ? "&" : "?"}lang=${lang}`);
      // the page is ready when the globe is drawn or the list of passes is made: only then is the credit where it will stay
      await expect(page.locator("body[data-ready=true]")).toHaveCount(1);
      const credit = page.getByTestId("frame-credit");
      await expect(credit).toBeVisible();
      await expect(credit).toHaveAttribute("href", NOTICE);
      if (path.startsWith("embed")) await expect(credit).toContainText(lang === "ja" ? "輪郭：Natural Earth" : "Outlines: Natural Earth");
      else await expect(credit).toContainText(lang === "ja" ? "出典" : "Every credit");
      await fits(page, '[data-testid="frame-credit"]');
      await coversNothing(page, path);
    });
  }
}

test("the code builder shows its sources and a link to every credit", async ({ page }) => {
  await page.goto("/chikyu-earth/builder.html");
  const all = page.locator(`footer a[href="${NOTICE}"]`);
  await expect(all).toBeVisible();
  await expect(page.locator("footer")).toContainText("Natural Earth");
  await fits(page, `footer a[href="${NOTICE}"]`);
});
