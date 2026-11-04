// The code builder page and the index page's "Put it in your page" are the family's <kazoku-embed-panel>: the code is for exactly what is chosen, in every way a page is made, and nothing
// the panels had before is gone (the ten places, the three looks, the graticule, the four sizes, Copy, the embed page, the docs and the credit line).
import { expect, test, type Page } from "@playwright/test";

const PANEL = "#embed-panel";
const code = (page: Page) => page.locator(`${PANEL} [part="code"]`);

test("the code builder writes the code for exactly what is chosen, and nothing scrolls sideways", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  await page.goto("/chikyu-earth/builder.html");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
  await expect(code(page)).toContainText('center="139.7,35.7"');
  await page.locator(`${PANEL} [part="item"][data-id="london"]`).click();
  await page.locator('[data-testid="embed-looks-line"]').click();
  await page.locator('[data-testid="embed-graticules-off"]').click();
  await page.locator(`${PANEL} [part="size-button"]`, { hasText: "420" }).click();
  await expect(code(page)).toContainText('center="-0.13,51.51"');
  await expect(code(page)).toContainText('look="line"');
  await expect(code(page)).toContainText('size="420"');
  await expect(code(page)).not.toContainText("graticule");
  await expect(page.locator(`${PANEL} [part="preview"] chikyu-earth`)).toHaveAttribute("center", "-0.13,51.51");
  await page.locator(`${PANEL} button[data-kind="iframe"]`).click();
  await expect(code(page)).toContainText("embed.html?look=line&amp;center=-0.13,51.51");
  await expect(page.locator(`${PANEL} [part="open"]`)).toHaveAttribute("href", /embed\.html\?.*look=line/);
  await page.locator(`${PANEL} button[data-kind="react"]`).click();
  await expect(code(page)).toContainText("useEffect");
  await page.locator('[data-testid="embed-looks-realistic"]').click();
  await expect(code(page)).toContainText("realistic/element");
  await expect(code(page)).toContainText("texture-base");
  await expect(code(page)).toContainText('style={{ display: "block", width: 420 }}');
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sideways).toBeLessThanOrEqual(0);
  expect(problems).toEqual([]);
});

for (const [name, url] of [["the code builder", "/chikyu-earth/builder.html"], ["the index page", "/chikyu-earth/"]] as const) {
  test(`${name} keeps everything its panel had: ten places, three looks, the graticule, four sizes, seven ways, Copy, the two links and the credit`, async ({ page }) => {
    await page.goto(url);
    const panel = page.locator(PANEL);
    await panel.scrollIntoViewIfNeeded();
    await expect(panel.locator('[part="item"]')).toHaveCount(10);
    await expect(panel.locator('[part="item"]')).toHaveText(["Tokyo", "Toronto", "London", "New York", "São Paulo", "Cairo", "Nairobi", "Mumbai", "Sydney", "Reykjavik"]);
    await expect(page.locator('[data-testid^="embed-looks-"]')).toHaveText(["Line", "Thick", "Realistic"].map((one) => new RegExp(`^${one}$`, "i")));
    await expect(page.locator('[data-testid^="embed-graticules-"]')).toHaveText(["On", "Off"]);
    await expect(panel.locator('[part="size-button"]')).toHaveText(["240", "320", "420", "560"]);
    await expect(panel.locator('[part="size-button"][aria-pressed="true"]')).toHaveText("320");
    await expect(panel.locator('[role="tab"]')).toHaveText(["HTML", "ES module", "React", "Vue", "Angular", "Svelte", "iframe"]);
    await expect(panel.locator(name === "the code builder" ? '[part="preview"] chikyu-earth' : '[part="preview"] iframe')).toHaveCount(1);
    await expect(panel.locator('[part="copy"]')).toHaveText("Copy code");
    await expect(panel.locator('[part="open"]')).toHaveText("Open the embed page");
    await expect(panel.locator('[part="open"]')).toHaveAttribute("href", /^embed\.html\?look=thick&center=139\.7,35\.7&graticule=1/);
    await expect(panel.locator('[part="docs"]')).toHaveText("Read the docs");
    await expect(panel.locator('[part="docs"]')).toHaveAttribute("href", "docs/");
    await expect(panel.locator('[part="credits"]')).toContainText("Natural Earth");
    await panel.locator('[role="tab"]', { hasText: "iframe" }).click();
    await expect(panel.locator('[part="note"]')).toContainText("One iframe, no script of your own");
    await expect(panel.locator('[part="preview"] iframe')).toHaveAttribute("src", /^embed\.html\?look=thick/);
  });
}

test("the page does not move when it opens: the panel's chosen place is not scrolled into view", async ({ page }) => {
  await page.goto("/chikyu-earth/");
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("the index page's picture never runs a second realistic Earth: the flat globe stands in", async ({ page }) => {
  await page.goto("/chikyu-earth/");
  await page.locator(PANEL).scrollIntoViewIfNeeded();
  await page.locator('[data-testid="embed-looks-realistic"]').click();
  await expect(page.locator(`${PANEL} [part="code"]`)).toContainText("chikyu-earth-realistic");
  await expect(page.locator(`${PANEL} [part="credits"]`)).toContainText("NASA");
  await expect(page.locator(`${PANEL} [part="preview"] iframe`)).toHaveAttribute("src", /^embed\.html\?look=thick/);
  await expect(page.locator(`${PANEL} [part="preview"] iframe`)).toHaveCount(1);
  await page.locator(`${PANEL} [role="tab"]`, { hasText: "iframe" }).click();
  await expect(page.locator(`${PANEL} [part="preview"] iframe`)).toHaveAttribute("src", /^embed\.html\?look=thick/);
  await expect(page.locator("chikyu-earth")).toHaveCount(1);
  await expect(page.locator(`${PANEL} [part="preview"] chikyu-earth-realistic`)).toHaveCount(0);
});
