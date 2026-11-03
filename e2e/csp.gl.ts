// A page with `style-src 'self'` and nothing inline: the three elements adopt their styles instead of writing a <style>, so the browser reports no style violation and the
// styles apply. The embed page is served with that policy and its own inline <style> removed (the page's own styles are not what is tested).
import { expect, test, type Page } from "@playwright/test";
import { COUNT_SCRIPT } from "./gl.ts";

const POLICY = "default-src 'self'; style-src 'self'; script-src 'self' 'unsafe-eval'; img-src 'self' data: blob:; connect-src 'self' data: blob:; worker-src blob:";

async function strict(page: Page, query: string): Promise<void> {
  await page.addInitScript(COUNT_SCRIPT);
  await page.addInitScript(() => {
    const seen: string[] = [];
    Reflect.set(window, "__violations", seen);
    document.addEventListener("securitypolicyviolation", (event) => seen.push(`${event.violatedDirective} ${event.blockedURI}`));
  });
  await page.route("**/chikyu-earth/embed.html*", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(/<style>[\s\S]*?<\/style>/, "");
    await route.fulfill({ response, body, headers: { ...response.headers(), "content-security-policy": POLICY } });
  });
  await page.goto(`/chikyu-earth/embed.html?${query}`);
}

const violations = (page: Page): Promise<string[]> => page.evaluate(() => Reflect.get(window, "__violations") as string[]);

test("the line globe adopts its styles under style-src 'self'", async ({ page }) => {
  await strict(page, "look=line");
  const globe = page.locator("chikyu-earth");
  await expect(globe.locator("svg")).toBeVisible();
  expect(await globe.evaluate((el) => getComputedStyle(el).display), "the stylesheet applies").toBe("block");
  expect(await globe.evaluate((el) => el.shadowRoot!.adoptedStyleSheets.length)).toBe(1);
  expect(await globe.evaluate((el) => el.shadowRoot!.querySelectorAll("style").length), "and no <style> was written").toBe(0);
  expect(await violations(page)).toEqual([]);
});

test("the realistic Earth adopts its styles under style-src 'self'", async ({ page }) => {
  await strict(page, "look=realistic&time=2026-06-21T12:00Z");
  const earth = page.locator("chikyu-earth-realistic");
  await expect(earth).toHaveAttribute("data-state", "live", { timeout: 60_000 });
  expect(await earth.evaluate((el) => getComputedStyle(el).aspectRatio), "the stylesheet applies").toBe("1 / 1");
  expect(await earth.evaluate((el) => el.shadowRoot!.querySelectorAll("style").length)).toBe(0);
  expect(await violations(page)).toEqual([]);
});

test("the space view adopts its styles under style-src 'self'", async ({ page }) => {
  await strict(page, "look=space&speed=0&time=2026-06-21T12:00Z");
  const space = page.locator("chikyu-space");
  await expect(space).toHaveAttribute("data-state", "live", { timeout: 60_000 });
  expect(await space.evaluate((el) => getComputedStyle(el).overflow), "the stylesheet applies").toBe("hidden");
  expect(await space.evaluate((el) => el.shadowRoot!.querySelectorAll("style").length)).toBe(0);
  expect(await violations(page)).toEqual([]);
});
