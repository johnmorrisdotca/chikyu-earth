// The credits of the globe frame's two looks that draw WebGL (the realistic Earth and the space view): the credit is put on the page before anything is drawn, so this does not wait for the picture.
import { expect, test } from "@playwright/test";
import { routeElements } from "./recorded.ts";

const NOTICE = "https://github.com/johnmorrisdotca/chikyu-earth/blob/main/NOTICE.md";

test.beforeEach(({ page }) => routeElements(page));

for (const [look, extra] of [["realistic", "Pictures: NASA."], ["space&satellites=stations", "Orbits: CelesTrak, Space-Track.org."]] as const) {
  test(`the ${look.split("&")[0]} frame names its sources in a corner`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/chikyu-earth/embed.html?look=${look}`);
    const credit = page.getByTestId("frame-credit");
    await expect(credit).toBeVisible();
    await expect(credit).toContainText("Outlines: Natural Earth.");
    await expect(credit).toContainText(extra);
    await expect(credit).toHaveAttribute("href", NOTICE);
    const box = (await credit.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  });
}
