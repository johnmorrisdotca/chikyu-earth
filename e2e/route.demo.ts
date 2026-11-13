// The route between two places: the line globe, the realistic Earth and the space view, and nothing drawn at rest.
import { expect, test, type Page } from "@playwright/test";
import { COUNT_SCRIPT, counts, untilStill } from "./gl.ts";

const ROUTE = "139.69,35.69,-0.13,51.51";

test.describe.configure({ mode: "serial" });

async function open(page: Page): Promise<void> {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto("/chikyu-earth/?look=line&speed=0");
  await page.locator("chikyu-earth").waitFor();
  await page.locator("kazoku-view-controls").evaluate((el) => (el as HTMLElement & { pause(): void }).pause());
}

test("the line globe, the realistic Earth and the space view draw Tokyo to London, and then nothing", async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  await page.locator("#route-from").selectOption("Tokyo");
  await page.locator("#route-to").selectOption("London");
  await expect(page.locator("chikyu-earth")).toHaveAttribute("route", ROUTE);
  await expect(page.locator("#route-note")).toContainText("9582 km");
  const line = await page.locator("chikyu-earth").evaluate((el) => {
    const info = Reflect.get(el, "routeInfo") as { kilometres: number; initialBearing: number; flightHours: number };
    const path = el.shadowRoot?.querySelector("path[stroke='#7df9ff']")?.getAttribute("d") ?? "";
    return { km: info.kilometres, bearing: info.initialBearing, hours: info.flightHours, path };
  });
  expect(line.km).toBeCloseTo(9582.031, 2);
  expect(line.bearing).toBeCloseTo(336.27, 1);
  expect(line.hours).toBeCloseTo(10.647, 2);
  expect(line.path.length).toBeGreaterThan(20);

  await page.getByRole("button", { name: "Realistic", exact: true }).click();
  const earth = page.locator("chikyu-earth-realistic");
  await page.locator("chikyu-earth-realistic[data-state=live]").waitFor({ timeout: 90_000 });
  await expect.poll(async () => earth.evaluate((el) => (Reflect.get(el, "stats") as { route: { on: boolean; kilometres: number } }).route.on)).toBe(true);
  const km = await earth.evaluate((el) => (Reflect.get(el, "stats") as { route: { kilometres: number } }).route.kilometres);
  expect(km).toBeCloseTo(9582.031, 2);
  await untilStill(page);
  const rest = await counts(page);
  await untilStill(page);
  expect((await counts(page)).draws, "no draw at rest").toBe(rest.draws);
  expect((await counts(page)).rafRequests).toBe(rest.rafRequests);

  await page.getByRole("button", { name: "Space", exact: true }).click();
  const space = page.locator("chikyu-space");
  await page.locator("chikyu-space[data-state=live]").waitFor({ timeout: 90_000 });
  await expect.poll(async () => space.evaluate((el) => (Reflect.get(el, "stats") as { route: { kilometres: number } }).route.kilometres)).toBeCloseTo(9582.031, 2);
  await untilStill(page);
  const held = await counts(page);
  await untilStill(page);
  expect((await counts(page)).draws, "the space view draws nothing at rest").toBe(held.draws);
});
