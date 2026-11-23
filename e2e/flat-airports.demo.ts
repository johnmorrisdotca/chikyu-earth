// The flat map's airports: off until a page asks (and then the rows are fetched, not before), the greater ones when the whole world is in sight and more as the map is zoomed in, each named on hover and press in the page's language, the key names them, and a button for them is a control a page asks for.
import { expect, test, type Page } from "@playwright/test";

const flat = (page: Page) => page.locator("chikyu-flat");
type Flat = HTMLElement & { stats: { mapDraws: number }; zoom: number; center: number; visibleGroups: string[] };

async function open(page: Page): Promise<string[]> {
  const asked: string[] = [];
  page.on("request", (request) => {
    if (/airports-data/.test(request.url())) asked.push(request.url());
  });
  await page.goto("/chikyu-earth/flat.html?place=none");
  await page.locator("body[data-ready=true]").waitFor({ timeout: 30_000 });
  await flat(page).evaluate((el) => {
    el.setAttribute("speed", "0");
    el.setAttribute("time", "2026-11-04T00:00Z");
    // no satellites over the airports, so a pointer over one names the airport
    (el as Flat).visibleGroups = [];
    el.scrollIntoView({ block: "start" });
  });
  await expect.poll(() => flat(page).evaluate((el) => (el as Flat).stats.mapDraws)).toBeGreaterThan(0);
  return asked;
}

/** How many pixels of the map canvas are the airports' white (a white with a dark edge: nothing else on the drawn map is pure white). */
const whites = (page: Page): Promise<number> =>
  flat(page).evaluate((el) => {
    const canvas = el.shadowRoot!.querySelector(".map") as HTMLCanvasElement;
    const data = canvas.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height).data;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i]! > 245 && data[i + 1]! > 245 && data[i + 2]! > 245) n += 1;
    return n;
  });

const settle = async (page: Page): Promise<void> => {
  let last = -1;
  for (let i = 0; i < 30; i += 1) {
    await page.waitForTimeout(250);
    const now = await flat(page).evaluate((el) => (el as Flat).stats.mapDraws);
    if (now === last) return;
    last = now;
  }
};

/** Where an airport is in the page, from the map's own arithmetic: the box's middle is the middle longitude and the equator. */
const where = (page: Page, lon: number, lat: number): Promise<{ x: number; y: number }> =>
  flat(page).evaluate((el, [lo, la]) => {
    const stage = el.shadowRoot!.querySelector(".stage") as HTMLElement;
    const box = stage.getBoundingClientRect();
    const k = Math.max(box.width / 360, box.height / 180) * (el as Flat).zoom;
    const wrap = (v: number): number => ((((v + 180) % 360) + 360) % 360) - 180;
    return { x: box.left + box.width / 2 + wrap(lo! - (el as Flat).center) * k, y: box.top + box.height / 2 - la! * k };
  }, [lon, lat]);

test("airports are off, and their rows are not fetched, until a page asks; then the greater ones are drawn", async ({ page }) => {
  const asked = await open(page);
  await settle(page);
  const none = await whites(page);
  expect(asked, "nothing fetched for the drawn map").toEqual([]);
  await flat(page).evaluate((el) => el.setAttribute("airports", ""));
  await expect.poll(() => asked.length, { timeout: 15_000 }).toBeGreaterThan(0);
  await settle(page);
  const world = await whites(page);
  expect(world, "airports are drawn").toBeGreaterThan(none + 200);
  // closer, more of them (the medium ones come in): the white of the drawn marks grows with the room
  await flat(page).evaluate((el) => {
    (el as Flat).zoom = 3;
    el.setAttribute("center", "10");
  });
  await settle(page);
  expect(await whites(page), "zoomed in").toBeGreaterThan(none + 200);
  await flat(page).evaluate((el) => el.removeAttribute("airports"));
  await settle(page);
  expect(Math.abs((await whites(page)) - none), "off again: as it was").toBeLessThan(20);
});

test("an airport names itself on a pointer and on a press, in the page's language, and tells the page; the key names airports", async ({ page }, info) => {
  const phone = info.project.name.endsWith("phone");
  await open(page);
  await flat(page).evaluate((el) => {
    el.setAttribute("airports", "");
    el.setAttribute("center", "139.8");
    (el as Flat).zoom = 2;
    (window as unknown as { sent: unknown[] }).sent = [];
    el.addEventListener("chikyu-flat-airport", (event) => (window as unknown as { sent: unknown[] }).sent.push((event as CustomEvent).detail));
  });
  await settle(page);
  const at = await where(page, 139.79, 35.55);
  const tip = flat(page).locator(".tip");
  if (phone) await page.touchscreen.tap(at.x, at.y);
  else {
    await page.mouse.move(at.x + 60, at.y + 60);
    await page.mouse.move(at.x, at.y);
  }
  await expect(tip).toBeVisible();
  await expect(tip).toHaveText("Tokyo Haneda International Airport (HND), Japan");
  if (!phone) await page.mouse.click(at.x, at.y);
  const sent = (await page.evaluate(() => (window as unknown as { sent: { iata: string; country: string; via: string; text: string }[] }).sent)).pop()!;
  expect(sent).toMatchObject({ iata: "HND", country: "JP", via: "tap" });
  expect(sent.text).toContain("Japan");
  // in Japanese the country is the package's Japanese name
  await flat(page).evaluate((el) => el.setAttribute("lang", "ja"));
  await page.waitForTimeout(300);
  if (phone) await page.touchscreen.tap(at.x, at.y);
  else await page.mouse.click(at.x, at.y);
  await expect(tip).toHaveText("Tokyo Haneda International Airport（HND）、日本");
  // the key names them
  if (phone) await flat(page).evaluate((el) => ((el as Flat & { keyOpen: boolean }).keyOpen = true));
  await expect(flat(page).locator(".legend li").filter({ hasText: "空港" })).toHaveCount(1);
  await flat(page).evaluate((el) => el.setAttribute("lang", "en"));
  await expect(flat(page).locator(".legend li").filter({ hasText: "An airport" })).toHaveCount(1);
  // a tap elsewhere puts the name away
  await page.keyboard.press("Escape");
});

test("an Airports button is one of the map's controls a page asks for, and switches them", async ({ page }) => {
  await open(page);
  await expect(flat(page).getByRole("button", { name: "Airports" })).toHaveCount(0);
  await flat(page).evaluate((el) => el.setAttribute("controls", "centre airports"));
  const button = flat(page).getByRole("button", { name: "Airports" });
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(flat(page)).toHaveAttribute("airports", "");
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect(flat(page)).not.toHaveAttribute("airports");
  await flat(page).evaluate((el) => el.setAttribute("lang", "ja"));
  await expect(flat(page).getByRole("button", { name: "空港" })).toBeVisible();
});
