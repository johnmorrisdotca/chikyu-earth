// Markers on the flat globe, in every browser: where they land, what a hover, a click and the keyboard do, groups, the far side, and what a screen reader gets.
import { expect, test, type Page } from "@playwright/test";

interface Stats {
  markers: number;
  clusters: number;
  labels: number;
  renders: number;
}

const flatStats = (page: Page): Promise<Stats> => page.evaluate(() => (Reflect.get(globalThis, "chikyuMarkers") as { stats: Stats }).stats);

async function open(page: Page, query = "center=2.35,48.86&zoom=4"): Promise<void> {
  await page.goto(`/chikyu-earth/?${query}`);
  await expect(page.locator("chikyu-earth svg").first()).toBeVisible();
  await page.waitForFunction(() => Reflect.get(globalThis, "chikyuMarkers") !== undefined);
  await expect.poll(async () => (await flatStats(page)).markers + (await flatStats(page)).clusters).toBeGreaterThan(0);
}

test("places are drawn where they are: Paris in the middle of a globe centred on it", async ({ page }) => {
  await open(page);
  const where = await page.evaluate(async () => {
    const earth = document.querySelector("chikyu-earth")!;
    const canvas = earth.shadowRoot!.querySelector("canvas")!;
    const ctx = canvas.getContext("2d")!;
    const w = canvas.width;
    const h = canvas.height;
    // the dot's colour is in a small box around the centre, and the corner of the box is empty (the disc's edge is far away, markers are few)
    const around = ctx.getImageData(Math.round(w / 2) - 6, Math.round(h / 2) - 6, 12, 12).data;
    let painted = 0;
    for (let i = 3; i < around.length; i += 4) if (around[i]! > 0) painted += 1;
    return { painted, w, h };
  });
  expect(where.painted, "Paris's dot is drawn at the centre").toBeGreaterThan(10);
});

test("a label is a button, and a hover, a click and a keyboard focus tell the page which place", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const earth = document.querySelector("chikyu-earth")!;
    const log: string[] = [];
    Reflect.set(globalThis, "events", log);
    for (const type of ["chikyu-marker-hover", "chikyu-marker-click", "chikyu-marker-focus"]) {
      earth.addEventListener(type, (e) => log.push(`${type}:${(e as CustomEvent).detail.marker?.id ?? "none"}`));
    }
  });
  const label = page.getByRole("button", { name: "Paris, a city" });
  await expect(label).toHaveCount(1);
  const box = (await page.locator("chikyu-earth").boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.move(x + 1, y + 1);
  await expect.poll(() => page.evaluate(() => (Reflect.get(globalThis, "events") as string[]).includes("chikyu-marker-hover:city:Paris"))).toBe(true);
  await page.mouse.click(x, y);
  await expect.poll(() => page.evaluate(() => (Reflect.get(globalThis, "events") as string[]).includes("chikyu-marker-click:city:Paris"))).toBe(true);
  await page.mouse.move(box.x + 2, box.y + 2);
  await label.focus();
  await expect.poll(() => page.evaluate(() => (Reflect.get(globalThis, "events") as string[]).includes("chikyu-marker-focus:city:Paris"))).toBe(true);
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => (Reflect.get(globalThis, "events") as string[]).filter((e) => e === "chikyu-marker-click:city:Paris").length)).toBeGreaterThanOrEqual(2);
});

test("a drag is not a click", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    Reflect.set(globalThis, "clicks", 0);
    document.querySelector("chikyu-earth")!.addEventListener("chikyu-marker-click", () => Reflect.set(globalThis, "clicks", (Reflect.get(globalThis, "clicks") as number) + 1));
  });
  const box = (await page.locator("chikyu-earth").boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 60, y + 10, { steps: 6 });
  await page.mouse.up();
  expect(await page.evaluate(() => Reflect.get(globalThis, "clicks"))).toBe(0);
});

test("a group can be hidden and shown, and the choice is kept in the address", async ({ page }) => {
  await open(page);
  const all = await flatStats(page);
  await page.getByRole("button", { name: "Stadiums" }).click();
  await page.getByRole("button", { name: "Cities" }).click();
  await expect.poll(async () => (await flatStats(page)).markers + (await flatStats(page)).clusters).toBe(0);
  await page.getByRole("button", { name: "Cities" }).click();
  await expect.poll(async () => (await flatStats(page)).markers + (await flatStats(page)).clusters).toBeGreaterThan(0);
  expect(all.markers + all.clusters).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => location.search)).toContain("hide=Stadiums");
});

test("a screen reader gets a list of the places", async ({ page }) => {
  await open(page);
  const text = await page.locator("chikyu-earth").evaluate((el) => el.shadowRoot!.querySelector(".cm-list")!.textContent);
  expect(text).toContain("32 places marked on the globe");
  expect(text).toContain("Paris, a city");
  expect(text).toContain("Wembley Stadium, a stadium");
});

test("many places stay cheap: 5000 markers, few labels, clusters, and nothing redrawn at rest", async ({ page }) => {
  await open(page, "center=10,20&places=5000");
  const first = await flatStats(page);
  expect(first.labels).toBeLessThanOrEqual(24);
  expect(first.clusters).toBeGreaterThan(5);
  const buttons = await page.locator("chikyu-earth").evaluate((el) => el.shadowRoot!.querySelectorAll(".cm-label").length);
  expect(buttons, "the label buttons are a pool of at most 24, not one per place").toBeLessThanOrEqual(24);
  const renders = (await flatStats(page)).renders;
  await page.waitForTimeout(1500);
  expect((await flatStats(page)).renders, "no render at rest").toBe(renders);
});

test("5000 markers cost under 10 ms a view change", async ({ page }) => {
  await open(page, "center=10,20&places=5000");
  const ms = await page.evaluate(() => {
    const earth = document.querySelector("chikyu-earth") as unknown as { setView(v: unknown, final: boolean): void };
    const t0 = performance.now();
    for (let i = 0; i < 100; i += 1) earth.setView({ yaw: i * 2, tilt: 0, zoom: 1 + (i % 10) / 20, panX: 0, panY: 0 }, false);
    return (performance.now() - t0) / 100;
  });
  console.log(`5000 markers: ${ms.toFixed(2)} ms a view change`);
  expect(ms).toBeLessThan(10);
});
