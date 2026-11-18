// The fly-to move on the space view, in a real browser (Chromium, drawn in software): a new move mid-turn and mid-descent bends the running one, so the camera's speed and the way it goes carry on across
// the change, with no frame where it stops or jumps, and it ends at the new place; a hand ends it where it is; a reader who asked for reduced motion is taken there at once; nothing is drawn at rest after.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { DOWNGRADE_AFTER_MS } from "../src/realistic/textures.ts";
import { MOON_KEEP_MS } from "../src/space/scene.ts";
import { COUNT_SCRIPT, counts, untilStill } from "./gl.ts";

test.describe.configure({ mode: "serial" });

const SPACE = "chikyu-space";
const TOKYO = { lon: 139.69, lat: 35.69 };
const LONDON = { lon: -0.13, lat: 51.51 };
const LIMA = { lon: -77.04, lat: -12.05 };

interface FlyStats {
  flying: boolean;
  phase: "across" | "down" | null;
  heightKm: number | null;
  held: string | null;
  moves: number;
  redirects: number;
}
const flyOf = (space: Locator): Promise<FlyStats> => space.evaluate((el) => (Reflect.get(el, "stats") as { fly: FlyStats }).fly);

async function openSpace(page: Page, query = ""): Promise<Locator> {
  // a smaller view, so the software drawing gives enough frames a second to read speeds from
  await page.setViewportSize({ width: 720, height: 560 });
  await page.addInitScript(COUNT_SCRIPT);
  await page.goto(`/chikyu-earth/?look=space&speed=0&time=2026-11-02T03:00Z&center=10,20${query}`);
  const space = page.locator(SPACE);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  // with motion allowed the demo opens with the view turning: hold it, so what moves is the fly-to alone
  await page.locator("kazoku-view-controls").evaluate((el) => (el as HTMLElement & { pause(): void }).pause());
  await untilStill(page);
  return space;
}

/** Where the London marker's foot is from the middle of the view, in CSS pixels, or Infinity when it is not shown. */
const offMiddle = async (space: Locator): Promise<number> => {
  const box = (await space.boundingBox())!;
  const foot = await space.evaluate((el) => {
    const mark = el.shadowRoot!.querySelector<HTMLElement>(".pl-mark[data-kind=here]:not([hidden])");
    if (!mark) return null;
    const r = mark.getBoundingClientRect();
    return { x: r.left, y: r.top };
  });
  return foot ? Math.hypot(foot.x - (box.x + box.width / 2), foot.y - (box.y + box.height / 2)) : Infinity;
};

/**
 * Record each step of the move as the controls hand it to the page (`kazoku-viewchange`, reason `fly`), with the time it was made: the point under the camera (from the yaw and the tilt, the view's
 * centre being at latitude 20) and the height the element then has. The software drawing comes late and at uneven times, so the steps are read where the move makes them, not from the draws.
 */
const record = (space: Locator): Promise<void> =>
  space.evaluate((el) => {
    const samples: { t: number; p: number[]; h: number }[] = [];
    const listen = (event: Event): void => {
      const detail = (event as CustomEvent<{ yaw: number; tilt: number; reason: string }>).detail;
      if (detail.reason !== "fly") return;
      const lon = (-detail.yaw * Math.PI) / 180;
      const lat = ((20 - detail.tilt) * Math.PI) / 180;
      const height = (Reflect.get(el, "stats") as { fly: { heightKm: number } }).fly.heightKm;
      samples.push({ t: performance.now(), p: [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)], h: height });
    };
    document.addEventListener("kazoku-viewchange", listen);
    Reflect.set(window, "__fly", { samples, stop: () => document.removeEventListener("kazoku-viewchange", listen), marks: {} as Record<string, number> });
  });
const mark = (page: Page, name: string): Promise<void> => page.evaluate((key) => void ((Reflect.get(window, "__fly") as { marks: Record<string, number> }).marks[key] = performance.now()), name);
const samples = (page: Page): Promise<{ samples: { t: number; p: number[]; h: number }[]; marks: Record<string, number> }> =>
  page.evaluate(() => {
    const fly = Reflect.get(window, "__fly") as { samples: { t: number; p: number[]; h: number }[]; stop(): void; marks: Record<string, number> };
    fly.stop();
    return { samples: fly.samples, marks: fly.marks };
  });

/** Between each two steps: the time, the angle the point under the camera turned (radians a second), and how fast its height changed (the log of the height, a second). */
function steps(list: { t: number; p: number[]; h: number }[]): { t: number; turn: number; lift: number }[] {
  const out: { t: number; turn: number; lift: number }[] = [];
  for (let i = 1; i < list.length; i += 1) {
    const a = list[i - 1]!;
    const b = list[i]!;
    const dt = (b.t - a.t) / 1000;
    if (dt <= 0) continue;
    const cos = a.p[0]! * b.p[0]! + a.p[1]! * b.p[1]! + a.p[2]! * b.p[2]!;
    out.push({ t: (a.t + b.t) / 2, turn: Math.acos(Math.max(-1, Math.min(1, cos))) / dt, lift: (Math.log(b.h) - Math.log(a.h)) / dt });
  }
  return out;
}

/** The mean of a speed over the two steps between draws just before a moment, and the two just after it. */
const aroundOf = (list: { t: number; turn: number; lift: number }[], key: "turn" | "lift", at: number): { before: number; after: number } => {
  const before = list.filter((s) => s.t < at).slice(-2);
  const after = list.filter((s) => s.t > at).slice(0, 2);
  const mean = (some: typeof list): number => some.reduce((sum, s) => sum + s[key], 0) / Math.max(1, some.length);
  return { before: mean(before), after: mean(after) };
};

/** No draw is a jump: each step is no more than twice the larger of its neighbours (and a floor for the slow end), and no draw stops the camera while it is still moving on either side. */
function noJumpNoStop(list: { t: number; turn: number; lift: number }[], key: "turn" | "lift", from: number, to: number, label: string): void {
  const inside = list.filter((s) => s.t >= from && s.t <= to);
  const peak = Math.max(...inside.map((s) => Math.abs(s[key])));
  expect(inside.length, `${label}: steps to look at`).toBeGreaterThan(4);
  for (let i = 1; i < inside.length - 1; i += 1) {
    const here = Math.abs(inside[i]![key]);
    const around = Math.max(Math.abs(inside[i - 1]![key]), Math.abs(inside[i + 1]![key]));
    expect(here, `${label}: no jump at ${Math.round(inside[i]!.t - from)} ms`).toBeLessThanOrEqual(2 * around + 0.05 * peak);
    expect(here, `${label}: no stop at ${Math.round(inside[i]!.t - from)} ms`).toBeGreaterThan(0.1 * Math.min(Math.abs(inside[i - 1]![key]), Math.abs(inside[i + 1]![key])));
  }
}

test.describe("a fly-to", () => {
  test.use({ reducedMotion: "no-preference" });

  test("a goToPlace to London during the turn to Tokyo bends the turn: the speed and the way on carry across, no draw stops or jumps, and it ends over London", async ({ page }) => {
    test.setTimeout(120_000);
    const space = await openSpace(page);
    await space.evaluate((el, [tokyo, london]) => Reflect.set(el, "places", [{ id: "tokyo", ...tokyo, label: "Tokyo", kind: "favourite" }, { id: "london", ...london, label: "London", kind: "here" }]), [TOKYO, LONDON]);
    await untilStill(page);
    await record(space);
    await mark(page, "tokyo");
    await space.evaluate((el) => (el as HTMLElement & { goToPlace(text: string): Promise<unknown> }).goToPlace("tokyo"));
    await page.waitForTimeout(400);
    await mark(page, "london");
    expect(await space.evaluate(async (el) => ((await (el as HTMLElement & { goToPlace(text: string): Promise<{ id: string } | undefined> }).goToPlace("London")) as { id: string }).id)).toBe("london");
    await expect.poll(async () => (await flyOf(space)).flying, { timeout: 20_000 }).toBe(false);
    await page.waitForTimeout(300);
    const { samples: list, marks } = await samples(page);
    const s = steps(list);
    const at = marks["london"]!;
    const { before, after } = aroundOf(s, "turn", at);
    console.log(s.map((step) => `${Math.round(step.t - marks["tokyo"]!)}:${step.turn.toFixed(3)}`).join(" "));
    console.log(`turn speed before ${before.toFixed(3)} rad/s, after ${after.toFixed(3)} rad/s; ${s.length} steps; ${JSON.stringify(await flyOf(space))}`);
    expect(before, "the turn to Tokyo was moving").toBeGreaterThan(0.2);
    expect(after / before, "the speed carries across the change").toBeGreaterThan(0.6);
    expect(after / before).toBeLessThan(1.6);
    // from the start of the first turn to near the end of the second: no draw jumps or stops
    noJumpNoStop(s, "turn", marks["tokyo"]! + 60, at + 700, "the turn");
    expect((await flyOf(space)).redirects).toBeGreaterThanOrEqual(1);
    await expect.poll(() => offMiddle(space), { timeout: 10_000 }).toBeLessThan(4);
  });

  test("a flyTo to Lima during the descent over Tokyo blends the height and the turn, and comes down over Lima; a drag ends a move where it is", async ({ page }) => {
    test.setTimeout(150_000);
    const space = await openSpace(page);
    await space.evaluate((el, lima) => Reflect.set(el, "places", [{ id: "lima", ...lima, label: "Lima", kind: "here" }]), LIMA);
    await untilStill(page);
    const startKm = (await flyOf(space)).heightKm!;
    expect(startKm).toBeGreaterThan(5000);
    await record(space);
    const ends = space.evaluate((el, [tokyo, lima]) => {
      const fly = el as HTMLElement & { flyTo(lat: number, lon: number, options?: { height?: number }): Promise<{ reason: string; heightKm: number; held: string | null }> };
      const told: string[] = [];
      el.addEventListener("chikyu-fly-start", () => told.push("start"));
      el.addEventListener("chikyu-fly-end", (event) => told.push(`end ${(event as CustomEvent<{ reason: string }>).detail.reason}`));
      const first = fly.flyTo(tokyo.lat, tokyo.lon, { height: 30 });
      return new Promise<{ first: { reason: string }; second: { reason: string; heightKm: number; held: string | null }; told: string[]; at: number }>((resolve) => {
        // half way down: the phase is "down" and the height is falling
        const wait = (): void => {
          const stats = Reflect.get(el, "stats") as { fly: { phase: string | null; heightKm: number } };
          if (stats.fly.phase === "down" && stats.fly.heightKm < 4000) {
            const at = performance.now();
            (Reflect.get(window, "__fly") as { marks: Record<string, number> }).marks["lima"] = at;
            const second = fly.flyTo(lima.lat, lima.lon, { height: 30 });
            void Promise.all([first, second]).then(([a, b]) => resolve({ first: a, second: b, told, at }));
          } else requestAnimationFrame(wait);
        };
        requestAnimationFrame(wait);
      });
    }, [TOKYO, LIMA]);
    const result = await ends;
    await page.waitForTimeout(300);
    const { samples: list } = await samples(page);
    const s = steps(list);
    const at = result.at;
    const { before, after } = aroundOf(s, "lift", at);
    console.log(s.map((step) => `${Math.round(step.t - at)}:${step.lift.toFixed(2)}/${step.turn.toFixed(2)}`).join(" "));
    console.log(`height speed before ${before.toFixed(3)}, after ${after.toFixed(3)} (log a second); ${JSON.stringify(result)}`);
    expect(result.first.reason).toBe("redirected");
    expect(result.second.reason).toBe("arrived");
    expect(result.told).toEqual(["start", "end redirected", "start", "end arrived"]);
    expect(before, "it was coming down").toBeLessThan(-0.2);
    expect(after / before, "the height's speed carries across the change").toBeGreaterThan(0.6);
    expect(after / before).toBeLessThan(1.6);
    // the height slows to rest without turning back, then the turn sets off: neither jumps nor stops part way
    const rest = s.filter((step) => step.t > at && step.t < at + 900);
    expect(Math.max(...rest.map((step) => step.lift)), "the height does not turn back up").toBeLessThan(0.05);
    noJumpNoStop(s, "lift", at - 1500, at + 800, "the height");
    // with no finer pictures asked for, the descent stops where the package's own stay sharp, and says so
    expect(result.second.held).toBe("no-finer");
    expect(Math.abs(result.second.heightKm - 400)).toBeLessThan(5);
    await expect.poll(() => offMiddle(space), { timeout: 10_000 }).toBeLessThan(4);

    // a drag on the view ends a move where it is
    const going = space.evaluate((el, tokyo) => (el as HTMLElement & { flyTo(lat: number, lon: number, o?: { phase?: string }): Promise<{ reason: string }> }).flyTo(tokyo.lat, tokyo.lon, { phase: "across" }), TOKYO);
    await expect.poll(async () => (await flyOf(space)).flying).toBe(true);
    const box = (await space.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 4 });
    await page.mouse.up();
    expect((await going).reason).toBe("stopped");
    expect((await flyOf(space)).flying).toBe(false);
    // and so does the signal
    const signalled = space.evaluate((el, tokyo) => {
      const stop = new AbortController();
      setTimeout(() => stop.abort(), 200);
      return (el as HTMLElement & { flyTo(lat: number, lon: number, o?: { signal?: AbortSignal }): Promise<{ reason: string }> }).flyTo(tokyo.lat, tokyo.lon, { signal: stop.signal });
    }, TOKYO);
    expect((await signalled).reason).toBe("stopped");

    // nothing at rest after, once the larger pictures and the moons it no longer needs are let go (they are kept a while on timers of their own, and letting go is a draw)
    await page.waitForTimeout(Math.max(DOWNGRADE_AFTER_MS, MOON_KEEP_MS) + 500);
    await untilStill(page);
    const rest0 = await counts(page);
    await page.waitForTimeout(2000);
    const rest1 = await counts(page);
    expect(rest1.draws, "no draw at rest").toBe(rest0.draws);
    expect(rest1.rafRequests, "no frame asked for at rest").toBe(rest0.rafRequests);
  });
});

test.describe("for a reader who asked for reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("a flyTo goes straight to the place and height, in one change, and over land with finer pictures comes all the way down", async ({ page }) => {
    test.setTimeout(120_000);
    // the finer pictures are asked for but none is fetched: the place's floor is what is looked at
    await page.route("https://gibs.earthdata.nasa.gov/**", (route) => route.abort());
    const space = await openSpace(page, "");
    await space.evaluate((el, tokyo) => {
      el.setAttribute("tiles-finer", "gibs");
      Reflect.set(el, "places", [{ id: "tokyo", ...tokyo, label: "Tokyo", kind: "here" }]);
    }, TOKYO);
    await untilStill(page);
    const before = await counts(page);
    const end = await space.evaluate((el, tokyo) => (el as HTMLElement & { flyTo(lat: number, lon: number, o?: { height?: number }): Promise<{ reason: string; heightKm: number; held: string | null }> }).flyTo(tokyo.lat, tokyo.lon, { height: 30 }), TOKYO);
    expect(end.reason).toBe("arrived");
    expect(end.held).toBeNull();
    expect(Math.abs(end.heightKm - 30)).toBeLessThan(0.5);
    expect((await flyOf(space)).flying).toBe(false);
    await untilStill(page);
    const after = await counts(page);
    expect(after.rafRequests - before.rafRequests, "no frames of a move are asked for").toBeLessThanOrEqual(3);
    // the camera is 30 km up, over Tokyo, and the ground is drawn (the near plane does not cut it away)
    const camera = await space.evaluate((el) => (Reflect.get(el, "stats") as { camera: { position: number[] } }).camera.position);
    expect(Math.abs((Math.hypot(...camera) - 1) * 6371 - 30)).toBeLessThan(0.5);
    await expect.poll(() => offMiddle(space), { timeout: 10_000 }).toBeLessThan(4);
    const shot = await space.screenshot();
    expect(shot.byteLength, "a picture of the ground, not an empty view").toBeGreaterThan(20_000);
    // over the sea it stops where the package's own pictures stay sharp
    const sea = await space.evaluate((el) => (el as HTMLElement & { flyTo(lat: number, lon: number): Promise<{ heightKm: number; held: string | null }> }).flyTo(30, -40));
    expect(sea.held).toBe("no-finer");
    expect(Math.abs(sea.heightKm - 400)).toBeLessThan(1);
  });
});
