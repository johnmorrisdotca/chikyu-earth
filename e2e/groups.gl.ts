// The satellite groups, Find and Ride in the demo, on made-up element files (test/madeup-elements.ts) served in place of the demo's own, so no real data and no request out of the page.
import { expect, test, type Page } from "@playwright/test";
import { SATELLITE_GROUPS } from "../src/satellites/catalogue.ts";
import { buildAll } from "../scripts/elements.ts";
import { madeUp, madeUpTle } from "../test/madeup-elements.ts";

test.describe.configure({ mode: "serial" });

const SPACE = "chikyu-space";
const T = "2026-11-03T13:00Z";
// the GPS group has one satellite whose elements are 24 days old at the time the tests look at: placed, but drawn dimmer
const old = madeUp("gps", 1, "2026-10-10T00:00:00", 700_000).map((set) => ({ ...set, OBJECT_NAME: "MADE-UP GPS OLD" }));
const built = buildAll((group) => ({ raw: [...madeUp(group, group.id === "starlink" ? 50 : group.id === "gps" ? 5 : 4, "2026-11-03T12:00:00"), ...(group.id === "gps" ? old : [])], retrieved: "2026-11-03T12:30Z" }));
const files: Record<string, unknown> = { ...built.files, "manifest.json": built.manifest };

// A made-up source of the visitor's own: the one address the page may ask besides its own files, answering made-up elements as OMM JSON, TLE text, a refusal or something that is not elements.
const SOURCE = "elements.example.test";
const yoursRaw = madeUp("gps", 5, "2026-11-03T12:00:00").map((set, i) => ({ ...set, OBJECT_NAME: `MADE-UP YOURS ${i + 1}`, NORAD_CAT_ID: 30_000 + i }));
const yoursTle = yoursRaw.map((set) => madeUpTle(set as never)).join("\n");

async function open(page: Page, query = ""): Promise<{ outside: string[]; asked: string[] }> {
  const outside: string[] = [];
  const asked: string[] = [];
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === SOURCE) {
      asked.push(url.pathname);
      const headers = { "access-control-allow-origin": "*" };
      if (url.pathname === "/ok.json") return route.fulfill({ json: yoursRaw, headers });
      if (url.pathname === "/ok.tle") return route.fulfill({ body: yoursTle, contentType: "text/plain", headers });
      if (url.pathname === "/refused.json") return route.fulfill({ status: 403, body: "no", headers });
      return route.fulfill({ body: "<html>not elements</html>", contentType: "text/html", headers });
    }
    if (url.hostname !== "127.0.0.1") {
      outside.push(url.href);
      return route.abort();
    }
    const name = url.pathname.split("/elements/")[1];
    if (url.pathname.includes("/elements/") && name && name in files) return route.fulfill({ json: files[name] });
    if (url.pathname.includes("/elements/")) return route.fulfill({ status: 404, body: "not found" });
    return route.continue();
  });
  await page.goto(`/chikyu-earth/?look=space&time=${T}&speed=0${query}`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { pause(): void }).pause());
  return { outside, asked };
}
const groupButton = (page: Page, id: string) => page.locator(`#sat-groups [data-sat-group="${id}"]`);
const placed = (page: Page): Promise<number> => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { satellites: { placed: number } }).satellites.placed);

test("every group of the catalogue is a button, in the catalogue's order, none a browser-default control", async ({ page }) => {
  await open(page);
  const labels = await page.locator("#sat-groups button").allTextContents();
  expect(labels).toEqual(SATELLITE_GROUPS.map((group) => group.label));
  for (const box of await page.locator("#sat-groups button").all()) expect((await box.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(page.locator("#sat-groups select")).toHaveCount(0);
});

test("a group switches on and off, says what it is, and its satellites are drawn", async ({ page }) => {
  const { outside } = await open(page);
  await groupButton(page, "gps").dispatchEvent("click");
  await expect(groupButton(page, "gps")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#sat-about")).toContainText("GPS");
  await expect.poll(() => placed(page), { timeout: 20_000 }).toBe(6);
  await expect(page.locator("#sat-note")).toContainText("6 satellites shown");
  await groupButton(page, "geostationary").dispatchEvent("click");
  await expect.poll(() => placed(page), { timeout: 20_000 }).toBe(10);
  await expect(page.locator("#sat-about")).toContainText("sits still");
  await groupButton(page, "gps").dispatchEvent("click");
  await expect.poll(() => placed(page), { timeout: 20_000 }).toBe(4);
  expect(outside).toEqual([]);
});

test("Find finds a satellite by name or number, switches its group on and marks it; a number the groups lack finds nothing", async ({ page }) => {
  await open(page);
  await page.locator("#sat-search").fill("made-up gps 3");
  const first = page.locator("#sat-results button").first();
  await expect(first).toContainText("MADE-UP GPS 3");
  await first.dispatchEvent("click");
  await expect(groupButton(page, "gps")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#sat-info")).toContainText("MADE-UP GPS 3");
  await expect.poll(() => new URL(page.url()).searchParams.get("sat")).not.toBeNull();
  await page.locator("#sat-search").fill("zzzzzz");
  await expect(page.locator("#sat-results")).toContainText("No satellite");
});

test("Ride: the chosen satellite, and one from the last group; nothing chosen asks for a choice", async ({ page }) => {
  await open(page);
  await page.locator("#sat-groups").getByRole("button", { name: "Iridium" }).dispatchEvent("click");
  await expect.poll(() => placed(page), { timeout: 20_000 }).toBe(4);
  await page.getByRole("group", { name: "Ride along" }).getByRole("button", { name: "The chosen satellite" }).dispatchEvent("click");
  await expect(page.locator("#status")).toContainText(/choose a satellite/i);
  expect(await page.locator(SPACE).evaluate((el) => Reflect.get(el, "riding"))).toBeFalsy();
  await page.getByRole("group", { name: "Ride along" }).getByRole("button", { name: "One from the last group" }).dispatchEvent("click");
  await expect(page.locator("#ride-info")).toContainText("MADE-UP IRIDIUM");
  await page.getByRole("group", { name: "Ride along" }).getByRole("button", { name: "Stop" }).dispatchEvent("click");
  await page.locator("#sat-search").fill("made-up oneweb 2");
  await page.locator("#sat-results button").first().dispatchEvent("click");
  await expect(page.locator("#sat-info")).toContainText("MADE-UP ONEWEB 2");
  await page.getByRole("group", { name: "Ride along" }).getByRole("button", { name: "The chosen satellite" }).dispatchEvent("click");
  await expect(page.locator("#ride-info")).toContainText("MADE-UP ONEWEB 2");
  await expect.poll(() => new URL(page.url()).searchParams.get("ride")).toBe("chosen");
});

test("the address brings back the groups, the chosen satellite and the ride", async ({ page }) => {
  await open(page, `&sats=gps&sat=${900_000 + SATELLITE_GROUPS.findIndex((group) => group.id === "gps") * 1000 + 1}&ride=chosen`);
  await expect(groupButton(page, "gps")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#ride-info")).toContainText("MADE-UP");
});

test("a satellite whose elements are more than 14 days from the time shown is drawn dimmer, and the page says so, with its age and the reason", async ({ page }) => {
  await open(page);
  await groupButton(page, "gps").dispatchEvent("click");
  await expect.poll(() => placed(page), { timeout: 20_000 }).toBe(6);
  await expect(page.locator("#sat-note")).toContainText("1 of them are drawn dimmer");
  await expect(page.locator("#sat-note")).toContainText("ago");
  await page.locator("#sat-search").fill("made-up gps old");
  await page.locator("#sat-results button").first().dispatchEvent("click");
  await expect(page.locator("#sat-info")).toContainText("24 days old");
  await expect(page.locator("#sat-info")).toContainText("less exact and it is drawn dimmer");
  await page.locator("#sat-search").fill("made-up gps 2");
  await page.locator("#sat-results button").first().dispatchEvent("click");
  await expect(page.locator("#sat-info")).toContainText("MADE-UP GPS 2");
  await expect(page.locator("#sat-info")).not.toContainText("less exact");
  const dimmed = await page.evaluate(() => [...(Reflect.get(window, "chikyuSatellites") as { groups: Map<string, { dimmed: Float32Array }> }).groups.get("gps")!.dimmed]);
  expect(dimmed.filter((v) => v === 1)).toHaveLength(1);
});

const load = async (page: Page, url: string): Promise<void> => {
  await page.locator("#sat-source").fill(url);
  await page.locator("#sat-source-go").dispatchEvent("click");
};

test("your own source: an address of OMM JSON or TLE is read in the browser, becomes a group you can show and find in, and is not asked again within two hours", async ({ page }) => {
  const { asked, outside } = await open(page);
  await expect(page.locator("#sat-source")).toBeVisible();
  expect(asked, "nothing is asked until the visitor asks").toEqual([]);
  await load(page, `https://${SOURCE}/ok.json`);
  await expect(page.locator("#sat-source-note")).toContainText(`5 satellites from ${SOURCE}`);
  await expect(page.locator("#sat-source-note")).toContainText("it will not be asked again for two hours");
  await expect(page.locator('#sat-groups [data-sat-group="yours"]')).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => placed(page), { timeout: 20_000 }).toBe(5);
  await page.locator("#sat-search").fill("made-up yours 3");
  await expect(page.locator("#sat-results button").first()).toContainText("MADE-UP YOURS 3 (Yours)");
  await page.locator("#sat-results button").first().dispatchEvent("click");
  await expect(page.locator("#sat-info")).toContainText("MADE-UP YOURS 3");
  await load(page, `https://${SOURCE}/ok.json`);
  await expect(page.locator("#sat-source-note")).toContainText("Kept from");
  expect(asked, "the second Load asked nothing").toEqual(["/ok.json"]);
  await load(page, `https://${SOURCE}/ok.tle`);
  await expect(page.locator("#sat-source-note")).toContainText(`5 satellites from ${SOURCE}`);
  expect(asked).toEqual(["/ok.json", "/ok.tle"]);
  await expect.poll(() => new URL(page.url()).searchParams.get("src")).toBe(`https://${SOURCE}/ok.tle`);
  expect(outside).toEqual([]);
});

test("your own source: a refusal, something that is not elements and an address that is not https each say why, and a refused source is left alone", async ({ page }) => {
  const { asked } = await open(page);
  await load(page, `https://${SOURCE}/refused.json`);
  await expect(page.locator("#sat-source-note")).toContainText("answered 403");
  await load(page, `https://${SOURCE}/refused.json`);
  await expect(page.locator("#sat-source-note")).toContainText("left alone");
  await load(page, `https://${SOURCE}/junk.html`);
  await expect(page.locator("#sat-source-note")).toContainText("not OMM JSON, OMM CSV or TLE");
  await load(page, `http://${SOURCE}/ok.json`);
  await expect(page.locator("#sat-source-note")).toContainText("only https");
  expect(asked, "one ask for the refusal, one for the junk, none for http").toEqual(["/refused.json", "/junk.html"]);
  await expect(page.locator('#sat-groups [data-sat-group="yours"]')).toHaveCount(0);
});
