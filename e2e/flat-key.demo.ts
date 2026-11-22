// The flat map's marks name themselves and have a key: the Sun overhead (the yellow dot) and My place (the white diamond) say what they are on hover, focus and press, tell the page when pressed, and the key under the map names every mark
// the map draws now, in English and Japanese, in the drawn and the photo looks. The moment is held (AT) so the Sun is where the tests expect it.
import { expect, test, type Page } from "@playwright/test";

const AT = "2026-11-04T00:00Z";
const flat = (page: Page) => page.locator("chikyu-flat");
type Flat = HTMLElement & { stats: { mapDraws: number }; lookState: string; keyOpen: boolean };

async function open(page: Page, query = ""): Promise<void> {
  await page.goto(`/chikyu-earth/flat.html${query}`);
  await page.locator("body[data-ready=true]").waitFor({ timeout: 30_000 });
  await flat(page).evaluate((el, at) => {
    el.setAttribute("speed", "0");
    el.setAttribute("time", at);
    // the Sun is over the Pacific at this moment and the home is Tokyo: a middle that shows both, even on a phone
    el.setAttribute("center", "170");
  }, AT);
  await flat(page).evaluate((el) => el.scrollIntoView({ block: "start" }));
  await expect(flat(page).locator('button.mark[data-mark="sun"]')).toHaveAttribute("aria-label", /Sun is overhead/);
}

const centre = async (page: Page, mark: "sun" | "home"): Promise<{ x: number; y: number }> => {
  const box = await flat(page).locator(`button.mark[data-mark="${mark}"]`).boundingBox();
  if (!box) throw new Error(`the ${mark} mark is not on the map`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

const listen = (page: Page): Promise<void> =>
  flat(page).evaluate((el) => {
    (window as unknown as { marks: unknown[] }).marks = [];
    el.addEventListener("chikyu-flat-mark", (event) => (window as unknown as { marks: unknown[] }).marks.push((event as CustomEvent).detail));
  });
const marks = (page: Page): Promise<{ mark: string; text: string; lon: number; lat: number; via: string; place: string | null }[]> => page.evaluate(() => (window as unknown as { marks: never[] }).marks);

test("the key under the map names every mark that is drawn, and never covers the map", async ({ page }, info) => {
  await open(page);
  const legend = flat(page).locator(".legend");
  const phone = info.project.name.endsWith("phone");
  const items = legend.locator("li");
  if (phone) {
    // on a narrow map the key is shut until it is asked for
    await expect(legend.getByRole("button", { name: "Show the key to the map" })).toHaveAttribute("aria-expanded", "false");
    await expect(items.first()).toBeHidden();
    await legend.getByRole("button", { name: "Show the key to the map" }).click();
  }
  await expect(legend.getByRole("button", { name: "Hide the key to the map" })).toHaveAttribute("aria-expanded", "true");
  await expect(items.filter({ hasText: "The Sun is overhead" })).toHaveCount(1);
  await expect(items.filter({ hasText: "My place" })).toHaveCount(1);
  await expect(items.filter({ hasText: "A satellite: its colour is its orbital plane" })).toHaveCount(1);
  await expect(items.filter({ hasText: "The night side" })).toHaveCount(1);
  // what is not drawn is not in the key: no ring, footprint or track until a satellite is chosen and they are on
  await expect(items.filter({ hasText: "The satellite you chose" })).toHaveCount(0);
  await expect(items.filter({ hasText: "Footprint" })).toHaveCount(0);
  await flat(page).evaluate((el) => {
    el.setAttribute("footprint", "");
    el.setAttribute("track", "");
  });
  // a satellite the map shows (a phone shows two thirds of the world)
  const id = await page.evaluate(async () => {
    const rows = (await (await fetch("elements/gps.json")).json()).rows as number[][];
    const el = document.querySelector("chikyu-flat") as unknown as { placeOf(id: number): unknown };
    return rows.map((row) => row[0]!).find((norad) => el.placeOf(norad) !== null)!;
  });
  await flat(page).evaluate((el, norad) => el.setAttribute("selected", String(norad)), id);
  await expect(items.filter({ hasText: "The satellite you chose" })).toHaveCount(1);
  await expect(items.filter({ hasText: "Footprint: the area that can see the satellite" })).toHaveCount(1);
  await expect(items.filter({ hasText: "In sunlight" })).toHaveCount(1);
  await expect(items.filter({ hasText: "In the Earth's shadow" })).toHaveCount(1);
  // the track's colours are named once: the key over the map steps aside while this one is open
  await expect(flat(page).locator(".key")).toBeHidden();
  // under the map, never over it
  const stage = (await flat(page).locator(".stage").boundingBox())!;
  const keyBox = (await legend.boundingBox())!;
  expect(keyBox.y).toBeGreaterThanOrEqual(stage.y + stage.height - 1);
  // shut, the key goes and the track's own key over the map comes back
  await legend.getByRole("button", { name: "Hide the key to the map" }).click();
  await expect(items.first()).toBeHidden();
  await expect(flat(page).locator(".key")).toBeVisible();
  // no sun, no night side: both go from the key
  await legend.getByRole("button", { name: "Show the key to the map" }).click();
  await flat(page).evaluate((el) => el.setAttribute("shade", "off"));
  await expect(items.filter({ hasText: "The Sun is overhead" })).toHaveCount(0);
  await expect(items.filter({ hasText: "The night side" })).toHaveCount(0);
});

test("the key is in Japanese when the page is, and in the photo look it says what the night side looks like", async ({ page }, info) => {
  await open(page);
  const legend = flat(page).locator(".legend");
  if (info.project.name.endsWith("phone")) await legend.getByRole("button", { name: "Show the key to the map" }).click();
  await flat(page).evaluate((el) => el.setAttribute("lang", "ja"));
  await expect(legend.locator("li").filter({ hasText: "太陽が真上にある場所" })).toHaveCount(1);
  await expect(legend.locator("li").filter({ hasText: "自分の場所" })).toHaveCount(1);
  await expect(legend.locator("li").filter({ hasText: "夜の側" })).toHaveCount(1);
  await expect(flat(page).locator('button.mark[data-mark="sun"]')).toHaveAttribute("aria-label", /ここは太陽が真上にある場所です：.*、(南|北)緯\d+° (東|西)経\d+°/);
  await flat(page).evaluate((el) => {
    el.setAttribute("lang", "en");
    el.setAttribute("texture-base", "textures/");
    el.setAttribute("look", "photo");
  });
  await expect.poll(() => flat(page).evaluate((el) => (el as Flat).lookState)).toBe("photo");
  await expect(legend.locator("li").filter({ hasText: "The night side: darker, with city lights" })).toHaveCount(1);
  // the Sun's mark is still found and named over the photo
  await expect(flat(page).locator('button.mark[data-mark="sun"]')).toHaveAttribute("aria-label", /The Sun is overhead here/);
});

test("the Sun's dot and the home diamond say what they are, over the drawn map and over the photo", async ({ page }, info) => {
  const phone = info.project.name.endsWith("phone");
  await open(page);
  await listen(page);
  for (const look of ["map", "photo"]) {
    await flat(page).evaluate((el, which) => {
      el.setAttribute("texture-base", "textures/");
      el.setAttribute("look", which);
    }, look);
    if (look === "photo") await expect.poll(() => flat(page).evaluate((el) => (el as Flat).lookState)).toBe("photo");
    await page.waitForTimeout(300);
    const sun = await centre(page, "sun");
    const tip = flat(page).locator(".tip");
    if (phone) await page.touchscreen.tap(sun.x, sun.y);
    else {
      // a pointer going over it names it, with where
      await page.mouse.move(sun.x + 80, sun.y + 60);
      await page.mouse.move(sun.x, sun.y);
    }
    await expect(tip).toBeVisible();
    await expect(tip).toHaveText(/^The Sun is overhead here: (over [A-Za-z ]+, )?\d+°[NS] \d+°[EW]?$/);
    if (!phone) await page.mouse.click(sun.x, sun.y);
    const sent = await marks(page);
    const last = sent[sent.length - 1]!;
    expect(last.mark).toBe("sun");
    expect(last.via).toBe("tap");
    expect(last.text).toMatch(/^The Sun is overhead here/);
    // at 00:00 UTC on 4 November the Sun is over the Pacific near the date line, a little south of the equator
    expect(Math.abs(Math.abs(last.lon) - 175)).toBeLessThan(12);
    expect(last.lat).toBeLessThan(-10);
    expect(last.lat).toBeGreaterThan(-20);
    // a tap on nothing puts the name away
    await page.mouse.move(0, 0);
    const home = await centre(page, "home");
    if (phone) await page.touchscreen.tap(home.x, home.y);
    else await page.mouse.click(home.x, home.y);
    await expect(tip).toHaveText(/^My place: Japan, 36°N 140°E$/);
    expect((await marks(page)).pop()!.mark).toBe("home");
  }
});

test("the keyboard reaches the marks: Tab names one, Enter presses it", async ({ page, browserName }, info) => {
  test.skip(info.project.name.endsWith("phone"), "a keyboard");
  test.skip(browserName === "webkit", "Safari's Tab skips buttons unless the reader turned that on in the system settings, for every page");
  await open(page);
  await listen(page);
  await flat(page).locator(".dots").focus();
  await page.keyboard.press("Tab");
  const sun = flat(page).locator('button.mark[data-mark="sun"]');
  await expect(sun).toBeFocused();
  await expect(flat(page).locator(".tip")).toContainText("The Sun is overhead here");
  await page.keyboard.press("Enter");
  const sent = await marks(page);
  expect(sent[sent.length - 1]).toMatchObject({ mark: "sun", via: "key" });
  await page.keyboard.press("Tab");
  await expect(flat(page).locator('button.mark[data-mark="home"]')).toBeFocused();
  await expect(flat(page).locator(".tip")).toContainText("My place: Japan");
  await page.keyboard.press("Escape");
});
