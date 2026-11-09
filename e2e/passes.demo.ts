// The passes page: a place by the buttons, the map, the search, the two numbers or "My location" (on a press only), the satellite, the days and what to show, the list of passes, the sky dome and the ground track of
// the one pressed, the code for every way a page is made, and the embed frame. The moment is fixed by `at` so the passes do not depend on the day the test runs; the orbit data are the demo's own files.
import { expect, test, type Page } from "@playwright/test";

const AT = "2026-11-10T00:00Z";
const PAGE = `/chikyu-earth/passes.html?at=${AT}`;
const rows = (page: Page) => page.locator("chikyu-passes .row");

test("it lists the passes over Tokyo, draws the sky dome and the ground track of the first, and keeps the choices in the address", async ({ page }) => {
  await page.goto(PAGE);
  await expect(rows(page).first()).toBeVisible();
  expect(await rows(page).count()).toBeGreaterThan(2);
  await expect(page.locator("chikyu-passes .dome svg [data-mark='highest']")).toBeVisible();
  await expect(page.locator("chikyu-passes .facts")).toContainText("Highest");
  await expect(page.locator("chikyu-passes .facts")).toContainText("(UTC ");
  await expect(page.locator("#ground-earth svg.ground-track [data-ground='track']")).toBeAttached();
  await expect(page.locator("#ground-earth svg.ground-track [data-ground='you']")).toBeAttached();
  await expect(page.locator("#place-note")).toContainText("Passes over Tokyo");
  // pressing another pass changes the dome and the ground track, and the address says which
  const dome = await page.locator("chikyu-passes .dome svg").innerHTML();
  const track = await page.locator("#ground-earth svg.ground-track [data-ground='track']").innerHTML();
  await rows(page).nth(2).click();
  await expect(rows(page).nth(2)).toHaveAttribute("aria-pressed", "true");
  expect(await page.locator("chikyu-passes .dome svg").innerHTML()).not.toBe(dome);
  expect(await page.locator("#ground-earth svg.ground-track [data-ground='track']").innerHTML()).not.toBe(track);
  await expect.poll(() => new URL(page.url()).searchParams.get("p")).toMatch(/^2026-11-1\dT/);
});

test("every row says when, which way and how bright, and a visible one says so", async ({ page }) => {
  await page.goto(PAGE);
  const first = rows(page).first();
  await expect(first).toContainText(/\d\d:\d\d [A-Z]+ → \d\d:\d\d [A-Z]+ \d+° → \d\d:\d\d [A-Z]+/);
  await expect(first.locator(".badge")).toHaveText("Visible");
  await expect(page.locator("chikyu-passes .note")).toContainText("Asia/Tokyo");
  await expect(page.locator("chikyu-passes .facts")).toContainText(/Brightness\s*-?\d/);
  await expect(page.locator("chikyu-passes .facts")).toContainText(/Sky\s*(civil|nautical|astronomical)/);
});

test("the places: a button, a pressed map, the search and the two numbers each move the passes", async ({ page }) => {
  await page.goto(PAGE);
  await expect(rows(page).first()).toBeVisible();
  await page.getByTestId("tries").getByRole("button", { name: "Sydney" }).click();
  await expect(page.locator("chikyu-passes")).toHaveAttribute("latitude", "-33.87");
  await expect(page.locator("chikyu-passes")).toHaveAttribute("time-zone", "Australia/Sydney");
  await expect(page.locator("#place-note")).toContainText("Passes over Sydney");
  await expect.poll(() => new URL(page.url()).searchParams.get("name")).toBe("sydney");
  // the map: its middle is longitude 0, latitude 0
  await page.locator("#map svg").scrollIntoViewIfNeeded();
  const box = (await page.locator("#map svg").boundingBox())!;
  await page.locator("#map svg").click({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect.poll(async () => Math.abs(Number(await page.getByTestId("lat").inputValue()))).toBeLessThan(2);
  await expect.poll(async () => Math.abs(Number(await page.getByTestId("lon").inputValue()))).toBeLessThan(2);
  await expect(page.locator("chikyu-passes")).toHaveAttribute("utc-offset", /^-?0$/);
  // the search finds a country's capital
  await page.getByTestId("search").fill("Brazil");
  await page.getByTestId("results").getByRole("button", { name: /Brasília|Brasilia/ }).click();
  await expect(page.getByTestId("lat")).toHaveValue(/^-15\./);
  await expect.poll(() => new URL(page.url()).searchParams.get("lat")).toMatch(/^-15\./);
  // the numbers
  await page.getByTestId("lat").fill("64.15");
  await page.getByTestId("lon").fill("-21.94");
  await page.getByTestId("lon").press("Enter");
  await page.getByTestId("lon").blur();
  await expect(page.locator("chikyu-passes")).toHaveAttribute("latitude", "64.15");
  await expect(page.locator("chikyu-passes")).toHaveAttribute("longitude", "-21.94");
});

test("the satellite, the days, all passes and the darker sky change the list", async ({ page }) => {
  await page.goto(PAGE);
  await expect(rows(page).first()).toBeVisible();
  const visible = await rows(page).count();
  await page.getByTestId("shows").getByRole("button", { name: "All passes" }).click();
  await expect.poll(() => rows(page).count()).toBeGreaterThan(visible);
  await expect(page.locator("chikyu-passes .badge:not([data-reason='visible'])").first()).toBeVisible();
  await page.getByTestId("shows").getByRole("button", { name: "Visible passes" }).click();
  await page.getByTestId("days").getByRole("button", { name: "10", exact: true }).click();
  await expect(page.locator("chikyu-passes")).toHaveAttribute("days", "10");
  await expect.poll(() => rows(page).count()).toBeGreaterThan(visible);
  await page.getByTestId("sats").getByRole("button", { name: "All three" }).click();
  await expect(rows(page).first().locator(".when")).toContainText("·");
  await page.getByTestId("sats").getByRole("button", { name: "Hubble" }).click();
  await page.getByTestId("shows").getByRole("button", { name: "All passes" }).click();
  await expect(rows(page).first().locator(".when")).not.toContainText("·");
  await page.getByTestId("shows").getByRole("button", { name: "Visible passes" }).click();
  const sky = await rows(page).count();
  await page.getByTestId("skies").getByRole("button", { name: "Darker only" }).click();
  expect(await rows(page).count()).toBeLessThanOrEqual(sky);
  await expect.poll(() => { const q = new URL(page.url()).searchParams; return [q.get("days"), q.get("sat"), q.get("sky")]; }).toEqual(["10", "hst", "nautical"]);
  // the address brings the same page back
  await page.goto(page.url());
  await expect(page.getByTestId("days").getByRole("button", { name: "10", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("sats").getByRole("button", { name: "Hubble" })).toHaveAttribute("aria-pressed", "true");
});

test("the browser is asked for the place only when My location is pressed, and the passes are then for it", async ({ page }) => {
  await page.addInitScript(() => {
    (globalThis as { __asked?: number }).__asked = 0;
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition: (ok: (p: unknown) => void) => {
          (globalThis as { __asked?: number }).__asked! += 1;
          ok({ coords: { latitude: 43.65, longitude: -79.38 } });
        },
      },
      configurable: true,
    });
  });
  await page.goto(PAGE);
  await expect(rows(page).first()).toBeVisible();
  expect(await page.evaluate(() => (globalThis as { __asked?: number }).__asked)).toBe(0);
  await page.getByTestId("locate").click();
  await expect(page.locator("chikyu-passes")).toHaveAttribute("latitude", "43.65");
  expect(await page.evaluate(() => (globalThis as { __asked?: number }).__asked)).toBe(1);
  await expect(page.locator("#place-note")).toContainText("your location");
  await expect.poll(() => new URL(page.url()).searchParams.get("name")).toBe("here");
});

test("a refused location says so and keeps the place", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition: (_ok: unknown, no: () => void) => no() }, configurable: true });
  });
  await page.goto(PAGE);
  await page.getByTestId("locate").click();
  await expect(page.locator("#place-note")).toContainText("did not give a place");
  await expect(page.locator("chikyu-passes")).toHaveAttribute("latitude", "35.69");
});

test("it reads this site's own orbit data once and nothing else: no CelesTrak, no polling", async ({ page }) => {
  const asked: string[] = [];
  page.on("request", (request) => asked.push(new URL(request.url()).href));
  await page.goto(PAGE);
  await expect(rows(page).first()).toBeVisible();
  await page.waitForTimeout(2500);
  expect(asked.every((url) => url.startsWith("http://127.0.0.1:") || url.startsWith("data:"))).toBe(true);
  // the page reads two of its own files, and the code panel's picture (a frame of the embed page) one more; each once
  expect(asked.filter((url) => /elements\//.test(url)).map((url) => url.split("/").pop()).sort()).toEqual(["bright.json", "famous.json", "stations.json"]);
  const count = asked.length;
  await page.waitForTimeout(2500);
  expect(asked.length).toBe(count);
  await expect(page.getByTestId("data-note")).toContainText("Orbit data");
});

test("the page has no horizontal scroll, and the list, the dome and the globe fit the screen", async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.locator("chikyu-passes .dome svg")).toBeVisible();
  await expect(page.locator("#ground-earth svg:not(.ground-track)")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  for (const selector of ["chikyu-passes .dome svg", "#ground-earth svg:not(.ground-track)", "#map svg"]) {
    const box = (await page.locator(selector).boundingBox())!;
    expect(box.width).toBeGreaterThan(150);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  }
  // the longest words: Japanese, all three satellites, every pass
  await page.goto(`${PAGE}&lang=ja&sat=all&show=all`);
  await expect(rows(page).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("in Japanese the controls, the list and the facts are in Japanese", async ({ page }) => {
  await page.goto(`${PAGE}&lang=ja`);
  await expect(rows(page).first()).toBeVisible();
  await expect(page.locator("#passes-heading")).toHaveText("わたしの空を通る衛星");
  await expect(page.getByTestId("sats")).toContainText("天宮");
  await expect(page.getByTestId("shows")).toContainText("見える通過");
  await expect(rows(page).first().locator(".badge")).toHaveText("見える");
  await expect(page.locator("chikyu-passes .facts")).toContainText("いちばん高い");
  await expect(page.locator("chikyu-passes .facts")).toContainText("太陽");
  await expect(page.locator("chikyu-passes .dome svg [data-mark='start']")).toContainText("出");
  await expect(page.locator("#place-note")).toContainText("東京");
  const english = await page.locator(".passes").evaluate((root) => {
    const seen = [...root.querySelectorAll("button, .fam-label, .fam-fine, label span")].map((el) => (el.textContent ?? "").trim());
    const inside = [...(root.querySelector("chikyu-passes")?.shadowRoot?.querySelectorAll(".row, .facts dt, .note, .badge") ?? [])].map((el) => (el.textContent ?? "").trim());
    return [...seen, ...inside].filter((text) => /[A-Za-z]{3,}/.test(text.replace(/\b(ISS|UTC|Asia\/Tokyo|CelesTrak|Space-Track\.org|Nov)\b/g, "").replace(/[A-Z]{2,4}\b/g, "")));
  });
  expect(english).toEqual([]);
});

test("the code for every way a page is made names <chikyu-passes> with the choices, and the iframe is the embed page", async ({ page }) => {
  await page.goto(PAGE);
  await page.getByTestId("tries").getByRole("button", { name: "London" }).click();
  await page.getByTestId("sats").getByRole("button", { name: "Tiangong" }).click();
  const panel = page.getByTestId("embed-panel");
  await expect(panel).toContainText('<chikyu-passes latitude="51.51" longitude="-0.13"');
  await expect(panel).toContainText('satellite="48274"');
  await expect(panel).toContainText('time-zone="Europe/London"');
  for (const name of ["ES module", "React", "Vue", "Angular", "Svelte"]) {
    await panel.getByRole("tab", { name }).or(panel.getByRole("button", { name })).first().click();
    await expect(panel).toContainText("chikyu-passes");
  }
  await panel.getByRole("tab", { name: "iframe" }).or(panel.getByRole("button", { name: "iframe" })).first().click();
  await expect(panel).toContainText("passes-embed.html?lat=51.51&amp;lon=-0.13&amp;sat=css&amp;days=5&amp;tz=Europe/London");
});

test("the embed frame draws the passes the address asks for, fetches only its own files and shows no page chrome", async ({ page }) => {
  const asked: string[] = [];
  page.on("request", (request) => asked.push(new URL(request.url()).pathname));
  await page.goto(`/chikyu-earth/passes-embed.html?lat=35.69&lon=139.69&sat=iss&days=5&tz=Asia/Tokyo&from=${AT}`);
  await expect(rows(page).first()).toBeVisible();
  await expect(page.locator("chikyu-passes")).toHaveAttribute("satellite", "25544");
  await expect(page.locator("chikyu-passes .dome svg")).toBeVisible();
  await expect(page.locator("chikyu-passes .credit")).toContainText("CelesTrak");
  await page.waitForTimeout(1500);
  expect(asked.every((path) => path.startsWith("/chikyu-earth/"))).toBe(true);
  expect(asked.filter((path) => path.endsWith("bright.json"))).toHaveLength(1);
  expect(await page.locator("input, select").count()).toBe(0);
  await page.goto(`/chikyu-earth/passes-embed.html?lat=35.69&lon=139.69&lang=ja&from=${AT}&tz=Asia/Tokyo`);
  await expect(rows(page).first().locator(".badge")).toHaveText("見える");
});

test("the ground-track globe has kazoku-ui's view controls with their zoom readout, and the Wide toggle makes the pictures bigger", async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.locator("#ground-earth svg.ground-track [data-ground='track']")).toBeAttached();
  const controls = page.locator("#ground-controls");
  await expect(controls).toBeVisible();
  const readout = controls.locator("[aria-live], .zoom-readout, output").first();
  const before = await page.locator("#ground-earth svg.ground-track").innerHTML();
  await controls.getByRole("button", { name: /zoom in/i }).click();
  await expect.poll(() => page.locator("#ground-earth svg.ground-track").innerHTML()).not.toBe(before);
  await expect(readout).toContainText(/\d/);
  if ((page.viewportSize()?.width ?? 0) > 640) {
    const narrow = (await page.locator("chikyu-passes .dome svg").boundingBox())!.width;
    await page.getByTestId("wide").locator("button").first().click();
    await expect(page.locator("html")).toHaveAttribute("data-wide", "on");
    await expect.poll(async () => (await page.locator("chikyu-passes .dome svg").boundingBox())!.width).toBeGreaterThan(narrow);
  }
});
