// Satellites in the space view, in a real browser: where they are, that a press on one says so, the phone budget at real time, and the buffers and the painted trail. The 6,000 at 60 times real time are in satellites-moving.gl.ts.
import { expect, test, type Page } from "@playwright/test";
import { eciToGeodetic, gstime, json2satrec, sgp4 } from "satellite.js";
import { readFileSync } from "node:fs";
import { alive, counts, ownClock, settle, steppingOnly, untilArrived } from "./gl.ts";
import { routeElements } from "./recorded.ts";
import { SPACE, T, addMany, drawnSince, measure, open, removeGroups, setSpeed, statsOf } from "./satellites-common.ts";

test.beforeEach(({ page }) => routeElements(page));

test.describe.configure({ mode: "serial" });

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
  // the bodies the view shows are made after the draw that showed them, and each picture that arrives is a draw of its own: rest is after the last (MODULES-1192)
  await untilArrived(page);
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

// MODULES-1448: real time is drawn each time the quickest thing has moved half a pixel, 1 to 15 a second. What that costs on a phone: 16,000 satellites, the CPU slowed to a quarter, a phone's screen.
test.describe("on a phone with the CPU slowed to a quarter", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: "no-preference" });

  /** The JavaScript a frame took over a stretch, from the page's own running totals (the average it reports is for the whole life of the page), with the frames a second and SGP4 calls a second of the stretch. */
  async function cost(page: Page, ms: number) {
    const before = (await statsOf(page)).satellites;
    const run = await measure(page, ms);
    const after = run.stats.satellites;
    const frames = after.updates - before.updates;
    return { run, frames: run.frames, perFrameMs: frames > 0 ? (after.averageUpdateMs * after.updates - before.averageUpdateMs * before.updates) / frames : 0, maxUpdateMs: after.maxUpdateMs, propagations: run.propagations, maxBatchMs: run.maxBatchMs };
  }
  const fmt = (c: Awaited<ReturnType<typeof cost>>): string => `${c.frames.toFixed(2)} frames a second, ${c.perFrameMs.toFixed(2)} ms of JavaScript a frame (the longest ${c.maxUpdateMs.toFixed(1)}), ${c.propagations.toFixed(0)} SGP4 calls a second, the longest batch ${c.maxBatchMs.toFixed(1)} ms`;
  const paceOf = (page: Page) => page.locator(SPACE).evaluate((el) => (Reflect.get(el, "stats") as { pace: { pixelsPerSecond: number; perSecond: number; cap: number } }).pace);
  /** Real time, from the page's own controls held so that what is counted is the clock's. */
  async function goRealTime(page: Page, query: string): Promise<void> {
    await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await open(page, query, "stations,starlink");
    await addMany(page, 16_000);
    await expect.poll(async () => (await statsOf(page)).satellites.groups, { timeout: 60_000 }).toBe(3);
    await page.locator("kazoku-view-controls").evaluate((el) => (el as HTMLElement & { pause(): void }).pause());
    await setSpeed(page, 1);
    await settle(page, 3000);
  }

  test("16,000 satellites at real time, whole Earth and zoomed in: near once a second, within the cap, and what a frame costs", async ({ page }) => {
    test.setTimeout(180_000);
    await goRealTime(page, "&earth-size=0.9");
    const whole = await cost(page, 8000);
    const wholePace = await paceOf(page);
    await page.locator(SPACE).evaluate((el) => (el as unknown as { setView(v: unknown, f: boolean): void }).setView({ yaw: 0, tilt: 0, zoom: 2.5, panX: 0, panY: 0 }, true));
    await settle(page, 3000);
    const near = await cost(page, 8000);
    console.log(`16,000 + 2,252 satellites at real time on a phone, CPU 4x slower: whole Earth ${fmt(whole)} ${JSON.stringify(wholePace)}; zoomed in ${fmt(near)} ${JSON.stringify(await paceOf(page))}`);
    expect(whole.frames, "whole Earth").toBeLessThanOrEqual(2.4);
    expect(whole.frames, "whole Earth").toBeGreaterThanOrEqual(0.7);
    expect(near.frames, "zoomed in").toBeLessThanOrEqual(15 + 1);
    expect(near.frames, "zoomed in").toBeGreaterThanOrEqual(0.7);
    expect(whole.perFrameMs, "JavaScript a frame").toBeLessThan(1000 / 15);
    // SGP4 about once a second for each satellite, whatever the frame rate
    expect(whole.propagations, "SGP4 calls a second").toBeLessThanOrEqual((16_000 + 2252) * 1.6);
  });

  test("16,000 satellites at real time riding the ISS: frames rise towards the cap and the JavaScript of a frame fits it", async ({ page }) => {
    test.setTimeout(180_000);
    await goRealTime(page, "&earth-size=0.9&ride=iss");
    const riding = await cost(page, 8000);
    console.log(`16,000 + 2,252 satellites at real time riding the ISS on a phone, CPU 4x slower: ${fmt(riding)} ${JSON.stringify(await paceOf(page))}`);
    expect(riding.frames, "riding").toBeGreaterThan(2);
    expect(riding.frames, "riding").toBeLessThanOrEqual(15 + 1);
    expect(riding.perFrameMs, "JavaScript a frame").toBeLessThan(1000 / 15);
    expect(riding.propagations, "SGP4 calls a second").toBeLessThanOrEqual((16_000 + 2252) * 1.6);
  });
});


test("taking a group away frees its buffers, and a lost context is recovered with the satellites back", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page, "", "stations,starlink");
  const base = alive(await counts(page), "Buffer");
  await drawnSince(page, await addMany(page, 3000));
  expect(alive(await counts(page), "Buffer")).toBeGreaterThan(base);
  await drawnSince(page, await removeGroups(page, "many"));
  expect(alive(await counts(page), "Buffer"), "the group's buffer is freed").toBe(base);
  const programs = alive(await counts(page), "Program");
  await drawnSince(page, await removeGroups(page, "starlink", "stations"));
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
