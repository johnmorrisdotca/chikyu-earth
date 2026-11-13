// The satellites page offers one group at a time, on the desk, the phone and WebKit.
import { expect, test } from "@playwright/test";

test("the one-group row focuses GPS and then shows every group again", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/chikyu-earth/?look=space&time=2026-11-02T18:00Z&speed=0&sats=stations,gps");
  await page.locator("chikyu-space[data-state=live]").waitFor({ timeout: 60_000 });
  await expect.poll(async () => page.locator("chikyu-space").evaluate((el) => (Reflect.get(el, "satelliteGroups") as { name: string }[]).length), { timeout: 20_000 }).toBe(2);
  const focus = page.locator("#sat-focus");
  await expect(focus).toBeVisible();
  await focus.locator("[data-sat-focus=gps]").click();
  await expect.poll(async () => page.locator("chikyu-space").evaluate((el) => {
    const groups = Reflect.get(el, "satelliteGroups") as { name: string; emphasis: string; placed: number; count: number }[];
    const gps = groups.find((group) => group.name === "gps");
    const stations = groups.find((group) => group.name === "stations");
    return Reflect.get(el, "focusedSatelliteGroup") === "gps" && gps?.emphasis === "focus" && gps.placed === gps.count && stations?.emphasis === "dim";
  }), { timeout: 20_000 }).toBe(true);
  await expect(page).toHaveURL(/focus=gps/);
  await focus.locator("[data-sat-focus='']").click();
  await expect.poll(async () => page.locator("chikyu-space").evaluate((el) => Reflect.get(el, "focusedSatelliteGroup"))).toBeNull();
  await expect.poll(async () => page.locator("chikyu-space").evaluate((el) => (Reflect.get(el, "satelliteGroups") as { emphasis: string }[]).every((group) => group.emphasis === "plain"))).toBe(true);
});
