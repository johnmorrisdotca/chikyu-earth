// The demo must never ask a lot of the machine (the family's rule: no 3D release without a freeze test). Played in headless Chromium, drawing in software, these fail on: more than
// one animation frame asked for at a time, a draw when nothing moves or the view is out of sight or the tab is hidden, live WebGL objects that grow over a run of look changes, and a
// canvas past 6 million pixels or 4096 a side on a 5K screen at a pixel ratio of 2. `pnpm test:freeze` runs it; CI and the release run it.
import { canvasSize, COUNT_SCRIPT, gpuObjects, readCounts, withinPixelBudget } from "@johnmorrisdotca/kazoku-ui/testing";
import { expect, test, type Page } from "@playwright/test";

test.beforeEach(({ browserName }, info) => {
  test.skip(browserName !== "chromium" || info.project.name !== "chromium-desk", "WebGL is drawn in the desk Chromium here, in software");
});
test.describe.configure({ mode: "serial" });

const NOON = "2026-06-21T12:00Z";
// "satellites" is the space view with the stations and 2,000 Starlink satellites on show, "ride" the same with the camera on the ISS.
const LOOKS = ["realistic", "space", "satellites", "ride"] as const;
const ELEMENT = { realistic: "chikyu-earth-realistic", space: "chikyu-space", satellites: "chikyu-space", ride: "chikyu-space" } as const;

async function open(page: Page, look: (typeof LOOKS)[number], query = ""): Promise<void> {
  await page.addInitScript(COUNT_SCRIPT);
  const space = look === "space" || look === "satellites" || look === "ride";
  const withSatellites = look === "satellites" || look === "ride";
  await page.goto(`/chikyu-earth/?look=${space ? "space" : look}&time=${withSatellites ? "2026-11-02T18:00Z" : NOON}&center=10,20${space ? "&speed=0" : ""}${look === "satellites" ? "&sats=stations,starlink" : ""}${look === "ride" ? "&ride=iss" : ""}${query}`);
  await page.locator(`${ELEMENT[look]}[data-state=live]`).waitFor({ timeout: 60_000 });
  // riding at the ISS needs the Earth's largest pictures: let them arrive, and the ones that are let go be let go, before anything is asked of the page
  if (look === "ride") await expect.poll(async () => page.locator("chikyu-space").evaluate((el) => (Reflect.get(el, "stats") as { ride: { riding: boolean } }).ride.riding), { timeout: 30_000 }).toBe(true);
  if (look === "satellites") await expect.poll(async () => page.locator("chikyu-space").evaluate((el) => (Reflect.get(el, "stats") as { satellites: { groups: number } }).satellites.groups), { timeout: 20_000 }).toBe(2);
  await expect.poll(async () => (await readCounts(page)).draws).toBeGreaterThan(0);
  await page.waitForTimeout(look === "ride" ? 8000 : 800);
}

/** Make sure the controls are turning the view (a page that opens with `autoplay` already is). */
const turn = (page: Page) =>
  page.locator("kazoku-view-controls").evaluate((el) => {
    const controls = el as HTMLElement & { state: { turning: boolean }; play(): void };
    if (!controls.state.turning) controls.play();
  });

/** Frames the element has drawn (its own count; a frame of the space view is a few dozen GL draw calls). */
const framesDrawn = (page: Page, look: (typeof LOOKS)[number]) => page.locator(ELEMENT[look]).evaluate((el) => (Reflect.get(el, "stats") as { draws: number }).draws);

const bounded = async (page: Page, ms: number, look: (typeof LOOKS)[number] = "realistic") => {
  const start = await readCounts(page);
  const framesStart = await framesDrawn(page, look);
  await page.waitForTimeout(ms);
  const end = await readCounts(page);
  return { frames: (await framesDrawn(page, look)) - framesStart, draws: end.draws - start.draws, requests: end.rafRequests - start.rafRequests, callbacks: end.rafCallbacks - start.rafCallbacks, outstanding: end.rafRequests - end.rafCallbacks };
};

for (const look of LOOKS) {
  test.describe(`the ${look} look`, () => {
    test("at rest nothing is drawn and no frame is asked for", async ({ page }) => {
      await open(page, look);
      const rest = await bounded(page, 3000, look);
      expect(rest.draws).toBe(0);
      expect(rest.frames).toBe(0);
      expect(rest.requests).toBeLessThanOrEqual(2);
    });

    test.describe("turning", () => {
      test.use({ reducedMotion: "no-preference" });

      test("it draws at most once for each frame of the page, and asks for one frame at a time", async ({ page }) => {
        await open(page, look);
        await turn(page);
        await page.waitForTimeout(500);
        const turning = await bounded(page, 3000, look);
        expect(turning.callbacks).toBeGreaterThan(5);
        expect(turning.frames, "frames drawn").toBeLessThanOrEqual(turning.callbacks + 3);
        expect(turning.draws, "GL draw calls for each frame drawn").toBeLessThanOrEqual(Math.max(1, turning.frames) * 40);
        expect(turning.requests, "no more frames asked for than the page ran").toBeLessThanOrEqual(turning.callbacks + 3);
        expect(turning.outstanding, "one request waiting at a time").toBeLessThanOrEqual(3);
      });

      test("out of sight, and in a hidden tab, it draws nothing and asks for nothing, though the controls keep turning", async ({ page }) => {
        await open(page, look);
        await turn(page);
        await page.waitForTimeout(500);
        await page.evaluate(() => {
          const spacer = document.createElement("div");
          spacer.style.height = "6000px";
          document.body.prepend(spacer);
          window.scrollTo(0, 0);
          document.querySelector("#globe")!.scrollIntoView = () => undefined;
        });
        await expect.poll(async () => page.locator(ELEMENT[look]).evaluate((el) => el.getBoundingClientRect().top)).toBeGreaterThan(1000);
        await page.waitForTimeout(800);
        const away = await bounded(page, 2500, look);
        expect(away.draws, "no GL draws out of sight").toBe(0);
        expect(away.frames).toBe(0);

        await page.evaluate(() => window.scrollTo(0, 0));
        await page.evaluate(() => {
          Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
          Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
          document.dispatchEvent(new Event("visibilitychange"));
        });
        await page.waitForTimeout(500);
        const hidden = await bounded(page, 2500, look);
        expect(hidden.draws, "no GL draws in a hidden tab").toBe(0);
        expect(hidden.frames).toBe(0);
      });
    });

    test("on a 5K screen at a pixel ratio of 2 its canvas stays inside 6 million pixels and 4096 a side", async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
      const page = await context.newPage();
      await open(page, look);
      await page.locator("#globe").evaluate((el, selector) => {
        el.style.cssText += ";width:2560px;max-width:none;height:1440px";
        el.querySelector(selector)!.setAttribute("style", "aspect-ratio:auto;height:1440px");
      }, ELEMENT[look]);
      await page.waitForTimeout(2000);
      const size = await page.locator(ELEMENT[look]).evaluate((el) => {
        const canvases = [...el.shadowRoot!.querySelectorAll("canvas")].filter((canvas) => canvas.getAttribute("aria-hidden") !== "true" && !canvas.classList.contains("cm-canvas")) as HTMLCanvasElement[];
        return { pixels: Math.max(...canvases.map((c) => c.width * c.height)), side: Math.max(...canvases.flatMap((c) => [c.width, c.height])), count: canvases.length };
      });
      expect(size.count).toBe(1);
      expect(withinPixelBudget(size)).toBe(true);
      expect((await canvasSize(page)).count, "and the page has no other canvas of its own").toBe(0);
      expect((await readCounts(page)).contexts, "one WebGL context").toBe(1);
      await context.close();
    });
  });
}

test("changing the look over and over gives back what it took: GPU objects stay flat in the one context, and the line look lets the context go", async ({ page }) => {
  await page.addInitScript(COUNT_SCRIPT);
  // a moment near the satellites' elements, so every orbit is drawn and counted
  await page.goto(`/chikyu-earth/?time=2026-11-02T18:00Z&center=10,20`);
  await expect(page.locator("chikyu-earth svg")).toBeVisible();
  const look = (name: string) => page.getByRole("button", { name, exact: true }).click();
  const settled: number[] = [];
  for (let round = 0; round < 6; round += 1) {
    await look("Realistic");
    await page.locator("chikyu-earth-realistic[data-state=live]").waitFor({ timeout: 60_000 });
    await page.waitForTimeout(500);
    await look("Space");
    await page.locator("chikyu-space[data-state=live]").waitFor({ timeout: 60_000 });
    for (const name of ["Stations", "Starlink"]) {
      const button = page.getByRole("button", { name, exact: true });
      if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
    }
    await expect.poll(async () => page.locator("chikyu-space").evaluate((el) => (Reflect.get(el, "stats") as { satellites: { groups: number } }).satellites.groups), { timeout: 20_000 }).toBe(2);
    // the camera on the ISS and off it again, as a reader would
    await page.getByRole("group", { name: "Ride along" }).getByRole("button", { name: round % 2 === 0 ? "ISS" : "Moon", exact: true }).dispatchEvent("click");
    // the satellites are drawn at least once (their buffers are made by the first draw) before the objects are counted
    await page.waitForTimeout(2500);
    const counted = await readCounts(page);
    settled.push(gpuObjects(counted));
    expect(counted.contexts, "one WebGL context for the page, however the look changes").toBe(1);
  }
  console.log(`live GPU objects after each round: ${settled.join(", ")}`);
  // The first round only warms the page up (the first shaders and the satellites' first draw come after the first count in software drawing), so the baseline is the second.
  expect(Math.max(...settled.slice(1)), "no more GPU objects after six rounds than after the second, give or take three.js's own fixtures").toBeLessThanOrEqual(settled[1]! + 8);

  await look("Thick");
  await expect(page.locator("chikyu-space")).toHaveCount(0);
  // The shared renderer lets the context go a moment after the last view leaves, and takes its canvas with it.
  await expect.poll(async () => page.evaluate(() => document.querySelectorAll("canvas").length + [...document.querySelectorAll("*")].filter((el) => el.shadowRoot?.querySelector("canvas:not(.cm-canvas)")).length), { timeout: 15_000 }).toBe(0);
});
