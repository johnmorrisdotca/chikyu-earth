// Satellites in the space view, in a real browser: where they are, that a press on one says so, and the same performance budget as everything else, at 6,000 of them.
import { expect, test, type Page } from "@playwright/test";
import { eciToGeodetic, gstime, json2satrec, sgp4 } from "satellite.js";
import { readFileSync } from "node:fs";
import { COUNT_SCRIPT, alive, counts, drainGpu, ownClock, settle, timed, untilStill } from "./gl.ts";
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
  satellites: { groups: number; placed: number; tooFast: boolean; heldAt: number | null; propagations: number; lastBatchMs: number; maxBatchMs: number; updateMs: number; maxUpdateMs: number; averageUpdateMs: number; updates: number };
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
  // rest is what the page reports: its draws and frame requests unchanged a second apart (a last frame already queued can land late on a busy machine)
  await untilStill(page);
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
  await setSpeed(page, 1);
  await settle(page, 1500);
  const m = await measure(page, 6000);
  console.log(`real time with satellites: ${m.frames.toFixed(2)} frames a second, ${m.propagations.toFixed(0)} SGP4 calls a second for 2,252 satellites`);
  expect(m.frames).toBeLessThanOrEqual(1.6);
  expect(m.frames).toBeGreaterThan(0.5);
  expect(m.propagations).toBeLessThanOrEqual(2252 * 1.6);
});

test.describe("moving", () => {
  test.use({ reducedMotion: "no-preference" });
  test("6,000 satellites at 60 times real time: at most 30 frames a second, one SGP4 batch a second, one extra draw call", async ({ page }) => {
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

  test("faster than 60 times real time the groups stay on screen, held where they were and placed again about once a second, the frame rate stays capped, and a line says so", async ({ page }) => {
    await open(page, "", "stations,starlink");
    const all = 2252;
    await setSpeed(page, 3600);
    // the page reports the groups held, every satellite placed, and a moment it placed them at
    await expect.poll(async () => { const s = (await statsOf(page)).satellites; return s.tooFast && s.heldAt !== null && s.placed > 2000; }, { timeout: 20_000 }).toBe(true);
    const first = (await statsOf(page)).satellites.heldAt!;
    // the next placing is at a later moment of the clock
    await expect.poll(async () => (await statsOf(page)).satellites.heldAt! > first, { timeout: 10_000 }).toBe(true);
    const m = await measure(page, 4000);
    console.log(`3600x with satellites: ${m.frames.toFixed(1)} frames a second, ${m.propagations.toFixed(0)} SGP4 calls a second, held ${m.stats.satellites.placed}`);
    expect(m.stats.satellites.placed, "the satellites are on screen").toBeGreaterThan(2000);
    expect(m.propagations, "about one SGP4 batch a second, as at real time").toBeLessThanOrEqual(all * 1.6);
    expect(m.propagations).toBeGreaterThan(all * 0.4);
    expect(m.frames).toBeLessThanOrEqual(31);
    const note = page.locator(SPACE).locator("#sat-note");
    await expect(note).toBeVisible();
    await expect(note).toContainText("too fast to follow");
    await setSpeed(page, 0);
    await page.locator(SPACE).evaluate((el) => Reflect.set(el, "time", Date.parse("2026-11-02T18:00:00Z")));
    await expect.poll(async () => (await statsOf(page)).satellites.tooFast).toBe(false);
    expect((await statsOf(page)).satellites.heldAt).toBeNull();
    expect((await statsOf(page)).satellites.placed).toBeGreaterThan(2000);
    await expect(note).toBeHidden();
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
    // the first view drew 30 frames a second of 6,000 satellites on the software GPU, which is behind by then: held, caught up and closed, so the second view does not wait for it (it took past 60 s on a runner, MODULES-897)
    await setSpeed(page, 0);
    console.log(`60x: the GPU took ${Math.round(await drainGpu(page))} ms to catch up`);
    await page.close();

    const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 900 } });
    const reduced = await context.newPage();
    await ownClock(reduced);
    await open(reduced, "&speed=60", "stations,starlink");
    await setSpeed(reduced, 60);
    await settle(reduced, 800);
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
  // each step waits for the page to draw it (its own count of draws and of GL buffers), never a fixed time: on a busy machine a draw can come later than any guess
  await addMany(page, 3000);
  await expect.poll(async () => alive(await counts(page), "Buffer"), { timeout: 20_000, message: "the new group's buffers once it is drawn" }).toBeGreaterThan(base);
  await page.locator(SPACE).evaluate((el) => (el as unknown as { setSatellites(n: string, g: null): void }).setSatellites("many", null));
  await expect.poll(async () => alive(await counts(page), "Buffer"), { timeout: 20_000, message: "the group's buffer is freed" }).toBe(base);
  const programs = alive(await counts(page), "Program");
  for (const name of ["starlink", "stations"]) await page.locator(SPACE).evaluate((el, group) => (el as unknown as { setSatellites(n: string, g: null): void }).setSatellites(group, null), name);
  await expect.poll(async () => alive(await counts(page), "Buffer"), { timeout: 20_000, message: "and all the others" }).toBeLessThan(base);
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

test("a dot over sunlit ground has a dark rim, a group can be coloured by orbit, and the page can read each group's count and the date of its data", async ({ page }) => {
  await open(page);
  const space = page.locator(SPACE);
  const groups = (await space.evaluate((el) => Reflect.get(el, "satelliteGroups"))) as { name: string; count: number; placed: number; newest: number | null }[];
  expect(groups[0]!.placed).toBeGreaterThan(10);
  expect(groups[0]!.placed).toBeLessThanOrEqual(groups[0]!.count);
  expect(Math.abs(groups[0]!.newest! - Date.parse(T)) / 86_400_000, "the newest elements are days from the moment shown").toBeLessThan(5);

  /** Restyle the stations, wait for the picture to be drawn with it, and read the picture once: every station that can be seen, with the light of its middle, its rim and the ground beside it. */
  const look = async (style: { color: string; size: number }) => {
    const before = (await statsOf(page)).draws;
    await space.evaluate((el, s) => {
      const made = (Reflect.get(globalThis, "chikyuSatellites") as { groups: Map<string, unknown> }).groups;
      (el as unknown as { setSatellites(name: string, group: unknown, style: unknown): void }).setSatellites("stations", made.get("stations"), s);
    }, style);
    await expect.poll(async () => (await statsOf(page)).draws).toBeGreaterThan(before);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const count = groups[0]!.count;
    const spots = (await space.evaluate((el, n) => {
      const out: { x: number; y: number }[] = [];
      for (let index = 0; index < n; index += 1) {
        const space = el as unknown as { placeSatellite(ref: unknown): { x: number; y: number; visible: boolean } | null; satelliteInfo(ref: unknown): { ageDays: number } | undefined };
        const at = space.placeSatellite({ group: "stations", index });
        // a satellite whose elements are more than 14 days from the moment shown is drawn dimmer on purpose: only the ones drawn at full strength are read
        const age = space.satelliteInfo({ group: "stations", index })?.ageDays ?? Infinity;
        if (at?.visible && Math.abs(age) < 14) out.push({ x: at.x, y: at.y });
      }
      return out;
    }, count)).filter((s, i, all) => s.x > 20 && s.y > 20 && all.every((o, j) => j === i || Math.hypot(o.x - s.x, o.y - s.y) > 30));
    const png = (await space.screenshot()).toString("base64");
    return page.evaluate(
      async ([data, list]) => {
        const img = new Image();
        img.src = `data:image/png;base64,${data}`;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        const at = (x: number, y: number) => Array.from(ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data);
        const light = (p: number[]) => 0.2126 * p[0]! + 0.7152 * p[1]! + 0.0722 * p[2]!;
        // the rim is the darkest point inside the dot's edge (4 to 6 pixels out of a 7 pixel radius) on four rays from its middle; the ground beside it is the brightest of the same rays 14 pixels out
        const rays = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        return (list as { x: number; y: number }[]).filter((s) => s.x < img.width - 20 && s.y < img.height - 20).map((s) => ({
          core: at(s.x, s.y),
          coreLight: light(at(s.x, s.y)),
          rim: Math.min(...rays.flatMap(([dx, dy]) => [4, 5, 6].map((r) => light(at(s.x + dx! * r, s.y + dy! * r))))),
          ground: Math.max(...rays.map(([dx, dy]) => light(at(s.x + dx! * 14, s.y + dy! * 14)))),
        }));
      },
      [png, spots] as const,
    );
  };

  const white = await look({ color: "#ffffff", size: 14 });
  const sunlit = white.filter((s) => s.ground > 90);
  expect(sunlit.length, "a station over sunlit ground at this moment").toBeGreaterThan(0);
  for (const s of sunlit) {
    expect(s.coreLight, "the middle is the dot's colour").toBeGreaterThan(200);
    expect(s.rim, "the rim is darker than the ground beside it").toBeLessThan(s.ground - 25);
  }

  // by orbit: the stations are all in low orbits, drawn in the low-orbit colour (green, #5dd6a2)
  const byOrbit = await look({ color: "orbit", size: 14 });
  expect(byOrbit.length).toBeGreaterThan(0);
  for (const s of byOrbit) expect(s.core[1]! > s.core[0]! + 30 && s.core[1]! > s.core[2]!, `a green middle, not ${s.core.join(",")}`).toBe(true);
});
