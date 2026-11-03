// The code builder page: one screen of choices, and the code for exactly what is chosen, for every way a page is made.
import { expect, test } from "@playwright/test";

test("the code builder writes the code for exactly what is chosen, and nothing scrolls sideways", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  await page.goto("/chikyu-earth/builder.html");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
  const code = page.locator('[data-testid="builder-code"]');
  await expect(code).toContainText('center="139.7,35.7"');
  await page.locator('[data-testid="place-london"]').click();
  await page.locator('[data-testid="look-line"]').click();
  await page.locator('[data-testid="graticule-off"]').click();
  await page.locator('[data-testid="size-420"]').click();
  await expect(code).toContainText('center="-0.13,51.51"');
  await expect(code).toContainText('look="line"');
  await expect(code).toContainText('size="420"');
  await expect(code).not.toContainText("graticule");
  await expect(page.locator('[data-testid="builder-preview"] chikyu-earth')).toHaveAttribute("center", "-0.13,51.51");
  await page.locator('[data-testid="kind-iframe"]').click();
  await expect(code).toContainText("embed.html?look=line&center=-0.13,51.51");
  await expect(page.locator('[data-testid="builder-open"]')).toHaveAttribute("href", /embed\.html\?.*look=line/);
  await page.locator('[data-testid="kind-react"]').click();
  await expect(code).toContainText("useEffect");
  await page.locator('[data-testid="look-realistic"]').click();
  await expect(code).toContainText("realistic/element");
  await expect(code).toContainText("texture-base");
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sideways).toBeLessThanOrEqual(0);
  expect(problems).toEqual([]);
});
