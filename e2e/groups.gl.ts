// The satellite groups, Find and Ride in the demo, on made-up element files (test/madeup-elements.ts) served in place of the demo's own, so no real data and no request out of the page.
import { expect, test, type Page } from "@playwright/test";
import { SATELLITE_GROUPS } from "../src/satellites/catalogue.ts";
import { buildAll } from "../scripts/elements.ts";
import { madeUp } from "../test/madeup-elements.ts";

test.describe.configure({ mode: "serial" });

const SPACE = "chikyu-space";
const T = "2026-11-03T13:00Z";
const built = buildAll((group) => ({ raw: madeUp(group, group.id === "starlink" ? 50 : group.id === "gps" ? 6 : 4, "2026-11-03T12:00:00"), retrieved: "2026-11-03T12:30Z" }));
const files: Record<string, unknown> = { ...built.files, "manifest.json": built.manifest };

async function open(page: Page, query = ""): Promise<string[]> {
  const outside: string[] = [];
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") {
      outside.push(url.href);
      return route.abort();
    }
    const name = url.pathname.split("/elements/")[1];
    if (url.pathname.includes("/elements/") && name && name in files) return route.fulfill({ json: files[name] });
    if (url.pathname.includes("/elements/")) return route.fulfill({ status: 404, body: "not found" });
    return route.continue();
  });
  await page.goto(`/chikyu-earth/?look=space&time=${T}&speed=0${query}`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { pause(): void }).pause());
  return outside;
}
const groupButton = (page: Page, id: string) => page.locator(`#sat-groups [data-sat-group="${id}"]`);
const placed = (page: Page): Promise<number> => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { satellites: { placed: number } }).satellites.placed);

test("every group of the catalogue is a button, in the catalogue's order, none a browser-default control", async ({ page }) => {
  await open(page);
  const labels = await page.locator("#sat-groups button").allTextContents();
  expect(labels).toEqual(SATELLITE_GROUPS.map((group) => group.label));
  for (const box of await page.locator("#sat-groups button").all()) expect((await box.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(page.locator("#sat-groups select")).toHaveCount(0);
});

test("a group switches on and off, says what it is, and its satellites are drawn", async ({ page }) => {
  const outside = await open(page);
  await groupButton(page, "gps").dispatchEvent("click");
  await expect(groupButton(page, "gps")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#sat-about")).toContainText("GPS");
  await expect.poll(() => placed(page), { timeout: 20_000 }).toBe(6);
  await expect(page.locator("#sat-note")).toContainText("6 satellites shown");
  await groupButton(page, "geostationary").dispatchEvent("click");
  await expect.poll(() => placed(page), { timeout: 20_000 }).toBe(10);
  await expect(page.locator("#sat-about")).toContainText("sits still");
  await groupButton(page, "gps").dispatchEvent("click");
  await expect.poll(() => placed(page), { timeout: 20_000 }).toBe(4);
  expect(outside).toEqual([]);
});

test("Find finds a satellite by name or number, switches its group on and marks it; a number the groups lack finds nothing", async ({ page }) => {
  await open(page);
  await page.locator("#sat-search").fill("made-up gps 3");
  const first = page.locator("#sat-results button").first();
  await expect(first).toContainText("MADE-UP GPS 3");
  await first.dispatchEvent("click");
  await expect(groupButton(page, "gps")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#sat-info")).toContainText("MADE-UP GPS 3");
  await expect.poll(() => new URL(page.url()).searchParams.get("sat")).not.toBeNull();
  await page.locator("#sat-search").fill("zzzzzz");
  await expect(page.locator("#sat-results")).toContainText("No satellite");
});

test("Ride: the chosen satellite, and one from the last group; nothing chosen asks for a choice", async ({ page }) => {
  await open(page);
  await page.locator("#sat-groups").getByRole("button", { name: "Iridium" }).dispatchEvent("click");
  await expect.poll(() => placed(page), { timeout: 20_000 }).toBe(4);
  await page.getByRole("group", { name: "Ride along" }).getByRole("button", { name: "The chosen satellite" }).dispatchEvent("click");
  await expect(page.locator("#status")).toContainText(/choose a satellite/i);
  expect(await page.locator(SPACE).evaluate((el) => Reflect.get(el, "riding"))).toBeFalsy();
  await page.getByRole("group", { name: "Ride along" }).getByRole("button", { name: "One from the last group" }).dispatchEvent("click");
  await expect(page.locator("#ride-info")).toContainText("MADE-UP IRIDIUM");
  await page.getByRole("group", { name: "Ride along" }).getByRole("button", { name: "Stop" }).dispatchEvent("click");
  await page.locator("#sat-search").fill("made-up oneweb 2");
  await page.locator("#sat-results button").first().dispatchEvent("click");
  await expect(page.locator("#sat-info")).toContainText("MADE-UP ONEWEB 2");
  await page.getByRole("group", { name: "Ride along" }).getByRole("button", { name: "The chosen satellite" }).dispatchEvent("click");
  await expect(page.locator("#ride-info")).toContainText("MADE-UP ONEWEB 2");
  await expect.poll(() => new URL(page.url()).searchParams.get("ride")).toBe("chosen");
});

test("the address brings back the groups, the chosen satellite and the ride", async ({ page }) => {
  await open(page, `&sats=gps&sat=${900_000 + SATELLITE_GROUPS.findIndex((group) => group.id === "gps") * 1000 + 1}&ride=chosen`);
  await expect(groupButton(page, "gps")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#ride-info")).toContainText("MADE-UP");
});
