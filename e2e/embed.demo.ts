import { expect, test } from "@playwright/test";

const EMBED = "/chikyu-earth/embed.html";

test("the embed page draws the globe the address asks for, and nothing else", async ({ page }) => {
  const asked: string[] = [];
  page.on("request", (request) => asked.push(new URL(request.url()).pathname));
  await page.goto(`${EMBED}?look=thick&center=10,30&graticule=1`);
  await expect(page.locator("chikyu-earth svg")).toBeVisible();
  const element = page.locator("chikyu-earth");
  await expect(element).toHaveAttribute("style", "thick");
  await expect(element).toHaveAttribute("center", "10,30");
  await expect(element).toHaveAttribute("graticule", "");
  expect(await page.locator("chikyu-earth path").count()).toBeGreaterThan(50);
  expect(asked.filter((path) => /textures|three/.test(path))).toEqual([]);
  expect(asked.every((path) => path.startsWith("/chikyu-earth/"))).toBe(true);
});

test("by default it is still and has no controls and no geolocation prompt", async ({ page }) => {
  let asked = false;
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition: () => ((globalThis as { __asked?: boolean }).__asked = true) }, configurable: true });
  });
  await page.goto(EMBED);
  await expect(page.locator("chikyu-earth svg")).toBeVisible();
  asked = await page.evaluate(() => Boolean((globalThis as { __asked?: boolean }).__asked));
  expect(asked).toBe(false);
  expect(await page.locator("button, input, select").count()).toBe(0);
  const before = await page.locator("chikyu-earth").evaluate((el) => el.shadowRoot?.innerHTML ?? "");
  await page.waitForTimeout(1500);
  expect(await page.locator("chikyu-earth").evaluate((el) => el.shadowRoot?.innerHTML ?? "")).toBe(before);
});

test.describe("turning", () => {
  test.use({ reducedMotion: "no-preference" });

  test("turn=auto turns it by itself, and turn=1 only by hand", async ({ page }) => {
    await page.goto(`${EMBED}?turn=auto&center=0,0`);
    const holder = page.locator("chikyu-earth");
    await expect(holder.locator("svg")).toBeVisible();
    const before = await holder.evaluate((el) => el.shadowRoot?.innerHTML ?? "");
    await page.waitForTimeout(2600);
    expect(await holder.evaluate((el) => el.shadowRoot?.innerHTML ?? "")).not.toBe(before);

    await page.goto(`${EMBED}?turn=1&center=0,0`);
    await expect(page.locator("chikyu-earth svg")).toBeVisible();
    const still = await page.locator("chikyu-earth").evaluate((el) => el.shadowRoot?.innerHTML ?? "");
    await page.waitForTimeout(1500);
    expect(await page.locator("chikyu-earth").evaluate((el) => el.shadowRoot?.innerHTML ?? "")).toBe(still);
    const box = (await page.locator("#frame").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    expect(await page.locator("chikyu-earth").evaluate((el) => el.shadowRoot?.innerHTML ?? "")).not.toBe(still);
  });

  test("it stops turning while the tab is hidden", async ({ page }) => {
    await page.goto(`${EMBED}?turn=auto&center=0,0`);
    await expect(page.locator("chikyu-earth svg")).toBeVisible();
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { value: true, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(300);
    const held = await page.locator("chikyu-earth").evaluate((el) => el.shadowRoot?.innerHTML ?? "");
    await page.waitForTimeout(2200);
    expect(await page.locator("chikyu-earth").evaluate((el) => el.shadowRoot?.innerHTML ?? "")).toBe(held);
  });
});

test("the demo page shows the embed in a frame that loads", async ({ page }) => {
  await page.goto("/chikyu-earth/");
  const frame = page.frameLocator("iframe.embed-frame");
  await page.locator("iframe.embed-frame").scrollIntoViewIfNeeded();
  await expect(frame.locator("chikyu-earth svg")).toBeVisible();
});
