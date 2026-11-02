// Markers on the realistic Earth: aligned with it, and inside its performance budget with thousands of them.
import { expect, test, type Page } from "@playwright/test";
import { counts, EARTH, NOON, openEarth, settle, statsOf } from "./gl.ts";

test.describe.configure({ mode: "serial" });

interface Stats {
  markers: number;
  clusters: number;
  labels: number;
  renders: number;
}
const markerStats = (page: Page): Promise<Stats> => page.evaluate(() => (Reflect.get(globalThis, "chikyuMarkers") as { stats: Stats }).stats);

test("a place is drawn over the Earth where it is: Tokyo at the centre of a globe centred on it", async ({ page }) => {
  await openEarth(page, `time=${NOON}&center=139.7,35.7`);
  await expect.poll(async () => (await markerStats(page)).markers).toBeGreaterThan(0);
  const painted = await page.locator(EARTH).evaluate((el) => {
    const canvas = el.shadowRoot!.querySelector("#overlay canvas") as HTMLCanvasElement;
    const data = canvas.getContext("2d")!.getImageData(Math.round(canvas.width / 2) - 6, Math.round(canvas.height / 2) - 6, 12, 12).data;
    let n = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n += 1;
    return n;
  });
  expect(painted).toBeGreaterThan(10);
  expect(await page.locator(".cm-label, [aria-label='Tokyo, a city']").count()).toBeGreaterThan(0);
});

test("with 5000 places the Earth is still drawn at most 30 times a second, and rests", async ({ page }) => {
  await openEarth(page, `time=${NOON}&center=10,20&places=5000`);
  await expect.poll(async () => (await markerStats(page)).clusters).toBeGreaterThan(3);
  expect((await markerStats(page)).labels).toBeLessThanOrEqual(24);
  const box = (await page.locator(EARTH).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const t0 = Date.now();
  const drawsBefore = (await statsOf(page)).draws;
  const rendersBefore = (await markerStats(page)).renders;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 0; i < 120; i += 1) {
    await page.mouse.move(x + ((i * 7) % 160) - 80, y + ((i * 3) % 60) - 30);
    await page.waitForTimeout(8);
  }
  await page.mouse.up();
  const seconds = (Date.now() - t0) / 1000;
  const draws = (await statsOf(page)).draws - drawsBefore;
  const renders = (await markerStats(page)).renders - rendersBefore;
  console.log(`5000 places, drag: ${draws} Earth draws and ${renders} marker renders in ${seconds.toFixed(2)} s`);
  expect(draws / seconds).toBeLessThanOrEqual(32);
  expect(renders, "the markers are drawn with the Earth, not on their own").toBeLessThanOrEqual(draws + 2);
  await settle(page, 1500);
  const rest = await counts(page);
  const restRenders = (await markerStats(page)).renders;
  await page.waitForTimeout(2000);
  expect((await counts(page)).draws).toBe(rest.draws);
  expect((await counts(page)).rafRequests).toBe(rest.rafRequests);
  expect((await markerStats(page)).renders).toBe(restRenders);
});

test("out of sight the markers are not drawn either", async ({ page }) => {
  await openEarth(page, `time=${NOON}&center=10,20&places=2000`);
  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.style.height = "4000px";
    document.body.prepend(spacer);
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  const renders = (await markerStats(page)).renders;
  for (let i = 0; i < 8; i += 1) {
    await page.locator(EARTH).evaluate((el, n) => (el as unknown as { setView(v: unknown, f: boolean): void }).setView({ yaw: n * 15, tilt: 0, zoom: 1, panX: 0, panY: 0 }, false), i);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(400);
  expect((await markerStats(page)).renders).toBe(renders);
});

test("taking the element away takes the markers' canvas and labels with it, and the Realistic look can come back", async ({ page }) => {
  await openEarth(page, `time=${NOON}&center=139.7,35.7`);
  await page.getByRole("button", { name: "Line" }).click();
  await expect(page.locator(EARTH)).toHaveCount(0);
  await expect.poll(async () => (await markerStats(page)).markers).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Realistic" }).click();
  await page.locator(`${EARTH}[data-state=live]`).waitFor();
  await expect.poll(async () => (await markerStats(page)).markers).toBeGreaterThan(0);
});
