// The panel "The ground under it" on the flat map page: choose a satellite, press the button, and NASA's picture of the place under it appears with the credit line. Every request to NASA is answered here by a
// picture made in this file (a green one, or a black one, which is what NASA sends for a day it has no pass for), so the test never reaches NASA. With PHOTOS_THROTTLE set, Chromium's CPU is slowed by that factor.
import { expect, test, type Page } from "@playwright/test";

const AT = "2026-11-04T00:00Z";
const GREEN = "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGPQWGCDFTEMLQkAYT9BAZjEcQwAAAAASUVORK5CYII=";
const BLACK = "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAADElEQVR4nGNgGB4AAADIAAGtQHYiAAAAAElFTkSuQmCC";
const THROTTLE = Number(process.env["PHOTOS_THROTTLE"] ?? 0);
const flat = (page: Page) => page.locator("chikyu-flat");
type Flat = HTMLElement & { placeOf(id: number): { x: number; y: number } | null; selected: number | null };
type Stats = { stats: { draws: number; dots: number } };

/** Answer every request to NASA's service: the first `black` of them with a black picture, then green ones. Returns the days asked for, in order. */
async function fakeNasa(page: Page, black: number): Promise<string[]> {
  const asked: string[] = [];
  await page.route("https://gibs.earthdata.nasa.gov/**", (route) => {
    const url = new URL(route.request().url());
    const day = url.searchParams.get("TIME")!;
    // the pieces of one day are asked for together: a new day is a new count
    if (asked.at(-1) !== day) asked.push(day);
    const dark = asked.length <= black;
    return route.fulfill({ status: 200, contentType: "image/png", headers: { "access-control-allow-origin": "*" }, body: Buffer.from(dark ? BLACK : GREEN, "base64") });
  });
  return asked;
}

async function open(page: Page): Promise<void> {
  if (THROTTLE > 1 && page.context().browser()?.browserType().name() === "chromium") await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  await page.goto("/chikyu-earth/flat.html");
  await page.locator("body[data-ready=true]").waitFor({ timeout: 30_000 });
  const before = await flat(page).evaluate((el, at) => {
    el.setAttribute("speed", "0");
    el.setAttribute("time", at);
    return (el as unknown as Stats).stats.draws;
  }, AT);
  await page.locator(".flat-photo").scrollIntoViewIfNeeded();
  await flat(page).evaluate((el) => el.scrollIntoView({ block: "start" }));
  // on a phone the map is below the first screen and draws the held moment only once in sight: wait for that draw, as the dots of the draw before it are where the satellites are now, not at AT
  await expect.poll(() => flat(page).evaluate((el) => (el as unknown as Stats).stats.draws)).toBeGreaterThan(before);
  await expect.poll(() => flat(page).evaluate((el) => (el as unknown as Stats).stats.dots)).toBeGreaterThan(20);
}

/** Tap the GPS satellite nearest the middle of the map. */
async function choose(page: Page): Promise<void> {
  const ids = await page.evaluate(async () => ((await (await fetch("elements/gps.json")).json()).rows as number[][]).map((row) => row[0]!));
  const placed = await flat(page).evaluate((el, list) => list.map((id) => ({ id, at: (el as Flat).placeOf(id) })).filter((one) => one.at !== null).map((one) => ({ id: one.id, off: Math.abs(one.at!.x - el.shadowRoot!.querySelector(".stage")!.clientWidth / 2) })), ids);
  const id = placed.sort((a, b) => a.off - b.off)[0]!.id;
  const box = (await flat(page).evaluate((el) => el.shadowRoot!.querySelector(".dots")!.getBoundingClientRect().toJSON())) as { x: number; y: number };
  const found = (await flat(page).evaluate((el, norad) => (el as Flat).placeOf(norad), id))!;
  await page.mouse.click(box.x + found.x, box.y + found.y);
  await expect.poll(() => flat(page).evaluate((el) => (el as Flat).selected)).toBe(id);
}

test("the button needs a satellite; then it shows NASA's picture with the credit line and the place", async ({ page }) => {
  const asked = await fakeNasa(page, 0);
  await open(page);
  const show = page.getByTestId("photo-show");
  await expect(show).toBeDisabled();
  await expect(show).toHaveText("Choose a satellite on the map first.");
  await expect(page.getByTestId("photo-figure")).toBeHidden();
  await choose(page);
  await expect(show).toBeEnabled();
  await expect(show).toContainText("Show the ground under");
  await show.click();
  await expect(page.getByTestId("photo-figure")).toBeVisible();
  await expect(page.locator("#photo-frame img")).toHaveCount(1);
  await expect(page.getByTestId("photo-caption")).toContainText(/was over \d+\.\d°[NS], \d+\.\d°[EW]/);
  await expect(page.getByTestId("photo-caption")).toContainText("a box 300 km wide");
  // the credit line is on the page beside the picture
  await expect(page.getByTestId("photo-credit")).toHaveText("Imagery: NASA GIBS / Worldview (NASA). Not endorsed by NASA.");
  expect(asked.length).toBe(1);
  // the picture really loaded, and the box width came from the choice
  await expect.poll(() => page.locator("#photo-frame img").evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.getByTestId("photo-size").getByRole("button", { name: "1000 km" }).click();
  await show.click();
  await expect(page.getByTestId("photo-caption")).toContainText("a box 1000 km wide");
});

test("a black picture (a day NASA has no pass for) is skipped and the day before is shown", async ({ page }) => {
  const asked = await fakeNasa(page, 1);
  await open(page);
  await choose(page);
  await page.getByTestId("photo-show").click();
  await expect(page.getByTestId("photo-figure")).toBeVisible();
  expect(asked.length).toBe(2);
  const [first, second] = asked as [string, string];
  expect(second < first).toBe(true);
  await expect(page.getByTestId("photo-caption")).toContainText(`Picture of ${second}`);
  await expect(page.getByTestId("photo-credit")).toContainText("NASA");
});

test("when every day is black it says so and shows no picture", async ({ page }) => {
  const asked = await fakeNasa(page, 99);
  await open(page);
  await choose(page);
  await page.getByTestId("photo-show").click();
  await expect(page.getByTestId("photo-status")).toHaveText("NASA has no picture of this place for the last few days.");
  await expect(page.getByTestId("photo-figure")).toBeHidden();
  expect(asked.length).toBe(3);
  await expect(page.getByTestId("photo-show")).toBeEnabled();
});
