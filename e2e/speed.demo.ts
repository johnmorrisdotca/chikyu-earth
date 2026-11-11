import { expect, test, type Page } from "@playwright/test";

// The family's speed buttons in the demo: the Earth's Auto-turn (0.5×, 1×, 2× of the real rate) in the view controls, and the space view's replay bar (Play, Back to the date and the speeds, multiples of real time).
// The pages open with reduced motion (the config's default), so the buttons stepping here is the reduced-motion check too.
const CONTROLS = "kazoku-view-controls";
const speedButton = (page: Page, value: number) => page.locator(`${CONTROLS} kazoku-speed-buttons button[data-v="${value}"]`);

test("Auto-turn has the steps 0.5×, 1×, 2× and 1440× of the Earth's own rate, named by the time a turn takes, and opens on the 1440× one, kept in the attribute and the address", async ({ page }) => {
  await page.goto("/chikyu-earth/");
  await expect(page.locator(`${CONTROLS} .bar`)).toBeVisible();
  if ((await page.locator(`${CONTROLS} [data-b="more"]`).getAttribute("aria-expanded")) !== "true") await page.locator(`${CONTROLS} [data-b="more"]`).click();
  await expect(page.locator(`${CONTROLS} kazoku-speed-buttons button`)).toHaveText(["2900 min", "1400 min", "720 min", "60 s"]);
  await expect(speedButton(page, 1440)).toHaveAttribute("aria-pressed", "true");
  await speedButton(page, 1).click();
  await expect(speedButton(page, 1)).toHaveAttribute("aria-pressed", "true");
  expect(await page.locator(CONTROLS).evaluate((el) => Reflect.get(el, "controller").speed as number)).toBeCloseTo(0.004178, 6);
  await speedButton(page, 2).click();
  expect(await page.locator(CONTROLS).evaluate((el) => Reflect.get(el, "controller").speed as number)).toBeCloseTo(0.008356, 6);
  await expect(page.locator(CONTROLS)).toHaveAttribute("pace", "2");
  await expect(page).toHaveURL(/pace=2/);
  await speedButton(page, 1).click();
  await expect(page).not.toHaveURL(/pace=/);
});

test("Auto-turn's 1× (the Earth's own rate) is kept in the address, and a reload or a shared link opens on it, not on the 1440× the page opens on", async ({ page }) => {
  await page.goto("/chikyu-earth/");
  await expect(page.locator(`${CONTROLS} .bar`)).toBeVisible();
  if ((await page.locator(`${CONTROLS} [data-b="more"]`).getAttribute("aria-expanded")) !== "true") await page.locator(`${CONTROLS} [data-b="more"]`).click();
  await expect(speedButton(page, 1440)).toHaveAttribute("aria-pressed", "true");
  await speedButton(page, 1).click();
  await expect(speedButton(page, 1)).toHaveAttribute("aria-pressed", "true");
  // the choice is in the address (a moment after: the family's address state waits to write)
  await expect.poll(() => new URL(page.url()).searchParams.get("pace")).toBe("1");
  await page.reload();
  await expect(page.locator(`${CONTROLS} .bar`)).toBeVisible();
  if ((await page.locator(`${CONTROLS} [data-b="more"]`).getAttribute("aria-expanded")) !== "true") await page.locator(`${CONTROLS} [data-b="more"]`).click();
  await expect(speedButton(page, 1), "the 1× opens pressed").toHaveAttribute("aria-pressed", "true");
  expect(Math.abs(await page.locator(CONTROLS).evaluate((el) => Reflect.get(el, "controller").speed as number))).toBeCloseTo(0.004178, 6);
  // and the page's own 1440× is still what it opens on when the link says nothing, and choosing it again takes the pace out of the address
  await speedButton(page, 1440).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("pace")).toBeNull();
  await page.goto("/chikyu-earth/");
  await expect(page.locator(`${CONTROLS} .bar`)).toBeVisible();
  if ((await page.locator(`${CONTROLS} [data-b="more"]`).getAttribute("aria-expanded")) !== "true") await page.locator(`${CONTROLS} [data-b="more"]`).click();
  await expect(speedButton(page, 1440)).toHaveAttribute("aria-pressed", "true");
});

test("the time row is the family's replay bar: Play, Back to the date and the speeds in multiples of real time, and the page keeps no buttons of its own for it", async ({ page }) => {
  await page.goto("/chikyu-earth/?look=space&play=on&speed=86400&time=2026-11-02T14:00Z");
  const bar = page.locator("#replay");
  await expect(bar.locator("button[data-act]:visible")).toHaveText(["Play", "Back to the date"]);
  await expect(bar.locator("button[data-v]")).toHaveText(["1×", "3600×", "86400×", "−3600×"]);
  await expect(bar.locator('button[data-v="86400"]')).toHaveAttribute("aria-pressed", "true");
  expect(await page.locator("[data-speed]").count()).toBe(0);
  // the config's reduced motion is on: Play is left off, even from an address that asks for it
  await expect(bar.locator('[data-act="play"]')).toHaveAttribute("aria-pressed", "false");
  await page.locator("kazoku-language-picker").evaluate((el) => el.dispatchEvent(new CustomEvent("kazoku-languagechange", { detail: { lang: "ja" }, bubbles: true })));
  await expect(bar.locator('[data-act="start"]')).toHaveText("もとの日付へ");
  await expect(bar.locator('[data-act="play"]')).toHaveText("再生");
});
