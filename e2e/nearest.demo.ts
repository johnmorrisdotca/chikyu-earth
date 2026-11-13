// Picking a satellite lists the nearest others. The line is the page's own text, from one call to nearest, not a timer.
import { expect, test } from "@playwright/test";
import { COUNT_SCRIPT, counts, untilStill } from "./gl.ts";

test("picking the ISS lists the nearest satellites, then nothing is drawn", async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto("/chikyu-earth/?look=space&speed=0&time=2026-11-09T12:00Z");
  await page.locator("chikyu-space[data-state=live]").waitFor({ timeout: 60_000 });
  await page.locator("kazoku-view-controls").evaluate((el) => (el as HTMLElement & { pause(): void }).pause());
  await page.locator("[data-sat-find='25544']").click();
  const info = page.locator("#sat-info");
  await expect(info).toContainText("Nearest:", { timeout: 30_000 });
  expect(await info.innerText()).toMatch(/Nearest: .+\d+ km/);
  await untilStill(page);
  const rest = await counts(page);
  await untilStill(page);
  expect((await counts(page)).draws, "no draw at rest").toBe(rest.draws);
  expect((await counts(page)).rafRequests).toBe(rest.rafRequests);
});
