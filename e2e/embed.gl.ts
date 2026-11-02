// The embed page on the realistic look: one WebGL context, a canvas inside its budget, nothing drawn once it rests.
import { expect, test } from "@playwright/test";
import { COUNT_SCRIPT, counts, EARTH, NOON, settle, statsOf } from "./gl.ts";

test("the realistic embed is one context, a capped canvas, and rests", async ({ page }) => {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/embed.html?look=realistic&time=${NOON}&center=10,20`);
  await page.locator(`${EARTH}[data-state=live]`).waitFor();
  await expect.poll(async () => (await statsOf(page)).draws).toBeGreaterThan(0);
  await settle(page);
  const stats = await statsOf(page);
  expect(stats.contexts).toBe(1);
  expect(stats.canvas.width).toBeLessThanOrEqual(4096);
  expect(stats.canvas.height).toBeLessThanOrEqual(4096);
  expect(stats.canvas.pixels).toBeLessThanOrEqual(6_000_000);
  expect(await page.locator("canvas").count()).toBeLessThanOrEqual(2);
  const drawn = stats.draws;
  await page.waitForTimeout(1500);
  expect((await statsOf(page)).draws).toBe(drawn);
  expect((await counts(page)).contexts).toBeLessThanOrEqual(1);
});

// The space look in the embed: the same budget as the Earth from space, under the address's own clock.
const SPACE = "chikyu-space";
const spaceStats = (page: import("@playwright/test").Page) => page.locator(SPACE).evaluate((el) => Reflect.get(el, "stats") as { state: string; draws: number; contexts: number; canvas: { width: number; height: number; pixels: number }; distance: number; time: number });
const NOV2 = "2026-11-02T14:00Z";

test("the space embed is one context, a capped canvas, no controls, fetches only its own files, and rests", async ({ page }) => {
  const asked: string[] = [];
  page.on("request", (request) => asked.push(new URL(request.url()).pathname));
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/embed.html?look=space&time=${NOV2}&center=-100,40`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor();
  await expect.poll(async () => (await spaceStats(page)).draws).toBeGreaterThan(0);
  await settle(page);
  const stats = await spaceStats(page);
  expect(stats.contexts).toBe(1);
  expect(stats.canvas.pixels).toBeLessThanOrEqual(6_000_000);
  expect(stats.canvas.width).toBeLessThanOrEqual(4096);
  expect(await page.locator("button, input, select").count(), "no controls in the page").toBe(0);
  expect(await page.locator(SPACE).evaluate((el) => el.shadowRoot!.querySelectorAll(".sp-label:not([hidden])").length), "no names unless asked for").toBe(0);
  expect(asked.every((path) => path.startsWith("/chikyu-earth/"))).toBe(true);
  const before = await counts(page);
  await page.waitForTimeout(3000);
  const after = await counts(page);
  expect(after.draws, "nothing drawn at rest").toBe(before.draws);
  expect(after.rafRequests).toBe(before.rafRequests);
});

test("the address chooses the clock, the scale, the body and the part of the sky", async ({ page }) => {
  await page.goto(`/chikyu-earth/embed.html?look=space&time=${NOV2}&speed=0&scale=true&labels=1&body=Mars`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor();
  await expect(page.locator(SPACE)).toHaveAttribute("scale", "true");
  await expect(page.locator(SPACE)).toHaveAttribute("speed", "0");
  await expect.poll(async () => (await spaceStats(page)).distance).toBeCloseTo(3.4 * (3389.5 / 6371), 1);
  await expect.poll(async () => page.locator(SPACE).evaluate((el) => [...el.shadowRoot!.querySelectorAll(".sp-label:not([hidden])")].map((n) => n.textContent))).toContain("Mars");
  await page.goto(`/chikyu-earth/embed.html?look=space&time=${NOV2}&zoom=solar-system&labels=1`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor();
  await expect.poll(async () => page.locator(SPACE).evaluate((el) => [...el.shadowRoot!.querySelectorAll(".sp-label:not([hidden])")].map((n) => n.textContent))).toEqual(expect.arrayContaining(["Sun", "Neptune"]));
});

test("a day a second in the embed draws at most 30 times a second, and nothing in a hidden tab", async ({ page }) => {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/embed.html?look=space&time=${NOV2}&speed=86400&center=-100,40`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor();
  await settle(page, 800);
  const s0 = await spaceStats(page);
  const t0 = Date.now();
  await page.waitForTimeout(4000);
  const s1 = await spaceStats(page);
  const perSecond = (s1.draws - s0.draws) / ((Date.now() - t0) / 1000);
  console.log(`space embed at a day a second: ${perSecond.toFixed(1)} draws a second`);
  expect(perSecond).toBeGreaterThan(5);
  expect(perSecond).toBeLessThanOrEqual(31);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(600);
  const hidden0 = await counts(page);
  await page.waitForTimeout(2500);
  const hidden1 = await counts(page);
  expect(hidden1.draws, "nothing drawn in a hidden tab").toBe(hidden0.draws);
});

test("the space embed can show the stations and the Starlink satellites, in one context and a capped canvas, and rests", async ({ page }) => {
  const asked: string[] = [];
  page.on("request", (request) => asked.push(new URL(request.url()).pathname));
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/embed.html?look=space&time=2026-11-02T18:00Z&satellites=stations,starlink&sat=25544`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor();
  await expect.poll(async () => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { satellites: { placed: number } }).satellites.placed), { timeout: 20_000 }).toBeGreaterThan(2000);
  await settle(page, 800);
  const stats = await spaceStats(page);
  expect(stats.contexts).toBe(1);
  expect(stats.canvas.pixels).toBeLessThanOrEqual(6_000_000);
  expect(await page.locator(SPACE).evaluate((el) => (el as unknown as { selectedSatellite: { group: string } | null }).selectedSatellite?.group)).toBe("stations");
  expect(asked.every((path) => path.startsWith("/chikyu-earth/"))).toBe(true);
  const before = await counts(page);
  await page.waitForTimeout(3000);
  const after = await counts(page);
  expect(after.draws, "nothing drawn at rest").toBe(before.draws);
  expect(after.rafRequests).toBe(before.rafRequests);
});

test("the space embed can ride along with the ISS: one context, the camera at the ISS's height, and at rest nothing is drawn; a Moon ride at a day a second is capped", async ({ page }) => {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/embed.html?look=space&time=2026-11-02T18:00Z&ride=iss&rlook=horizon`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor();
  await expect.poll(async () => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { ride: { riding: boolean } }).ride.riding), { timeout: 30_000 }).toBe(true);
  // the pictures the ISS's view needs arrive, and the ones it lets go are let go
  await settle(page, 9000);
  const stats = (await page.locator(SPACE).evaluate((el) => Reflect.get(el, "stats"))) as { contexts: number; canvas: { pixels: number }; camera: { position: number[] } };
  expect(stats.contexts).toBe(1);
  expect(stats.canvas.pixels).toBeLessThanOrEqual(6_000_000);
  const height = (Math.hypot(...(stats.camera.position as [number, number, number])) - 1) * 6371;
  expect(height).toBeGreaterThan(380);
  expect(height).toBeLessThan(470);
  expect(await page.locator("button, input, select").count()).toBe(0);
  const before = await counts(page);
  await page.waitForTimeout(3000);
  expect((await counts(page)).draws, "nothing drawn at rest").toBe(before.draws);

  await page.goto(`/chikyu-earth/embed.html?look=space&time=2026-11-02T18:00Z&ride=Moon&speed=86400`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor();
  await settle(page, 1000);
  const s0 = await spaceStats(page);
  const t0 = Date.now();
  await page.waitForTimeout(4000);
  const perSecond = ((await spaceStats(page)).draws - s0.draws) / ((Date.now() - t0) / 1000);
  console.log(`Moon ride in the embed at a day a second: ${perSecond.toFixed(1)} draws a second`);
  expect(perSecond).toBeLessThanOrEqual(31);
});
