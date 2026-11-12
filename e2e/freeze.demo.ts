// The demo must never ask a lot of the machine (the family's rule: no 3D release without a freeze test). Played in headless Chromium, drawing in software, these fail on: more than
// one animation frame asked for at a time, a draw when nothing moves or the view is out of sight or the tab is hidden, live WebGL objects that grow over a run of look changes, and a
// canvas past 6 million pixels or 4096 a side on a 5K screen at a pixel ratio of 2. `pnpm test:freeze` runs it; CI and the release run it.
import { canvasSize, COUNT_SCRIPT, gpuObjects, readCounts, withinPixelBudget } from "@johnmorrisdotca/kazoku-ui/testing";
import { expect, test, type Page } from "@playwright/test";
import { DOWNGRADE_AFTER_MS } from "../src/realistic/textures.ts";
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

test.describe("the full-screen space view (fullscreen.html?look=space), with the planets' pictures", () => {
  const openFull = async (page: Page): Promise<void> => {
    await page.addInitScript(COUNT_SCRIPT);
    await page.goto(`/chikyu-earth/fullscreen.html?look=space&time=${NOON}&speed=0`);
    await page.locator("chikyu-space[data-state=live]").waitFor({ timeout: 60_000 });
    await expect.poll(async () => page.locator("chikyu-space").evaluate((el) => (Reflect.get(el, "stats") as { bodies: { painted: number } }).bodies.painted), { timeout: 30_000 }).toBe(9);
    await expect.poll(async () => (await readCounts(page)).draws).toBeGreaterThan(0);
    await page.waitForTimeout(1500);
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
    // The view opens where the address left the last ride (the ISS or the Moon) and draws there. Let it be at rest there before it is sent on, as a reader would see it: a view that
    // opened at the ISS has drawn the Earth from its larger pictures, and keeps what three.js made for that (8 objects) while it lives. Sent on before its first frame, it never drew the
    // Earth large and held 8 fewer (106 against 114), so a round's count depended on whether the page or the click came first.
    await atRest(page);
    // the camera on the ISS and off it again, as a reader would
    await page.getByRole("group", { name: "Ride along" }).getByRole("button", { name: round % 2 === 0 ? "ISS" : "Moon", exact: true }).dispatchEvent("click");
    // the satellites are drawn at least once (their buffers are made by the first draw), and what the last place needed is let go, before the objects are counted
    await atRest(page);
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
