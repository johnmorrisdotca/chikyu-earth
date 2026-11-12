// Satellites in the space view, in a real browser: where they are, that a press on one says so, and the same performance budget as everything else, at 6,000 of them.
import { expect, test, type Page } from "@playwright/test";
import { eciToGeodetic, gstime, json2satrec, sgp4 } from "satellite.js";
import { readFileSync } from "node:fs";
import { COUNT_SCRIPT, alive, counts, ownClock, settle, steppingOnly, timed } from "./gl.ts";
import { routeElements } from "./recorded.ts";

test.beforeEach(({ page }) => routeElements(page));

test.describe.configure({ mode: "serial" });

const SPACE = "chikyu-space";
const T = "2026-11-02T18:00Z";
interface Stats {
  state: string;
  draws: number;
  contexts: number;
  canvas: { width: number; height: number; pixels: number };
  time: number;
  satellites: { groups: number; placed: number; segments: number; tooFast: boolean; dotScale: number; epochMs: number; propagations: number; lastBatchMs: number; maxBatchMs: number; updateMs: number; maxUpdateMs: number; averageUpdateMs: number; updates: number };
}
const statsOf = (page: Page): Promise<Stats> => page.locator(SPACE).evaluate((el) => Reflect.get(el, "stats") as Stats);

async function open(page: Page, query = "", groups = "stations"): Promise<void> {
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/?look=space&time=${T}&speed=0&center=-100,40&sats=${groups}${query}`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  const wanted = groups.split(",").filter(Boolean).length;
  await expect.poll(async () => (await statsOf(page)).satellites.groups, { timeout: 20_000 }).toBe(wanted);
  await expect.poll(async () => (await statsOf(page)).draws).toBeGreaterThan(0);
  await settle(page);
}

/** A group of this many satellites made from the real Starlink ones, spread round their orbits (test only), shown under the name "many". */
const addMany = (page: Page, count = 6000): Promise<void> =>
  page.evaluate((n) => {
    const tools = Reflect.get(window, "chikyuSatellites") as { createSatellites(sets: unknown[], options?: unknown): unknown; groups: Map<string, { sets: Record<string, number | string>[] }> };
    const base = tools.groups.get("starlink")!.sets;
    const sets = Array.from({ length: n }, (_, i) => ({ ...base[i % base.length]!, NORAD_CAT_ID: 100_000 + i, MEAN_ANOMALY: ((base[i % base.length]!["MEAN_ANOMALY"] as number) + i * 0.37) % 360, RA_OF_ASC_NODE: ((base[i % base.length]!["RA_OF_ASC_NODE"] as number) + i * 0.11) % 360 }));
    const el = document.querySelector("chikyu-space") as unknown as { setSatellites(name: string, group: unknown, style?: unknown): void };
    el.setSatellites("many", tools.createSatellites(sets), { size: 2, color: "#7fd4ff" });
  }, count);

const setSpeed = async (page: Page, speed: number): Promise<void> => {
  await page.locator(SPACE).evaluate((el, value) => Reflect.set(el, "speed", value), speed);
};

/** What a stretch of time cost: frames drawn, GL draw calls, animation frames asked for, SGP4 calls, JS time in the satellites. */
async function measure(page: Page, ms: number) {
  const { before, after, seconds } = await timed(page, ms, async () => ({ c: await counts(page), s: await statsOf(page) }));
  const [c0, c1, s0, s1] = [before.c, after.c, before.s, after.s];
  return {
    seconds,
    frames: (s1.draws - s0.draws) / seconds,
    glDraws: c1.draws - c0.draws,
    glPerFrame: (c1.draws - c0.draws) / Math.max(1, s1.draws - s0.draws),
    requests: c1.rafRequests - c0.rafRequests,
    propagations: (s1.satellites.propagations - s0.satellites.propagations) / seconds,
    updates: s1.satellites.updates - s0.satellites.updates,
    averageUpdateMs: s1.satellites.averageUpdateMs,
    maxBatchMs: s1.satellites.maxBatchMs,
    gameSeconds: (s1.time - s0.time) / 1000 / seconds,
    stats: s1,
  };
}

// The ISS over the middle of the view: the view is centred on the ground point under the ISS at 18:00 UTC, worked out here with satellite.js, so the ISS must be drawn in the middle of the Earth's disc.
const snapshot = JSON.parse(readFileSync(new URL("../test/recorded/celestrak-snapshot-2026-11-02.json", import.meta.url), "utf8")) as { fields: string[]; groups: Record<string, (string | number)[][]> };
const issRow = snapshot.groups["stations"]!.find((row) => row[0] === 25544)!;
const issSet = Object.fromEntries(snapshot.fields.map((field, index) => [field, issRow[index]]));
function issSubpoint(ms: number): { lon: number; lat: number } {
  const rec = json2satrec(issSet as never);
  const p = sgp4(rec, (ms - Date.parse(`${issSet["EPOCH"]}Z`)) / 60_000)!;
  const geo = eciToGeodetic(p.position as never, gstime(new Date(ms)));
  // the scene is a sphere, so its latitude is geocentric: from the position itself
  const pos = p.position as { x: number; y: number; z: number };
  return { lon: (geo.longitude * 180) / Math.PI, lat: (Math.asin(pos.z / Math.hypot(pos.x, pos.y, pos.z)) * 180) / Math.PI };
}

test("the ISS is drawn over the ground it is over: the view centred under it shows it in the middle, and pressing it names it", async ({ page }) => {
  const under = issSubpoint(Date.parse(T));
  await open(page, "", "stations");
  await page.locator(SPACE).evaluate((el, centre) => Reflect.set(el, "centre", centre), under);
  // dispatched, not clicked: a real click scrolls the page to the button, and a globe scrolled out of sight is (rightly) not drawn
  await page.getByRole("group", { name: "Find" }).getByRole("button", { name: "ISS", exact: true }).dispatchEvent("click");
  await expect.poll(() => page.locator(SPACE).evaluate((el) => el.shadowRoot!.querySelector(".sp-sat:not([hidden])") !== null), { timeout: 20_000 }).toBe(true);
  await settle(page, 400);
  const place = await page.locator(SPACE).evaluate((el) => {
    const label = el.shadowRoot!.querySelector(".sp-sat:not([hidden])") as HTMLElement;
    const box = el.getBoundingClientRect();
    const m = /translate\((-?\d+)px,\s*(-?\d+)px\)/.exec(label.style.transform)!;
    return { x: Number(m[1]) - 10, y: Number(m[2]) + 8, width: box.width, height: box.height, text: label.textContent };
  });
  expect(place.text).toContain("ISS");
  expect(Math.abs(place.x - place.width / 2), "across").toBeLessThanOrEqual(3);
  expect(Math.abs(place.y - place.height / 2), "down").toBeLessThanOrEqual(3);
  await expect(page.locator("#sat-info")).toContainText("ISS (ZARYA)");
  await expect(page.locator("#sat-info")).toContainText("km up");

  // a press on it, with nothing chosen, fires the event with the satellite's group and place
  await page.evaluate(() => (document.querySelector("chikyu-space") as unknown as { selectSatellite(r: null): void }).selectSatellite(null));
  await page.evaluate(() => {
    Reflect.set(window, "__clicks", []);
    document.querySelector("chikyu-space")!.addEventListener("chikyu-satellite-click", (e) => (Reflect.get(window, "__clicks") as unknown[]).push((e as CustomEvent).detail));
  });
  await page.locator(SPACE).scrollIntoViewIfNeeded();
  const box = (await page.locator(SPACE).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2 + 3, box.y + box.height / 2 + 2);
  await expect.poll(() => page.evaluate(() => (Reflect.get(window, "__clicks") as unknown[]).length)).toBe(1);
  const detail = await page.evaluate(() => (Reflect.get(window, "__clicks") as { group: string; index: number; info: { name: string; noradId: number; altitudeKm: number } }[])[0]!);
  expect(detail.group).toBe("stations");
  // CelesTrak lists the modules and visiting craft that are docked to the ISS as objects of their own, in the same place: any of them may be the one nearest the press
  expect(detail.info.name).toMatch(/ISS|POISK|NAUKA|PROGRESS|SOYUZ|DRAGON|ZARYA|ZVEZDA|FREGAT|PIRS|CYGNUS/i);
  expect(detail.info.altitudeKm).toBeGreaterThan(380);
  expect(detail.info.altitudeKm).toBeLessThan(470);
});

test("a satellite behind the Earth cannot be pressed", async ({ page }) => {
  const under = issSubpoint(Date.parse(T));
  await open(page, "", "stations");
  await page.locator(SPACE).evaluate((el, centre) => Reflect.set(el, "centre", centre), { lon: under.lon + 180, lat: -under.lat });
  await settle(page, 500);
  await page.evaluate(() => {
    Reflect.set(window, "__clicks", 0);
    document.querySelector("chikyu-space")!.addEventListener("chikyu-satellite-click", () => Reflect.set(window, "__clicks", (Reflect.get(window, "__clicks") as number) + 1));
  });
  const box = (await page.locator(SPACE).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => Reflect.get(window, "__clicks"))).toBe(0);
});

test("paused with 6,000 satellites on: nothing is drawn, no frame asked for, no SGP4", async ({ page }) => {
  await open(page, "", "stations,starlink");
  await addMany(page);
  await settle(page, 800);
  const s0 = await statsOf(page);
  const rest = await measure(page, 3500);
  console.log(`6,000 satellites paused: ${rest.glDraws} GL draw calls, ${rest.requests} frames asked for, ${rest.propagations.toFixed(0)} SGP4 calls a second; the first batch took ${s0.satellites.maxBatchMs.toFixed(1)} ms`);
  expect(rest.glDraws).toBe(0);
  expect(rest.requests).toBe(0);
  expect(rest.propagations).toBe(0);
});

test("at real time a group on show draws once a second and runs SGP4 once a second, not once a frame", async ({ page }) => {
  await ownClock(page);
  await open(page, "", "stations,starlink");
  await steppingOnly(page, () => setSpeed(page, 0), () => setSpeed(page, 1), async () => (await statsOf(page)).draws);
  const m = await measure(page, 6000);
  console.log(`real time with satellites: ${m.frames.toFixed(2)} frames a second, ${m.propagations.toFixed(0)} SGP4 calls a second for 2,252 satellites`);
  expect(m.frames).toBeLessThanOrEqual(1.6);
  expect(m.frames).toBeGreaterThan(0.5);
  expect(m.propagations).toBeLessThanOrEqual(2252 * 1.6);
});

test.describe("moving", () => {
  test.use({ reducedMotion: "no-preference" });
  test("6,000 satellites at 60 times real time: at most 30 frames a second, one SGP4 batch a second, one extra draw call", async ({ page }) => {
    // about 15 s of its own in CI and, in `measure`, the wait for the software GPU to draw the frames the page's own clock asked for (22 to 37 s after the ride test in CI)
    test.setTimeout(90_000);
    await ownClock(page);
    await open(page, "", "stations,starlink");
    const before = await measure(page, 100);
    await setSpeed(page, 60);
    await settle(page, 600);
    const base = await measure(page, 3000);
    await addMany(page);
    await settle(page, 1500);
    const many = await measure(page, 6000);
    console.log(
      `6,000 satellites at 60x: ${many.gameSeconds.toFixed(1)}x, ${many.frames.toFixed(1)} frames a second, ${many.glPerFrame.toFixed(1)} GL draw calls a frame (${base.glPerFrame.toFixed(1)} without them), ${many.propagations.toFixed(0)} SGP4 calls a second, ` +
        `${many.stats.satellites.averageUpdateMs.toFixed(2)} ms of JavaScript a frame on average (the longest ${many.stats.satellites.maxUpdateMs.toFixed(1)}), the longest SGP4 batch ${many.stats.satellites.maxBatchMs.toFixed(1)} ms`,
    );
    expect(before.stats.state).toBe("live");
    expect(many.gameSeconds).toBeGreaterThan(45);
    expect(many.frames).toBeLessThanOrEqual(31);
    expect(many.frames).toBeGreaterThan(5);
    // one draw call for the group (and the odd frame that draws a chosen satellite or an orbit): not 6,000
    expect(many.glPerFrame - base.glPerFrame, "a draw call or two more a frame for 6,000 satellites").toBeLessThanOrEqual(2.5);
    // SGP4: the step is 60 game seconds = one wall second at 60x, so the 2,252 + 6,000 satellites cost about once each a second
    const all = 2252 + 6000;
    expect(many.propagations, "SGP4 calls a second").toBeLessThanOrEqual(all * 1.5);
    expect(many.propagations).toBeGreaterThan(all * 0.5);
    expect(many.stats.canvas.pixels).toBeLessThanOrEqual(6_000_000);
    expect(many.stats.contexts).toBe(1);
  });

  // The page's own stopwatch, not the test's clock: what is measured here is how long the work takes.
  test("6,000 satellites at 60 times real time: a few milliseconds of JavaScript a frame, one SGP4 batch in well under a frame's worth of a second", async ({ page }) => {
    await open(page, "", "stations,starlink");
    await setSpeed(page, 60);
    await addMany(page);
    // the page counts its own work, so the test waits on that, never on a fixed time: SGP4 has gone over every satellite twice and 30 frames are drawn since the 6,000 came
    const all = 2252 + 6000;
    const start = (await statsOf(page)).satellites;
    await expect
      .poll(
        async () => {
          const now = (await statsOf(page)).satellites;
          return now.propagations - start.propagations >= 2 * all && now.updates - start.updates >= 30;
        },
        { timeout: 30_000, message: "two SGP4 passes over every satellite and 30 frames" },
      )
      .toBe(true);
    const { satellites } = await statsOf(page);
    expect(satellites.averageUpdateMs, "JavaScript a frame").toBeLessThan(4);
    expect(satellites.maxBatchMs, "one SGP4 batch").toBeLessThan(120);
  });

  test("faster than 60 times real time the satellites are streaks, one SGP4 batch a second, and the frame rate stays capped", async ({ page }) => {
    await open(page, "", "stations,starlink");
    await setSpeed(page, 3600);
    await settle(page, 1000);
    const m = await measure(page, 4000);
    console.log(`3600x with satellites: ${m.frames.toFixed(1)} frames a second, ${m.propagations.toFixed(0)} SGP4 calls a second, streaks ${m.stats.satellites.segments}, tooFast ${m.stats.satellites.tooFast}`);
    expect(m.stats.satellites.tooFast).toBe(true);
    expect(m.stats.satellites.placed).toBeGreaterThan(2000);
    expect(m.stats.satellites.segments, "one streak for each satellite drawn").toBe(m.stats.satellites.placed);
    expect(m.stats.satellites.epochMs).toBeGreaterThan(0);
    expect(m.propagations, "about one SGP4 sample a second, not one a frame").toBeGreaterThan(2000 * 0.4);
    expect(m.propagations).toBeLessThan(2000 * 3);
    expect(m.frames).toBeLessThanOrEqual(31);
    await setSpeed(page, 0);
    await page.locator(SPACE).evaluate((el) => Reflect.set(el, "time", Date.parse("2026-11-02T18:00:00Z")));
    await settle(page, 1500);
    const held = (await statsOf(page)).satellites;
    expect(held.tooFast).toBe(false);
    expect(held.segments, "a held clock draws dots, not streaks").toBe(0);
    expect(held.placed).toBeGreaterThan(2000);
  });

  test("orbit tint changes the colours, and the dot size follows the zoom", async ({ page }) => {
    await open(page, "", "stations");
    await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { pause(): void }).pause());
    const start = (await statsOf(page)).satellites.dotScale;
    expect(start).toBeGreaterThan(0);
    await page.locator(SPACE).evaluate((el) => (el as unknown as { setView(v: unknown, f: boolean): void }).setView({ yaw: 0, tilt: 0, zoom: 4, panX: 0, panY: 0 }, true));
    await expect.poll(async () => (await statsOf(page)).satellites.dotScale).toBeGreaterThan(start + 0.2);
    await page.locator(SPACE).evaluate((el) => (el as unknown as { setView(v: unknown, f: boolean): void }).setView({ yaw: 0, tilt: 0, zoom: 0.4, panX: 0, panY: 0 }, true));
    await expect.poll(async () => (await statsOf(page)).satellites.dotScale).toBeLessThan(start);
    expect(await page.locator(SPACE).evaluate((el) => Reflect.get(el, "satelliteTint"))).toBe("off");
    await page.locator(SPACE).evaluate((el) => Reflect.set(el, "satelliteTint", "orbit"));
    expect(await page.locator(SPACE).evaluate((el) => Reflect.get(el, "satelliteTint"))).toBe("orbit");
    expect(await page.locator(SPACE).evaluate((el) => el.getAttribute("satellite-tint"))).toBe("orbit");
  });


  test("out of sight or hidden, 6,000 satellites at 60x draw nothing", async ({ page }) => {
    await open(page, "", "stations,starlink");
    await addMany(page);
    await setSpeed(page, 60);
    await settle(page, 1000);
    await page.evaluate(() => {
      const spacer = document.createElement("div");
      spacer.style.height = "6000px";
      document.body.prepend(spacer);
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1200);
    const away = await measure(page, 2500);
    expect(away.glDraws, "no GL draws out of sight").toBe(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(600);
    const hidden = await measure(page, 2500);
    expect(hidden.glDraws, "no GL draws in a hidden tab").toBe(0);
  });

  test("at 60x the draws are capped at 30 a second; a reader who asked for reduced motion gets one step a second", async ({ page, browser }) => {
    await ownClock(page);
    await open(page, "", "stations,starlink");
    await setSpeed(page, 60);
    await settle(page, 800);
    const moving = await measure(page, 4000);
    console.log(`60x, no motion preference: ${moving.frames.toFixed(1)} frames a second`);
    expect(moving.frames).toBeGreaterThan(5);
    expect(moving.frames).toBeLessThanOrEqual(31);
    await page.close();

    const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 900 } });
    const reduced = await context.newPage();
    await ownClock(reduced);
    await open(reduced, "&speed=60", "stations,starlink");
    await steppingOnly(reduced, () => setSpeed(reduced, 0), () => setSpeed(reduced, 60), async () => (await statsOf(reduced)).draws);
    const stepping = await measure(reduced, 4000);
    console.log(`60x, reduced motion: ${stepping.frames.toFixed(2)} frames a second`);
    expect(stepping.frames).toBeLessThanOrEqual(1.6);
    expect(stepping.frames).toBeGreaterThan(0.5);
    await context.close();
  });
});

test("taking a group away frees its buffers, and a lost context is recovered with the satellites back", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page, "", "stations,starlink");
  const base = alive(await counts(page), "Buffer");
  await addMany(page, 3000);
  await settle(page, 800);
  expect(alive(await counts(page), "Buffer")).toBeGreaterThan(base);
  await page.locator(SPACE).evaluate((el) => (el as unknown as { setSatellites(n: string, g: null): void }).setSatellites("many", null));
  await settle(page, 800);
  expect(alive(await counts(page), "Buffer"), "the group's buffer is freed").toBe(base);
  const programs = alive(await counts(page), "Program");
  for (const name of ["starlink", "stations"]) await page.locator(SPACE).evaluate((el, group) => (el as unknown as { setSatellites(n: string, g: null): void }).setSatellites(group, null), name);
  await settle(page, 800);
  expect(alive(await counts(page), "Buffer"), "and all the others").toBeLessThan(base);
  expect(alive(await counts(page), "Program")).toBeLessThanOrEqual(programs);

  await open(page, "", "stations,starlink");
  const draws = (await statsOf(page)).draws;
  await page.locator(SPACE).evaluate((el) => {
    const ext = (el.shadowRoot!.querySelector("canvas")!.getContext("webgl2") as WebGL2RenderingContext).getExtension("WEBGL_lose_context")!;
    Reflect.set(window, "__lose", ext);
    ext.loseContext();
  });
  await expect(page.locator(SPACE)).toHaveAttribute("data-state", "lost");
  await page.evaluate(() => (Reflect.get(window, "__lose") as { restoreContext(): void }).restoreContext());
  await expect(page.locator(SPACE)).toHaveAttribute("data-state", "live");
  await page.locator(SPACE).evaluate((el) => Reflect.set(el, "scale", "true"));
  await expect.poll(async () => (await statsOf(page)).draws).toBeGreaterThan(draws);
  expect((await statsOf(page)).satellites.placed).toBeGreaterThan(2000);
  expect(errors).toEqual([]);
});

const paintPixels = (page: Page): Promise<number> => page.locator(SPACE).evaluate((el) => Reflect.get(el, "paintPixels") as number);

test("painting the ISS at an hour a second grows the trail, rest stops it, and Clear or another satellite empties it", async ({ page }) => {
  await open(page, "", "stations");
  await page.locator(SPACE).evaluate((el) => Reflect.set(el, "paint", { id: "25544", length: "1d" }));
  await expect.poll(() => paintPixels(page), { timeout: 20_000 }).toBeGreaterThan(10);
  const filled = await paintPixels(page);
  await setSpeed(page, 3600);
  await expect.poll(() => paintPixels(page), { timeout: 20_000 }).toBeGreaterThan(filled);
  const moving = await paintPixels(page);
  await setSpeed(page, 0);
  await settle(page);
  const held = await paintPixels(page);
  await page.waitForTimeout(1000);
  expect(await paintPixels(page)).toBe(held);
  await page.locator(SPACE).evaluate((el) => (el as unknown as { clearPaint(): void }).clearPaint());
  expect(await paintPixels(page)).toBe(0);
  const cleared = await page.locator(SPACE).evaluate((el) => {
    Reflect.set(el, "paint", { id: "stations:1", length: "1d" });
    return Reflect.get(el, "paintPixels") as number;
  });
  expect(cleared, "switching satellite clears the trail before the next frame").toBe(0);
  await setSpeed(page, 3600);
  await expect.poll(() => paintPixels(page), { timeout: 20_000 }).toBeGreaterThan(0);
  expect(moving).toBeGreaterThan(filled);
});

test("a view that paints nothing holds no picture of the trail: the first paint makes it, rest sends nothing, and Clear gives it back (MODULES-1188)", async ({ page }) => {
  // the pictures sent to the graphics card at the trail's size (1024 by 512), counted in the page
  await page.addInitScript(() => {
    const seen = window as unknown as { __paintUploads: number };
    seen.__paintUploads = 0;
    for (const Context of [WebGL2RenderingContext, WebGLRenderingContext]) {
      const proto = Context.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
      for (const name of ["texImage2D", "texSubImage2D"]) {
        const original = proto[name]!;
        proto[name] = function (this: unknown, ...args: unknown[]) {
          if (args.some((value, i) => value === 1024 && args[i + 1] === 512)) seen.__paintUploads += 1;
          return original.apply(this, args);
        };
      }
    }
  });
  const sent = (): Promise<number> => page.evaluate(() => (window as unknown as { __paintUploads: number }).__paintUploads);
  await open(page, "", "stations");
  await settle(page, 1000);
  expect(await sent(), "no trail picture is sent by a view that paints nothing").toBe(0);
  const base = alive(await counts(page), "Texture");
  await page.locator(SPACE).evaluate((el) => Reflect.set(el, "paint", { id: "25544", length: "1d" }));
  await expect.poll(() => paintPixels(page), { timeout: 20_000 }).toBeGreaterThan(10);
  await settle(page, 1000);
  expect(await sent(), "the picture is made and sent when the first satellite is painted").toBeGreaterThan(0);
  expect(alive(await counts(page), "Texture")).toBe(base + 1);
  const rest = await sent();
  await page.waitForTimeout(2500);
  expect(await sent(), "nothing is sent at rest").toBe(rest);
  await setSpeed(page, 3600);
  await settle(page, 1000);
  const run0 = { draws: (await statsOf(page)).draws, sent: await sent() };
  await page.waitForTimeout(3000);
  const run1 = { draws: (await statsOf(page)).draws, sent: await sent() };
  expect(run1.sent - run0.sent, "at most one picture a frame while time runs").toBeLessThanOrEqual(run1.draws - run0.draws + 1);
  await setSpeed(page, 0);
  await settle(page, 1500);
  const stopped = await sent();
  await page.waitForTimeout(2000);
  expect(await sent(), "nothing is sent once time stops").toBe(stopped);
  await page.locator(SPACE).evaluate((el) => (el as unknown as { clearPaint(): void }).clearPaint());
  await settle(page, 1500);
  expect(alive(await counts(page), "Texture"), "Clear gives the picture back").toBe(base);
});
