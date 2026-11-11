// Follow a large satellite as a 3D model, in a real browser (Chromium, drawn in software): the followed ISS is drawn as the page's model, locked in the middle of the picture for a whole orbit while the Earth turns beneath,
// the page can list the large satellites it has a model for and hop between them, and nothing is drawn at rest. The demo's models are made-up stand-ins (demo/station-models.ts); the package ships none.
import { expect, test, type Page } from "@playwright/test";
import { routeElements } from "./recorded.ts";

test.describe.configure({ mode: "serial" });
test.use({ reducedMotion: "no-preference" });
test.beforeEach(({ page }) => routeElements(page));

const SPACE = "chikyu-space";
const T = "2026-11-02T18:00Z";
/** How far from the middle of the picture the model may be, in CSS pixels. */
const FEW_PIXELS = 3;

async function open(page: Page, query = ""): Promise<void> {
  await page.goto(`/chikyu-earth/?look=space&time=${T}${query.includes("speed=") ? "" : "&speed=0"}&sats=stations&ride=iss&rview=follow${query}`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
}
interface ModelAt {
  x: number;
  y: number;
  shown: boolean;
}
const modelAt = (page: Page): Promise<ModelAt | null> => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { followModel: ModelAt | null }).followModel);
const box = (page: Page): Promise<{ width: number; height: number }> => page.locator(SPACE).evaluate((el) => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }));
const off = async (page: Page): Promise<number> => {
  const at = (await modelAt(page))!;
  const size = await box(page);
  return Math.hypot(at.x - size.width / 2, at.y - size.height / 2);
};

test("the followed ISS is drawn as the page's model, in the middle of the picture", async ({ page }) => {
  await open(page);
  await expect.poll(() => modelAt(page), { timeout: 60_000, message: "the model is made and drawn" }).not.toBeNull();
  expect(await off(page), "the model's middle is within a few pixels of the picture's").toBeLessThan(FEW_PIXELS);
  expect(await page.locator(SPACE).evaluate((el) => (Reflect.get(el, "riding") as { view: string }).view)).toBe("follow");
});

test("for a whole orbit, at 600 times real time, the model stays within a few pixels of the middle while the Earth turns beneath", async ({ page }) => {
  // the demo opens the clock running at 600 times real time when the address says so (Play on): the page's own clock, not a timer of the test
  await open(page, "&play=on&speed=600");
  await expect.poll(() => modelAt(page), { timeout: 60_000 }).not.toBeNull();
  const result = await page.locator(SPACE).evaluate(async (el) => {
    const space = el as unknown as { time: number; getBoundingClientRect(): DOMRect };
    const start = space.time;
    let worst = 0;
    let samples = 0;
    // frames of the page's own, until the clock has gone round the ISS's orbit (about 92 minutes), at most 6000 of them
    for (let frame = 0; frame < 6000 && space.time - start < 93 * 60_000; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const at = (Reflect.get(el, "stats") as { followModel: ModelAt | null }).followModel;
      if (!at) continue;
      const rect = space.getBoundingClientRect();
      worst = Math.max(worst, Math.hypot(at.x - rect.width / 2, at.y - rect.height / 2));
      samples += 1;
    }
    return { worst, samples, ran: (space.time - start) / 60_000 };
  });
  expect(result.ran, "the clock went round the orbit").toBeGreaterThanOrEqual(93);
  expect(result.samples, "the model was there at every sample").toBeGreaterThan(30);
  expect(result.worst, `the model's greatest distance from the middle, over ${result.samples} samples`).toBeLessThan(FEW_PIXELS);
});

test("the large satellites that have a model are listed, and the page hops between them", async ({ page }) => {
  await open(page);
  const list = await page.locator(SPACE).evaluate((el) => (el as unknown as { largeSatellites(): { noradId: number; name: string }[] }).largeSatellites());
  expect(list.map((one) => one.noradId)).toContain(25544);
  expect(list.length).toBeGreaterThanOrEqual(2);
  expect(list.map((one) => one.name)).toContain("ISS");
  const first = await page.locator(SPACE).evaluate((el) => (Reflect.get(el, "riding") as { target: { index: number } }).target.index);
  const hopped = await page.locator(SPACE).evaluate((el) => (el as unknown as { followNext(step?: number): { ref: { index: number }; noradId: number } | null }).followNext());
  expect(hopped).not.toBeNull();
  expect(hopped!.ref.index).not.toBe(first);
  await expect.poll(async () => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "riding") as { target: { index: number } }).target.index)).toBe(hopped!.ref.index);
  // the glide to the next one ends, its model is made, and it is in the middle
  await expect.poll(async () => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { ride: { gliding: boolean } }).ride.gliding), { timeout: 30_000 }).toBe(false);
  await expect.poll(() => modelAt(page), { timeout: 60_000 }).not.toBeNull();
  expect(await off(page)).toBeLessThan(FEW_PIXELS);
  // going back lands on the first again
  const back = await page.locator(SPACE).evaluate((el) => (el as unknown as { followNext(step?: number): { ref: { index: number } } | null }).followNext(-1));
  expect(back!.ref.index).toBe(first);
});

test("nothing is drawn at rest while a model is followed and the clock holds", async ({ page }) => {
  await open(page);
  // the demo's view controls turn the view by themselves (Auto-turn) when motion is allowed: hold it, so only the page's clock and the model could draw
  await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { pause(): void }).pause());
  await expect.poll(() => modelAt(page), { timeout: 60_000 }).not.toBeNull();
  await expect.poll(async () => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { ride: { gliding: boolean } }).ride.gliding), { timeout: 30_000 }).toBe(false);
  // pictures still arriving (a sharper texture) draw the picture: wait until the page has gone thirty frames with no draw at all
  const drawsNow = (): Promise<number> => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { draws: number }).draws);
  await expect
    .poll(
      async () => {
        const before = await drawsNow();
        await page.evaluate(async () => {
          for (let frame = 0; frame < 30; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
        });
        return (await drawsNow()) - before;
      },
      { timeout: 60_000, message: "the picture is at rest" },
    )
    .toBe(0);
  const draws = await drawsNow();
  await page.evaluate(async () => {
    for (let frame = 0; frame < 30; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  expect(await page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { draws: number }).draws), "no draw at rest").toBe(draws);
});
