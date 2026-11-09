// The demo in Japanese: every control of the space view says its words in Japanese (the English is in demo/words.js beside each), and the English page is unchanged.
import { expect, test, type Page } from "@playwright/test";

test.beforeEach(({ browserName }, info) => {
  test.skip(browserName !== "chromium" || info.project.name !== "chromium-desk", "the space view draws WebGL, in software, in the desk Chromium");
});

const NOV2 = "2026-11-02T14:00Z";

async function open(page: Page, lang: "ja" | "en"): Promise<void> {
  await page.goto(`/chikyu-earth/?lang=${lang}&look=space&time=${NOV2}&speed=0`);
  await page.locator("chikyu-space[data-state=live]").waitFor({ timeout: 60_000 });
}

/** The words of every control and caption that is shown in the panel, and of the names drawn beside the bodies. */
async function shownWords(page: Page): Promise<string[]> {
  const panel = await page.locator(".controls").evaluate((root) => {
    const visible = (el: Element): boolean => !el.closest("[hidden]") && getComputedStyle(el).display !== "none";
    return [...root.querySelectorAll("button, .fam-label, .fam-fine, label span")].filter(visible).map((el) => (el.textContent ?? "").trim());
  });
  const names = await page.locator("chikyu-space").evaluate((el) => [...el.shadowRoot!.querySelectorAll(".sp-label:not([hidden])")].map((n) => `${n.textContent}|${n.getAttribute("aria-label")}`));
  return [...panel, ...names].filter(Boolean);
}

test("in Japanese no control or name of the space view is left in English", async ({ page }) => {
  await open(page, "ja");
  const words = await shownWords(page);
  expect(words.length).toBeGreaterThan(28);
  // Names and units that are the same in both languages: the ISS, Starlink, GPS, GLONASS, OneWeb, CelesTrak, SGP4, the Shuttle flights' STS names and kilometres.
  const english = words.filter((word) => /[A-Za-z]{2,}/.test(word.replace(/\b(ISS|STS|Starlink|GPS|GLONASS|OneWeb|CelesTrak|SGP4|km)\b/g, "")));
  expect(english, "words still in English").toEqual([]);
  await expect(page.getByRole("group", { name: "見る天体" })).toBeVisible();
  await page.getByRole("group", { name: "見る天体" }).getByRole("button", { name: "木星", exact: true }).click();
  await expect(page.locator("#body-info")).toContainText("木星: 半径 69,911 km");
  await expect(page.locator("#body-info")).not.toContainText("radius");
  await page.getByRole("group", { name: "探す" }).getByRole("button", { name: "ISS", exact: true }).click();
  await expect(page.locator("#sat-info")).toContainText("高さ");
  await expect(page.locator("#sat-info")).not.toContainText("up,");
  await page.getByRole("group", { name: "いっしょに動く" }).getByRole("button", { name: "月", exact: true }).click();
  await expect(page.locator("#ride-info")).toContainText("といっしょに移動中");
  await expect(page.locator("#ride-info")).not.toContainText("Riding");
  await page.getByRole("button", { name: "本当の縮尺" }).click();
  await expect(page.locator("#scale-note")).toBeHidden();
});

test("in English the same controls say what they did before, and switching language changes the names beside the bodies", async ({ page }) => {
  await open(page, "en");
  const words = await shownWords(page);
  expect(words).toEqual(expect.arrayContaining(["Space", "Date and time", "Compressed", "True scale", "Inner planets", "Solar system", "Jupiter", "Orbits", "Names"]));
  await page.locator("kazoku-language-picker").evaluate((el) => el.dispatchEvent(new CustomEvent("kazoku-languagechange", { detail: { lang: "ja" }, bubbles: true })));
  await expect(page.getByRole("group", { name: "移動先" })).toBeVisible();
  const names = await page.locator("chikyu-space").evaluate((el) => [...el.shadowRoot!.querySelectorAll(".sp-label:not([hidden])")].map((n) => n.textContent));
  expect(names).toContain("地球");
  expect(names).not.toContain("Earth");
});
