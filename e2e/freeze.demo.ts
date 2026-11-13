// The demo must never ask a lot of the machine (the family's rule: no 3D release without a freeze test). Played in headless Chromium, drawing in software, these fail on: more than
// one animation frame asked for at a time, a draw when nothing moves or the view is out of sight or the tab is hidden, live WebGL objects that grow over a run of look changes, and a
// canvas past 6 million pixels or 4096 a side on a 5K screen at a pixel ratio of 2. `pnpm test:freeze` runs it; CI and the release run it.
import { canvasSize, COUNT_SCRIPT, gpuObjects, readCounts, withinPixelBudget } from "@johnmorrisdotca/kazoku-ui/testing";
import { expect, test, type Page } from "@playwright/test";
import { DOWNGRADE_AFTER_MS } from "../src/realistic/textures.ts";
import { SEA_RADIUS } from "../src/sea-names/geometry.ts";
import { MOON_KEEP_MS } from "../src/space/scene.ts";
import { untilStill } from "./gl.ts";
import { routeElements } from "./recorded.ts";
import { routeTiles } from "./tiles-fixture.ts";

test.beforeEach(({ page }) => routeElements(page));

test.beforeEach(({ browserName }, info) => {
  test.skip(browserName !== "chromium" || info.project.name !== "chromium-desk", "WebGL is drawn in the desk Chromium here, in software");
});
test.describe.configure({ mode: "serial" });

const NOON = "2026-06-21T12:00Z";
// "satellites" is the space view with the stations and 2,000 Starlink satellites on show, "ride" the same with the camera on the ISS, "above" with the camera over the ISS looking down (both with the satellite's beam on, with 19 spot cells: it is part of the draw that moves the satellite, so it must add no frame, no draw at rest and no object that stays).
const LOOKS = ["realistic", "space", "satellites", "ride", "above"] as const;
const ELEMENT = { realistic: "chikyu-earth-realistic", space: "chikyu-space", satellites: "chikyu-space", ride: "chikyu-space", above: "chikyu-space" } as const;

/**
 * `size` is how the ridden model is sized as the ride rises (`ride-model-size`): the demo's "above" look rides at its default 3,000 km, where the model of the default `distance` size has handed over to the ordinary mark and is not drawn, so the looks that
 * mean to have the model drawn ask for `fixed` (the same size at every height, as before 0.46.1); `distance` is the default and is checked on its own (MODULES-1306).
 */
async function open(page: Page, look: (typeof LOOKS)[number], query = "", size: "fixed" | "distance" = "fixed"): Promise<void> {
  await page.addInitScript(COUNT_SCRIPT);
  const space = look === "space" || look === "satellites" || look === "ride" || look === "above";
  const withSatellites = look === "satellites" || look === "ride" || look === "above";
  await page.goto(`/chikyu-earth/?look=${space ? "space" : look}&time=${withSatellites ? "2026-11-02T18:00Z" : NOON}&center=10,20${space ? "&speed=0" : ""}${look === "satellites" ? "&sats=stations,starlink" : ""}${look === "ride" ? "&ride=iss&beam=on&beam-cells=19" : look === "above" ? "&ride=iss&rview=above&beam=on&beam-cells=19" : ""}${query}`);
  await page.locator(`${ELEMENT[look]}[data-state=live]`).waitFor({ timeout: 60_000 });
  // riding at the ISS needs the Earth's largest pictures: let them arrive, and the ones that are let go be let go, before anything is asked of the page
  if (look === "ride" || look === "above") await expect.poll(async () => page.locator("chikyu-space").evaluate((el) => (Reflect.get(el, "stats") as { ride: { riding: boolean } }).ride.riding), { timeout: 30_000 }).toBe(true);
  if (look === "above" && size === "fixed") await page.locator("chikyu-space").evaluate((el) => el.setAttribute("ride-model-size", "fixed"));
  if (look === "satellites") await expect.poll(async () => page.locator("chikyu-space").evaluate((el) => (Reflect.get(el, "stats") as { satellites: { groups: number } }).satellites.groups), { timeout: 20_000 }).toBe(2);
  await expect.poll(async () => (await readCounts(page)).draws).toBeGreaterThan(0);
  // 800 ms for the pictures to arrive, and the second in which a reader who asked for reduced motion has the draws they ask for gathered (MODULES-1195)
  await page.waitForTimeout(look === "ride" || look === "above" ? 8000 : 800 + 1000);
}

/**
 * The space view at rest after a ride: the glide over, the larger Earth pictures it no longer needs let go (the texture set keeps one DOWNGRADE_AFTER_MS after a smaller one is enough, and a moon out of
 * sight is kept MOON_KEEP_MS), nothing in the renderer's cache without a user (it keeps one a second before it frees it), and a second in which nothing changes and nothing is drawn. A count read before
 * that counts what is about to go: 122 or 123 against 114 at rest, now and then (MODULES-1095).
 */
async function atRest(page: Page): Promise<void> {
  const now = () =>
    page.locator("chikyu-space").evaluate((el) => {
      const s = Reflect.get(el, "stats") as { draws: number; tiers: Record<string, number>; assets: { entries: number; refs: number }; ride: { gliding: boolean } };
      return { gliding: s.ride.gliding, unused: s.assets.entries - s.assets.refs, mark: JSON.stringify([s.draws, s.tiers, s.assets.entries, s.assets.refs]) };
    });
  await expect.poll(async () => (await now()).gliding, { timeout: 30_000, message: "the ride's glide ends" }).toBe(false);
  // the keeps run on their own timers, not on a draw, so nothing the page reports says one is waiting: wait them out from the glide's end
  await page.waitForTimeout(Math.max(DOWNGRADE_AFTER_MS, MOON_KEEP_MS) + 500);
  let before = await now();
  await expect
    .poll(
      async () => {
        await page.waitForTimeout(1000);
        const after = await now();
        const still = after.mark === before.mark && after.unused === 0;
        before = after;
        return still;
      },
      { timeout: 20_000, intervals: [0], message: "the pictures it no longer needs are let go and nothing changes for a second" },
    )
    .toBe(true);
}

/**
 * Wait until no GL draw has been made over two readings 700 ms apart: what was asked for before the view went out of sight or the tab was hidden has been drawn (or dropped), however late a saturated machine got to it. The controls keep turning and may keep asking for frames of their
 * own in these tests, so unlike `untilStill` this looks at the GL draw count alone. After it, a count of draws is of what comes later (MODULES-1319).
 */
async function drawsStill(page: Page, timeout = 30_000): Promise<void> {
  let last = -1;
  await expect
    .poll(
      async () => {
        const now = (await readCounts(page)).draws;
        const still = now === last;
        last = now;
        return still;
      },
      { timeout, intervals: [700], message: "the draws asked for before it went out of sight have landed and no more come" },
    )
    .toBe(true);
}

/** Make sure the controls are turning the view (a page that opens with `autoplay` already is). */
const turn = (page: Page) =>
  page.locator("kazoku-view-controls").evaluate((el) => {
    const controls = el as HTMLElement & { state: { turning: boolean }; play(): void };
    if (!controls.state.turning) controls.play();
  });

/** The page's counts and the element's frames drawn, read in one go: read one after the other, a frame could be in the draw calls and not yet in the frames (or the other way), and a count of a dozen frames then reads a frame's cost out by a few draws a frame. */
const snapshot = (page: Page, look: (typeof LOOKS)[number]) =>
  page.evaluate(
    (tag) => ({ counts: JSON.parse(JSON.stringify(Reflect.get(window, "__kazokuCount"))) as Awaited<ReturnType<typeof readCounts>>, frames: (Reflect.get(document.querySelector(tag)!, "stats") as { draws: number }).draws }),
    ELEMENT[look],
  );

const bounded = async (page: Page, ms: number, look: (typeof LOOKS)[number] = "realistic") => {
  const start = await snapshot(page, look);
  await page.waitForTimeout(ms);
  const stop = await snapshot(page, look);
  const end = stop.counts;
  return { frames: stop.frames - start.frames, draws: end.draws - start.counts.draws, requests: end.rafRequests - start.counts.rafRequests, callbacks: end.rafCallbacks - start.counts.rafCallbacks, outstanding: end.rafRequests - end.rafCallbacks };
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
        // above the ISS, and riding it (outside by default), the demo's stand-in model is drawn beside the scene (a draw call for each mesh it is made of, as the scene says), and nothing else is allowed more
        const parts = look === "above" || look === "ride" ? await page.locator("chikyu-space").evaluate((el) => (Reflect.get(el, "stats") as { followModel: { parts: number } | null }).followModel?.parts ?? 0) : 0;
        if (look === "above" || look === "ride") expect(parts, "the model is drawn").toBeGreaterThan(0);
        console.log("TURNING", JSON.stringify(turning), parts);
        expect(turning.draws, "GL draw calls for each frame drawn").toBeLessThanOrEqual(Math.max(1, turning.frames) * (40 + parts));
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
        // the page's own observer is made after the renderer's, so when it says the element is out of view the renderer has been told too; on a machine throttled to a quarter of its speed that is long after the scroll
        await page.locator(ELEMENT[look]).evaluate(
          (el) =>
            new Promise<void>((done) => {
              const watch = new IntersectionObserver((entries) => {
                if (!entries[entries.length - 1]!.isIntersecting) {
                  watch.disconnect();
                  done();
                }
              });
              watch.observe(el);
            }),
        );
        // a frame asked for before the view went out of sight is drawn, rightly, however late a saturated machine gets to it: wait for the draws to hold still, then count (MODULES-1319)
        await drawsStill(page);
        const away = await bounded(page, 2500, look);
        expect(away.draws, "no GL draws out of sight").toBe(0);
        expect(away.frames).toBe(0);

        await page.evaluate(() => window.scrollTo(0, 0));
        await page.evaluate(() => {
          Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
          Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
          document.dispatchEvent(new Event("visibilitychange"));
        });
        // the same: a frame already asked for may land late (51 GL draws on a machine at load 50 to 60); the counts are of what comes after the draws have held still (MODULES-1319)
        await drawsStill(page);
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


// The default size of a ridden model shrinks as the ride rises (MODULES-1306): over the ISS at the demo's 3,000 km the model has handed over to the ordinary mark, so none is drawn, and the view still draws at most once for each frame of the page.
test.describe("the above look at the default model size", () => {
  test.use({ reducedMotion: "no-preference" });
  test("no model at 3,000 km, and still at most one draw for each frame, one frame asked for at a time", async ({ page }) => {
    await open(page, "above", "", "distance");
    await turn(page);
    await page.waitForTimeout(500);
    const turning = await bounded(page, 3000, "above");
    expect(turning.callbacks).toBeGreaterThan(5);
    expect(turning.frames, "frames drawn").toBeLessThanOrEqual(turning.callbacks + 3);
    const model = await page.locator("chikyu-space").evaluate((el) => (Reflect.get(el, "stats") as { followModel: unknown }).followModel);
    expect(model, "no model is drawn from 3,000 km above").toBeNull();
    expect(turning.draws, "GL draw calls for each frame drawn").toBeLessThanOrEqual(Math.max(1, turning.frames) * 40);
    expect(turning.requests, "no more frames asked for than the page ran").toBeLessThanOrEqual(turning.callbacks + 3);
    expect(turning.outstanding, "one request waiting at a time").toBeLessThanOrEqual(3);
  });
});
test.describe("the full-screen space view (fullscreen.html?look=space), with the planets' pictures", () => {
  const openFull = async (page: Page): Promise<void> => {
    await page.addInitScript(COUNT_SCRIPT);
    await page.goto(`/chikyu-earth/fullscreen.html?look=space&time=${NOON}&speed=0`);
    await page.locator("chikyu-space[data-state=live]").waitFor({ timeout: 60_000 });
    await expect.poll(async () => page.locator("chikyu-space").evaluate((el) => (Reflect.get(el, "stats") as { bodies: { painted: number } }).bodies.painted), { timeout: 30_000 }).toBe(9);
    await expect.poll(async () => (await readCounts(page)).draws).toBeGreaterThan(0);
    // rest, not a wait: on a saturated machine the pictures and the gathered draws land seconds after the painted count reads 9, so the count is taken when the element says nothing is still to come and the draws have held still (MODULES-1319)
    await untilStill(page);
  };

  test("at rest nothing is drawn and no frame is asked for", async ({ page }) => {
    await openFull(page);
    const rest = await bounded(page, 3000, "space");
    expect(rest.draws).toBe(0);
    expect(rest.frames).toBe(0);
    expect(rest.requests).toBeLessThanOrEqual(2);
  });

  test("on a 5K screen at a pixel ratio of 2 the full-screen canvas stays inside 6 million pixels and 4096 a side", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
    const page = await context.newPage();
    await openFull(page);
    const size = await page.locator("chikyu-space").evaluate((el) => {
      const canvases = [...el.shadowRoot!.querySelectorAll("canvas")].filter((canvas) => canvas.getAttribute("aria-hidden") !== "true" && !canvas.classList.contains("cm-canvas")) as HTMLCanvasElement[];
      const box = el.getBoundingClientRect();
      return { pixels: Math.max(...canvases.map((c) => c.width * c.height)), side: Math.max(...canvases.flatMap((c) => [c.width, c.height])), count: canvases.length, width: box.width, height: box.height };
    });
    expect([size.width, size.height], "the element is the whole screen").toEqual([2560, 1440]);
    expect(size.count).toBe(1);
    expect(withinPixelBudget(size)).toBe(true);
    expect((await readCounts(page)).contexts, "one WebGL context").toBe(1);
    await context.close();
  });
});

test("changing the look over and over gives back what it took: GPU objects stay flat in the one context, and the line look lets the context go", async ({ page }) => {
  // six rounds, each waiting twice for the space view to be at rest (where it opens, and where it is sent): about 25 s a round
  test.setTimeout(240_000);
  await page.addInitScript(COUNT_SCRIPT);
  // a moment near the satellites' elements, so every orbit is drawn and counted
  await page.goto(`/chikyu-earth/?time=2026-11-02T18:00Z&center=10,20`);
  await expect(page.locator("chikyu-earth svg")).toBeVisible();
  const look = (name: string) => page.getByRole("button", { name, exact: true }).click();
  const settled: number[] = [];
  // what a round rides: the ISS in the even rounds, the Moon in the odd
  const ridden = (round: number): "ISS" | "Moon" => (round % 2 === 0 ? "ISS" : "Moon");
  for (let round = 0; round < 6; round += 1) {
    await look("Realistic");
    await page.locator("chikyu-earth-realistic[data-state=live]").waitFor({ timeout: 60_000 });
    await page.waitForTimeout(500);
    await look("Space");
    await page.locator("chikyu-space[data-state=live]").waitFor({ timeout: 60_000 });
    for (const name of ["Stations", "Starlink"]) {
      const button = page.locator("#sat-groups").getByRole("button", { name, exact: true });
      if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
    }
    await expect.poll(async () => page.locator("chikyu-space").evaluate((el) => (Reflect.get(el, "stats") as { satellites: { groups: number } }).satellites.groups), { timeout: 20_000 }).toBe(2);
    // The view opens where the address left the last ride (the ISS or the Moon) and draws there. Let it be at rest there before it is sent on, as a reader would see it: a view that
    // opened at the ISS has drawn the Earth from its larger pictures, and keeps what three.js made for that (8 objects) while it lives. Sent on before its first frame, it never drew the
    // Earth large and held 8 fewer (106 against 114), so a round's count depended on whether the page or the click came first.
    await atRest(page);
    // the camera on the ISS and off it again, as a reader would
    await page.getByRole("group", { name: "Ride along" }).getByRole("button", { name: ridden(round), exact: true }).dispatchEvent("click");
    // the satellites are drawn at least once (their buffers are made by the first draw), and what the last place needed is let go, before the objects are counted
    await atRest(page);
    const counted = await readCounts(page);
    settled.push(gpuObjects(counted));
    expect(counted.contexts, "one WebGL context for the page, however the look changes").toBe(1);
  }
  console.log(`live GPU objects after each round: ${settled.join(", ")}`);
  // The first round only warms the page up (the first shaders and the satellites' first draw come after the first count in software drawing), so the baseline is the second.
  // A round on the ISS holds the satellite's model (a ride is outside by default, MODULES-1236: the demo's stand-in is made of 16 meshes) and a round on the Moon holds none, so each is held to the fixed baseline of its own
  // ride: the first round is a warm-up, round 1 (the Moon) and round 2 (the ISS) are the baselines, and no later round may hold more than its baseline, give or take three.js's own fixtures.
  const baseline = { ISS: settled[2]!, Moon: settled[1]! };
  for (let round = 1; round < settled.length; round += 1) {
    expect(settled[round]!, `round ${round + 1} (${ridden(round)}) holds no more GPU objects than its baseline, give or take three.js's own fixtures`).toBeLessThanOrEqual(baseline[ridden(round)] + 8);
  }

  await look("Thick");
  await expect(page.locator("chikyu-space")).toHaveCount(0);
  // The shared renderer lets the context go a moment after the last view leaves, and takes its canvas with it.
  await expect.poll(async () => page.evaluate(() => document.querySelectorAll("canvas").length + [...document.querySelectorAll("*")].filter((el) => el.shadowRoot?.querySelector("canvas:not(.cm-canvas)")).length), { timeout: 15_000 }).toBe(0);
});

test("the map tiles: zooming in and out over and over gives back what it took, holds few tiles, and draws nothing at rest", async ({ page }) => {
  // six rounds, each waiting the tile set's 4 s for the coarser tiles to go before it counts rest: 10 to 15 s a round on a busy machine
  test.setTimeout(150_000);
  const log = await routeTiles(page);
  await open(page, "realistic");
  const earth = page.locator("chikyu-earth-realistic");
  const tiles = () => earth.evaluate((el) => (Reflect.get(el, "stats") as { tiles: { ready: boolean; level: number | null; held: number; shown: number; loading: number; requested: number } }).tiles);
  await expect.poll(async () => (await tiles()).ready).toBe(true);
  const radiusFor = async (radius: number) => {
    const box = (await earth.boundingBox())!;
    return radius / (Math.min(box.width, box.height) / 2 / 1.08 - 1);
  };
  const view = (zoom: number, yaw = 0) => earth.evaluate((el, v) => (el as unknown as { setView(v: unknown, final: boolean): void }).setView(v, true), { yaw, tilt: 0, zoom, panX: 0, panY: 0 });
  const settled: number[] = [];
  const peaks: number[] = [];
  let heldMost = 0;
  for (let round = 0; round < 6; round += 1) {
    await view(await radiusFor(1000), round * 7);
    await expect.poll(async () => (await tiles()).level, { timeout: 30_000 }).toBe(3);
    await expect.poll(async () => (await tiles()).shown, { timeout: 30_000 }).toBeGreaterThan(2);
    await view(await radiusFor(2600), round * 7);
    let most = 0;
    const watched = async () => {
      const now = await tiles();
      most = Math.max(most, now.held);
      return now;
    };
    await expect.poll(async () => (await watched()).level, { timeout: 30_000 }).toBe(4);
    await expect.poll(async () => (await watched()).loading, { timeout: 30_000 }).toBe(0);
    await page.waitForTimeout(600);
    peaks.push(gpuObjects(await readCounts(page)));
    heldMost = Math.max(heldMost, (await tiles()).held);
    // the tiles of the level before are let go TILE_KEEP_MS after the zoom, and the sphere is drawn once more when one of them was on it: that frame is the zoom's last, not one at rest, and
    // when the finer tiles take 2 to 3.5 s to come it fell inside the count. Wait for the page to let them go (its held count drops) and for that frame, then count.
    await expect.poll(async () => (await watched()).held, { timeout: 30_000 }).toBeLessThan(most);
    await untilStill(page);
    // at rest with the tiles on the sphere nothing is drawn
    const rest = await bounded(page, 1500);
    expect(rest.draws, "no GL draws at rest with the tiles loaded").toBe(0);
    expect(rest.frames).toBe(0);
    await view(1);
    await expect.poll(async () => (await tiles()).held, { timeout: 20_000 }).toBe(0);
    await page.waitForTimeout(2000);
    const counted = await readCounts(page);
    settled.push(gpuObjects(counted));
    expect(counted.contexts, "one WebGL context").toBe(1);
  }
  console.log(`live GPU objects with the tiles on the sphere: ${peaks.join(", ")}; after each zoom out: ${settled.join(", ")}; the most tiles held: ${heldMost}; tiles fetched: ${log.tiles.length}`);
  expect(heldMost, "tiles held at once").toBeLessThanOrEqual(48);
  expect(Math.max(...settled.slice(1)), "no more GPU objects after six rounds than after the second").toBeLessThanOrEqual(settled[1]! + 8);
  expect(Math.max(...peaks.slice(1)), "the same number with the tiles on, round after round").toBeLessThanOrEqual(peaks[1]! + 8);
  expect(settled[5]!, "zoomed out, the tiles' textures and buffers are all gone").toBeLessThanOrEqual(settled[0]! + 2);
});

test("the borders: nothing drawn at rest with them on, and switching the look over and over with them on gives back what it took", async ({ page }) => {
  test.setTimeout(180_000);
  await open(page, "realistic", "&borders=on");
  const shownIn = (tag: string) => page.locator(tag).evaluate((el) => (Reflect.get(el, "stats") as { borders: { shown: { countries: boolean } } }).borders.shown.countries);
  await expect.poll(() => shownIn("chikyu-earth-realistic"), { timeout: 30_000, message: "the countries' borders are drawn" }).toBe(true);
  await untilStill(page);
  const rest = await bounded(page, 2000);
  expect(rest.draws, "no GL draws at rest with the borders on").toBe(0);
  expect(rest.frames).toBe(0);
  const look = (name: string) => page.getByRole("button", { name, exact: true }).click();
  const settled: number[] = [];
  for (let round = 0; round < 4; round += 1) {
    await look("Space");
    await page.locator("chikyu-space[data-state=live]").waitFor({ timeout: 60_000 });
    await expect.poll(() => shownIn("chikyu-space"), { timeout: 30_000 }).toBe(true);
    await untilStill(page);
    expect((await bounded(page, 1500, "space")).draws, "nor in the space view").toBe(0);
    await look("Realistic");
    await page.locator("chikyu-earth-realistic[data-state=live]").waitFor({ timeout: 60_000 });
    await expect.poll(() => shownIn("chikyu-earth-realistic"), { timeout: 30_000 }).toBe(true);
    await untilStill(page);
    await page.waitForTimeout(DOWNGRADE_AFTER_MS + 500);
    const counted = await readCounts(page);
    settled.push(gpuObjects(counted));
    expect(counted.contexts).toBe(1);
  }
  console.log(`live GPU objects with the borders on, after each round: ${settled.join(", ")}`);
  expect(Math.max(...settled.slice(1)), "no more GPU objects after four rounds than after the first").toBeLessThanOrEqual(settled[0]! + 8);
});

test("the grid and the country names: nothing drawn at rest with them on, and switching the look over and over with them on gives back what it took", async ({ page }) => {
  test.setTimeout(180_000);
  await open(page, "realistic", "&grid=on&country-names=on");
  const statsIn = (tag: string) =>
    page.locator(tag).evaluate((el) => {
      const stats = Reflect.get(el, "stats") as { grid: { shown: boolean; builds: number }; countryNames: { names: number; renders: number } };
      return { grid: stats.grid.shown, builds: stats.grid.builds, names: stats.countryNames.names, renders: stats.countryNames.renders };
    });
  const ready = async (tag: string): Promise<void> => {
    await expect.poll(async () => (await statsIn(tag)).grid, { timeout: 30_000, message: "the grid is drawn" }).toBe(true);
    await expect.poll(async () => (await statsIn(tag)).names, { timeout: 30_000, message: "the countries are named" }).toBeGreaterThan(0);
  };
  await ready("chikyu-earth-realistic");
  await untilStill(page);
  const before = await statsIn("chikyu-earth-realistic");
  const rest = await bounded(page, 2000);
  expect(rest.draws, "no GL draws at rest with the grid and the names on").toBe(0);
  expect(rest.frames).toBe(0);
  expect((await statsIn("chikyu-earth-realistic")).renders, "nor are the names laid out again").toBe(before.renders);
  const look = (name: string) => page.getByRole("button", { name, exact: true }).click();
  const settled: number[] = [];
  for (let round = 0; round < 4; round += 1) {
    await look("Space");
    await page.locator("chikyu-space[data-state=live]").waitFor({ timeout: 60_000 });
    await ready("chikyu-space");
    await untilStill(page);
    expect((await bounded(page, 1500, "space")).draws, "nor in the space view").toBe(0);
    await look("Realistic");
    await page.locator("chikyu-earth-realistic[data-state=live]").waitFor({ timeout: 60_000 });
    await ready("chikyu-earth-realistic");
    await untilStill(page);
    await page.waitForTimeout(DOWNGRADE_AFTER_MS + 500);
    const counted = await readCounts(page);
    settled.push(gpuObjects(counted));
    expect(counted.contexts).toBe(1);
  }
  console.log(`live GPU objects with the grid and the names on, after each round: ${settled.join(", ")}`);
  expect(Math.max(...settled.slice(1)), "no more GPU objects after four rounds than after the first").toBeLessThanOrEqual(settled[0]! + 8);
});

test("the planets: the Sun, planets, Pluto and moons painted, the looks switched and the moons shown, nothing grows and nothing is drawn at rest", async ({ page }) => {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/?look=space&time=2026-11-02T14:00Z&speed=0&bodies=painted&center=10,20`);
  await page.locator("chikyu-space[data-state=live]").waitFor({ timeout: 60_000 });
  const bodies = () => page.locator("chikyu-space").evaluate((el) => (Reflect.get(el, "stats") as { bodies: { look: string; painted: number; moons: number } }).bodies);
  await expect.poll(async () => (await bodies()).painted, { timeout: 30_000 }).toBe(9);
  expect((await bodies()).look).toBe("painted");
  // a planet with its moons at the zoom that shows them
  await page.getByRole("group", { name: "Go to" }).getByRole("button", { name: "Jupiter and its moons", exact: true }).dispatchEvent("click");
  await expect.poll(async () => (await bodies()).moons, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  await page.waitForTimeout(3000);
  const rest = await bounded(page, 2500, "space");
  expect(rest.draws, "nothing is drawn at rest, planets and moons included").toBe(0);
  expect(rest.requests).toBe(0);
  const counts: number[] = [];
  const pick = (name: string) => page.getByRole("group", { name: "Planets", exact: true }).getByRole("button", { name, exact: true }).dispatchEvent("click");
  for (let round = 0; round < 4; round += 1) {
    for (const [name, look] of [["Shaded", "realistic"], ["Painted", "painted"], ["Plain", "plain"], ["Painted", "painted"]] as const) {
      await pick(name);
      await expect.poll(async () => (await bodies()).look, { timeout: 15_000 }).toBe(look);
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(1500);
    const c = await readCounts(page);
    counts.push(gpuObjects(c));
    expect(c.contexts, "one WebGL context for the page").toBe(1);
  }
  console.log(`live GPU objects after each round of looks: ${counts.join(", ")}`);
  expect(Math.max(...counts.slice(1)), "no more GPU objects after four rounds than after the second").toBeLessThanOrEqual(counts[1]! + 8);
  // far from any planet the moons are let go
  await page.getByRole("group", { name: "Go to" }).getByRole("button", { name: "Solar system", exact: true }).dispatchEvent("click");
  await expect.poll(async () => (await bodies()).moons, { timeout: 15_000 }).toBe(0);
});

test.describe("the space view's clock", () => {
  test.use({ reducedMotion: "no-preference" });

  test("Play at a day a second draws at most thirty frames a second, one frame at a time, a lookup about once a second, and Pause leaves nothing drawn", async ({ page }) => {
    await open(page, "space");
    await page.locator("kazoku-view-controls").evaluate((el) => (el as HTMLElement & { pause(): void }).pause());
    await page.locator('#replay button[data-v="86400"]').dispatchEvent("click");
    await page.locator('#replay [data-act="play"]').dispatchEvent("click");
    await page.waitForTimeout(1500);
    const s0 = await page.locator("chikyu-space").evaluate((el) => (Reflect.get(el, "stats") as { draws: number; lookups: number }));
    const running = await bounded(page, 4000, "space");
    const s1 = await page.locator("chikyu-space").evaluate((el) => (Reflect.get(el, "stats") as { draws: number; lookups: number }));
    expect(running.frames, "frames drawn while it runs").toBeGreaterThan(0);
    expect(running.frames).toBeLessThanOrEqual(4 * 31);
    expect((s1.lookups - s0.lookups) / 4).toBeLessThanOrEqual(2.6);
    expect(running.requests - running.callbacks, "one frame at a time").toBeLessThanOrEqual(1);
    await page.locator('#replay [data-act="play"]').dispatchEvent("click");
    // the hold leaves one last frame already queued, and a loaded machine draws it late: rest is measured once it has landed
    await untilStill(page);
    const paused = await bounded(page, 3000, "space");
    expect(paused.draws, "nothing drawn while paused").toBe(0);
    expect(paused.frames).toBe(0);
    expect(paused.requests, "no frame asked for while paused").toBeLessThanOrEqual(1);
  });
});

test.describe("the realistic Earth's clock", () => {
  test.use({ reducedMotion: "no-preference" });

  const clock = (page: Page) => page.locator("chikyu-earth-realistic").evaluate((el) => ({ time: Reflect.get(el, "time") as number | "now", speed: Reflect.get(el, "speed") as number }));

  test("Play at a day a second draws at most thirty frames a second, one frame at a time, and Pause leaves nothing drawn", async ({ page }) => {
    await open(page, "realistic");
    await page.locator("kazoku-view-controls").evaluate((el) => (el as HTMLElement & { pause(): void }).pause());
    await page.locator('#replay button[data-v="86400"]').dispatchEvent("click");
    await page.locator('#replay [data-act="play"]').dispatchEvent("click");
    await page.waitForTimeout(1500);
    const running = await bounded(page, 4000, "realistic");
    expect(running.frames, "frames drawn while it runs").toBeGreaterThan(5);
    expect(running.frames).toBeLessThanOrEqual(4 * 31);
    expect(running.requests - running.callbacks, "one frame at a time").toBeLessThanOrEqual(1);
    expect((await clock(page)).speed).toBe(86_400);
    await page.locator('#replay [data-act="play"]').dispatchEvent("click");
    await untilStill(page);
    const held = await clock(page);
    const paused = await bounded(page, 3000, "realistic");
    expect(paused.draws, "nothing drawn while paused").toBe(0);
    expect(paused.frames).toBe(0);
    expect(paused.requests, "no frame asked for while paused").toBeLessThanOrEqual(1);
    expect((await clock(page)).time, "and the moment does not move").toBe(held.time);
  });

  test("playing, it draws nothing out of sight or in a hidden tab", async ({ page }) => {
    await open(page, "realistic");
    await page.locator("kazoku-view-controls").evaluate((el) => (el as HTMLElement & { pause(): void }).pause());
    await page.locator('#replay button[data-v="86400"]').dispatchEvent("click");
    await page.locator('#replay [data-act="play"]').dispatchEvent("click");
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const spacer = document.createElement("div");
      spacer.style.height = "6000px";
      document.body.prepend(spacer);
      window.scrollTo(0, 0);
      document.querySelector("#globe")!.scrollIntoView = () => undefined;
    });
    await expect.poll(async () => page.locator("chikyu-earth-realistic").evaluate((el) => el.getBoundingClientRect().top)).toBeGreaterThan(1000);
    await page.waitForTimeout(800);
    const away = await bounded(page, 2500, "realistic");
    expect(away.draws, "no GL draws out of sight while the clock runs").toBe(0);
    expect(away.frames).toBe(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(500);
    const hidden = await bounded(page, 2500, "realistic");
    expect(hidden.draws, "no GL draws in a hidden tab while the clock runs").toBe(0);
    expect(hidden.frames).toBe(0);
  });
});

test.describe("meteors on the realistic Earth", () => {
  test.use({ reducedMotion: "no-preference" });

  const meteors = (page: Page) => page.locator("chikyu-earth-realistic").evaluate((el) => (Reflect.get(el, "stats") as { meteors: { alive: number; spawned: number } }).meteors);
  /** The Geminids' maximum over North America at night, the clock running a minute a second: about nine streaks a second, the most there are. */
  const openMeteors = async (page: Page): Promise<void> => {
    await page.addInitScript(COUNT_SCRIPT);
    await page.goto("/chikyu-earth/?look=realistic&time=2026-12-14T08:00Z&center=-100,30&speed=60&meteors=on");
    await page.locator("chikyu-earth-realistic[data-state=live]").waitFor({ timeout: 60_000 });
    await page.locator("kazoku-view-controls").evaluate((el) => (el as HTMLElement & { pause(): void }).pause());
    await expect.poll(async () => (await meteors(page)).spawned, { timeout: 20_000 }).toBeGreaterThan(3);
  };

  test("with streaks falling it draws at most thirty frames a second, one frame at a time, and holding the clock leaves nothing drawn and no streak alive", async ({ page }) => {
    await openMeteors(page);
    const running = await bounded(page, 4000, "realistic");
    expect(running.frames, "frames drawn while streaks fall").toBeGreaterThan(5);
    expect(running.frames).toBeLessThanOrEqual(4 * 31);
    expect(running.requests - running.callbacks, "one frame at a time").toBeLessThanOrEqual(1);
    await page.locator("chikyu-earth-realistic").evaluate((el) => el.setAttribute("speed", "0"));
    await untilStill(page);
    expect((await meteors(page)).alive, "no streak is left hanging").toBe(0);
    const held = await meteors(page);
    const paused = await bounded(page, 3000, "realistic");
    expect(paused.draws, "nothing drawn while the clock is held").toBe(0);
    expect(paused.frames).toBe(0);
    expect(paused.requests, "no frame asked for while held").toBeLessThanOrEqual(1);
    expect((await meteors(page)).spawned, "and no streak starts").toBe(held.spawned);
  });

  test("streaks falling, it draws nothing out of sight or in a hidden tab, and starts none there", async ({ page }) => {
    await openMeteors(page);
    await page.evaluate(() => {
      const spacer = document.createElement("div");
      spacer.style.height = "6000px";
      document.body.prepend(spacer);
      window.scrollTo(0, 0);
      document.querySelector("#globe")!.scrollIntoView = () => undefined;
    });
    await expect.poll(async () => page.locator("chikyu-earth-realistic").evaluate((el) => el.getBoundingClientRect().top)).toBeGreaterThan(1000);
    await page.waitForTimeout(2000);
    const before = await meteors(page);
    const away = await bounded(page, 2500, "realistic");
    expect(away.draws, "no GL draws out of sight").toBe(0);
    expect(away.frames).toBe(0);
    expect((await meteors(page)).spawned, "no streak starts out of sight").toBe(before.spawned);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(2000);
    const hidden = await bounded(page, 2500, "realistic");
    expect(hidden.draws, "no GL draws in a hidden tab").toBe(0);
    expect(hidden.frames).toBe(0);
  });

  test("in the space view too: streaks falling, at most thirty frames a second, one frame at a time, and holding the clock leaves nothing drawn", async ({ page }) => {
    const spaceMeteors = () => page.locator("chikyu-space").evaluate((el) => (Reflect.get(el, "stats") as { meteors: { alive: number; spawned: number } }).meteors);
    await page.addInitScript(COUNT_SCRIPT);
    await page.goto("/chikyu-earth/?look=space&time=2026-12-14T08:00Z&center=-100,30&speed=60&meteors=on");
    await page.locator("chikyu-space[data-state=live]").waitFor({ timeout: 60_000 });
    await page.locator("kazoku-view-controls").evaluate((el) => (el as HTMLElement & { pause(): void }).pause());
    await expect.poll(async () => (await spaceMeteors()).spawned, { timeout: 20_000 }).toBeGreaterThan(3);
    const running = await bounded(page, 4000, "space");
    expect(running.frames, "frames drawn while streaks fall").toBeGreaterThan(5);
    expect(running.frames).toBeLessThanOrEqual(4 * 31);
    expect(running.requests - running.callbacks, "one frame at a time").toBeLessThanOrEqual(1);
    await page.locator("chikyu-space").evaluate((el) => el.setAttribute("speed", "0"));
    await untilStill(page);
    expect((await spaceMeteors()).alive, "no streak is left hanging").toBe(0);
    const paused = await bounded(page, 3000, "space");
    expect(paused.draws, "nothing drawn while the clock is held").toBe(0);
    expect(paused.frames).toBe(0);
  });

  test("switching meteors on and off over and over gives back what it took: GPU objects stay flat", async ({ page }) => {
    await openMeteors(page);
    // the layer is made by the first switch-on, so the count is taken with it there
    const first = gpuObjects(await readCounts(page));
    for (let i = 0; i < 6; i += 1) {
      await page.locator("#meteors").click();
      await page.waitForTimeout(400);
    }
    await expect.poll(async () => (await meteors(page)).spawned, { timeout: 20_000 }).toBeGreaterThan(3);
    await page.waitForTimeout(1500);
    expect(gpuObjects(await readCounts(page)), "live GPU objects after six switches").toBeLessThanOrEqual(first);
  });
});

test("a thousand places, handed over and taken away over and over: one draw call for them, nothing drawn at rest, and GPU objects stay flat", async ({ page }) => {
  test.setTimeout(150_000);
  await open(page, "space");
  const space = page.locator("chikyu-space");
  let seed = 863;
  const random = (): number => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const many = Array.from({ length: 1000 }, (_, i) => ({ id: `p${i}`, lon: random() * 360 - 180, lat: (Math.asin(random() * 2 - 1) * 180) / Math.PI, label: `Place ${i}`, ...(i % 4 === 0 ? { color: "#7dd3fc" } : {}) }));
  const places = () => space.evaluate((el) => (Reflect.get(el, "stats") as { places: { places: number; sprites: number } }).places);
  const hand = (list: unknown[]) => space.evaluate((el, value) => void Reflect.set(el, "places", value), list);
  const settled: number[] = [];
  for (let round = 0; round < 5; round += 1) {
    await hand(many);
    await expect.poll(async () => (await places()).sprites, { timeout: 20_000 }).toBeGreaterThan(20);
    await untilStill(page);
    const rest = await bounded(page, 2000, "space");
    expect(rest.draws, "nothing drawn at rest with a thousand places").toBe(0);
    expect(rest.frames).toBe(0);
    settled.push(gpuObjects(await readCounts(page)));
    await hand([]);
    await expect.poll(async () => (await places()).places).toBe(0);
    await untilStill(page);
  }
  console.log(`live GPU objects with a thousand places, after each round: ${settled.join(", ")}`);
  expect(Math.max(...settled.slice(1)), "no more GPU objects after five rounds than after the second").toBeLessThanOrEqual(settled[1]!);
  expect((await readCounts(page)).contexts, "one WebGL context").toBe(1);
});

// Names of oceans, seas and continents (MODULES-1230): off by default they make nothing, and on they are DOM laid out with the frame the view already drew, so a view at rest draws nothing and asks for nothing.
for (const look of ["realistic", "space"] as const) {
  test(`the ${look} look names oceans, seas and continents: off it makes nothing, on it leaves nothing drawn at rest`, async ({ page }) => {
    await open(page, look);
    const element = page.locator(ELEMENT[look]);
    const names = () => element.evaluate((el) => (Reflect.get(el, "stats") as { seaNames: { on: boolean; radius: number; names: number; renders: number } }).seaNames);
    expect(await names(), "off unless asked for").toMatchObject({ on: false, names: 0, renders: 0 });
    expect(await element.evaluate((el) => el.shadowRoot?.querySelector("#sea-names") !== null), "no box made while off").toBe(false);
    await element.evaluate((el) => el.setAttribute("sea-names", ""));
    for (const zoom of [1, 0.8, 0.6, 0.45]) {
      await element.evaluate((el, z) => (el as unknown as { setView(v: unknown, final: boolean): void }).setView({ yaw: 0, tilt: 0, zoom: z, panX: 0, panY: 0 }, true), zoom);
      const { radius } = await names();
      if (radius > 0 && radius < SEA_RADIUS) break;
    }
    await expect.poll(async () => (await names()).names, { timeout: 20_000, message: "a wide view names the oceans and continents" }).toBeGreaterThan(0);
    await untilStill(page);
    const rest = await bounded(page, 3000, look);
    expect(rest.draws, "nothing drawn at rest with the names on").toBe(0);
    expect(rest.frames).toBe(0);
    expect(rest.requests).toBeLessThanOrEqual(2);
    const laidOut = (await names()).renders;
    await page.waitForTimeout(2000);
    expect((await names()).renders, "the names are not laid out again at rest").toBe(laidOut);
  });
}

test("twenty hovers add no GPU objects, and a still pointer draws nothing", async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, "satellites");
  await untilStill(page);
  const cold = gpuObjects(await readCounts(page));
  const spots = await page.locator("chikyu-space").evaluate((el) => {
    const space = el as unknown as { satelliteGroups: { name: string; count: number }[]; placeSatellite(ref: { group: string; index: number }): { x: number; y: number; visible: boolean } | null };
    const rect = el.getBoundingClientRect();
    const count = space.satelliteGroups.find((group) => group.name === "stations")?.count ?? 0;
    const found: { x: number; y: number }[] = [];
    for (let index = 0; index < count; index += 1) {
      const at = space.placeSatellite({ group: "stations", index });
      if (at?.visible) found.push({ x: rect.left + at.x, y: rect.top + at.y });
    }
    return found;
  });
  expect(spots.length, "stations are on the screen").toBeGreaterThan(0);
  const pointAt = async (index: number): Promise<void> => {
    const at = spots[index % spots.length]!;
    await page.locator("chikyu-space").dispatchEvent("pointermove", { clientX: at.x, clientY: at.y, pointerType: "mouse", bubbles: true });
  };
  await pointAt(0);
  await expect.poll(async () => page.locator("chikyu-space").evaluate((el) => (Reflect.get(el, "stats") as { satellites: { hoverPath: boolean } }).satellites.hoverPath), { timeout: 20_000 }).toBe(true);
  const held = gpuObjects(await readCounts(page));
  expect(held - cold, "the faint orbit is one line").toBeLessThanOrEqual(4);
  for (let i = 0; i < 20; i += 1) await pointAt(i);
  await expect.poll(async () => page.locator("chikyu-space").evaluate((el) => (Reflect.get(el, "stats") as { satellites: { hoverPath: boolean } }).satellites.hoverPath)).toBe(true);
  expect(gpuObjects(await readCounts(page)), "twenty hovers reuse the one line").toBe(held);
  await page.locator("chikyu-space").dispatchEvent("pointerleave");
  await untilStill(page);
  const rest = await bounded(page, 1500, "satellites");
  expect(rest.draws, "a still pointer, and none under it, draws nothing").toBe(0);
  expect(rest.frames).toBe(0);
  expect(gpuObjects(await readCounts(page)), "letting the orbit go does not leave a trail of objects").toBeLessThanOrEqual(held);
});
