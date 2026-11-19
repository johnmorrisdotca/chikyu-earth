// A ride that goes from one satellite to another glides round the Earth along the great circle, not through it: the camera keeps at least 100 km above the ground, comes nearer the end at every frame, turns once
// towards its end look with nothing rolling over against the local vertical, and arrives facing the way it faced. To a satellite in sight it is all but the straight glide; to one behind the Earth it goes over
// the Earth's edge. The glide back is the same flight the other way. The page's clock is the test's own and is stepped by hand, so every frame of the glide is drawn and read; the satellites' clock is held (speed 0).
import { expect, test, type Page } from "@playwright/test";
import { freezeClock, ownClock, settle } from "./gl.ts";
import { routeElements } from "./recorded.ts";

test.beforeEach(({ page }) => routeElements(page));
test.describe.configure({ mode: "serial" });
test.use({ reducedMotion: "no-preference" });

const SPACE = "chikyu-space";
const T0 = "2026-11-02T18:00Z";
const EARTH_KM = 6371;
const GLIDE_MS = 2400;
const STEP_MS = 32;
type Ref = { group: string; index: number };
type V = [number, number, number];
type Q = [number, number, number, number];
interface Camera { position: V; quaternion: Q }
interface Space {
  stats: { draws: number; camera: Camera; ride: { gliding: boolean } };
  riding: { face: string | null; target: Ref } | null;
  ride(target: Ref | null, options: Record<string, unknown>): void;
  setView(view: unknown, final: boolean): void;
}

async function open(page: Page): Promise<void> {
  await ownClock(page);
  await page.goto(`/chikyu-earth/?look=space&time=${T0}&speed=0&center=-100,40&sats=stations`);
  await page.locator(`${SPACE}[data-state=live]`).waitFor({ timeout: 60_000 });
  await page.locator("kazoku-view-controls").evaluate((el) => (el as unknown as { pause(): void }).pause());
  await settle(page);
}
const draws = (page: Page): Promise<number> => page.locator(SPACE).evaluate((el) => (el as unknown as Space).stats.draws);
const camera = (page: Page): Promise<Camera> => page.locator(SPACE).evaluate((el) => (el as unknown as Space).stats.camera);

/** Ride `ref` at once (no glide) and wait for the draw. */
async function rideNow(page: Page, ref: Ref, options: Record<string, unknown>): Promise<Camera> {
  const before = await draws(page);
  await page.locator(SPACE).evaluate((el, { ref, options }) => {
    const space = el as unknown as Space;
    space.setView({ yaw: 0, tilt: 0, zoom: 1 }, true);
    space.ride(ref, { ...options, smooth: false });
  }, { ref, options });
  await expect.poll(() => draws(page), { timeout: 30_000 }).toBeGreaterThan(before);
  await settle(page, 300);
  return camera(page);
}

/** Where each satellite of a few is: ridden from the inside, looking down, the camera is at it. */
async function places(page: Page, refs: Ref[]): Promise<{ ref: Ref; at: V }[]> {
  const out: { ref: Ref; at: V }[] = [];
  for (const ref of refs) out.push({ ref, at: (await rideNow(page, ref, { view: "from", look: "down", viewpoint: "inside" })).position });
  return out;
}

/** Glide to `ref` with `options` on the page's clock, held and stepped by hand, and read the camera at every step until the glide has ended. */
async function glideTo(page: Page, ref: Ref, options: Record<string, unknown>): Promise<Camera[]> {
  await freezeClock(page);
  const seen: Camera[] = [await camera(page)];
  await page.locator(SPACE).evaluate((el, { ref, options }) => (el as unknown as Space).ride(ref, options), { ref, options: { ...options, glide: GLIDE_MS } });
  for (let ms = 0; ms < GLIDE_MS + 2000; ms += STEP_MS) {
    await page.clock.runFor(STEP_MS);
    const now = await page.locator(SPACE).evaluate((el) => { const s = (el as unknown as Space).stats; return { camera: s.camera, gliding: s.ride.gliding }; });
    seen.push(now.camera);
    if (!now.gliding && ms > GLIDE_MS) break;
  }
  await page.clock.resume();
  return seen;
}

const dot = (a: number[], b: number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const len = (a: number[]): number => Math.hypot(a[0]!, a[1]!, a[2]!);
const sub = (a: number[], b: number[]): V => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
function turnBy([qx, qy, qz, qw]: Q, [x, y, z]: readonly number[]): V {
  const ix = qw * x! + qy * z! - qz * y!, iy = qw * y! + qz * x! - qx * z!, iz = qw * z! + qx * y! - qy * x!, iw = -qx * x! - qy * y! - qz * z!;
  return [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx];
}
const angleDeg = (a: Q, b: Q): number => (2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])))) * 180 / Math.PI;

/** What is wrong with a glide, if anything. */
function judge(seen: Camera[]): string[] {
  const wrong: string[] = [];
  const end = seen[seen.length - 1]!;
  const away = seen.map((c) => len(sub(c.position, end.position)) * EARTH_KM);
  const turned = seen.map((c) => angleDeg(c.quaternion, end.quaternion));
  const high = seen.map((c) => (len(c.position) - 1) * EARTH_KM);
  const between = away.filter((km) => km > 1 && km < away[0]! - 1).length;
  if (between < 20) wrong.push(`only ${between} frames on the way`);
  for (let i = 1; i < seen.length; i += 1) if (away[i]! > away[i - 1]! + 0.5) { wrong.push(`the distance to the end grew at frame ${i}: ${away[i - 1]!.toFixed(0)} to ${away[i]!.toFixed(0)} km`); break; }
  for (let i = 1; i < seen.length; i += 1) if (turned[i]! > turned[i - 1]! + 0.3) { wrong.push(`the view turned away from its end at frame ${i}: ${turned[i - 1]!.toFixed(1)} to ${turned[i]!.toFixed(1)} degrees`); break; }
  const lowest = Math.min(...high);
  if (lowest < 100) wrong.push(`the camera came to ${lowest.toFixed(0)} km above the ground (100 at the least)`);
  const top = Math.max(high[0]!, high[high.length - 1]!);
  if (Math.max(...high) > top + 5) wrong.push(`the camera rose to ${Math.max(...high).toFixed(0)} km, over both ends (${high[0]!.toFixed(0)}, ${high[high.length - 1]!.toFixed(0)})`);
  for (const [axis, name] of [[[0, 1, 0], "up"], [[0, 0, -1], "line of sight"]] as const) {
    const side = seen.map((c) => dot(turnBy(c.quaternion, axis), c.position) / len(c.position));
    const a = side[0]!, b = side[side.length - 1]!;
    if (Math.sign(a) === Math.sign(b) && Math.abs(a) > 0.2 && Math.abs(b) > 0.2) {
      const flipped = side.findIndex((s) => Math.sign(s) !== Math.sign(a) && Math.abs(s) > 0.05);
      if (flipped >= 0) wrong.push(`the camera's ${name} rolled over against the vertical at frame ${flipped}`);
    }
  }
  return wrong;
}

/**
 * The glide back goes the same way: every place of it is on the glide there, with the look the glide there had at that place. Off by no more than a thousandth of the way (5 km at the least): the frames are
 * points on the circle read as straight pieces between them, and an outside ride's framing settles in its first 0.4 s, at the other end each way.
 */
function sameWayBack(there: Camera[], back: Camera[]): string[] {
  const wrong: string[] = [];
  let way = 0;
  for (let j = 1; j < there.length; j += 1) way += len(sub(there[j]!.position, there[j - 1]!.position)) * EARTH_KM;
  const off = Math.max(5, way / 1000);
  for (const [i, c] of back.entries()) {
    let best = Infinity, look = 0;
    for (let j = 1; j < there.length; j += 1) {
      const a = there[j - 1]!.position, b = there[j]!.position, d = sub(b, a), l = dot(d, d);
      const t = l > 0 ? Math.max(0, Math.min(1, dot(sub(c.position, a), d) / l)) : 0;
      const km = len(sub(c.position, [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t])) * EARTH_KM;
      if (km < best) { best = km; look = Math.min(angleDeg(c.quaternion, there[j - 1]!.quaternion), angleDeg(c.quaternion, there[j]!.quaternion)); }
    }
    if (best > off) { wrong.push(`frame ${i} of the glide back is ${best.toFixed(0)} km off the glide there (${off.toFixed(0)} km allowed)`); break; }
    if (look > 3) { wrong.push(`frame ${i} of the glide back looks ${look.toFixed(1)} degrees from the glide there at that place`); break; }
  }
  return wrong;
}

const RIDES = [
  { name: "outside, ahead", options: { view: "from", look: "horizon", viewpoint: "outside", face: "ahead" } },
  { name: "outside, down", options: { view: "from", look: "horizon", viewpoint: "outside", face: "down" } },
  { name: "inside, ahead", options: { view: "from", look: "horizon", viewpoint: "inside", face: "ahead" } },
  { name: "inside, down", options: { view: "from", look: "horizon", viewpoint: "inside", face: "down" } },
] as const;

test("from one satellite to another, in sight and behind the Earth: round the Earth, nearer at every frame, the view turning once, and the same way back", async ({ page }) => {
  test.setTimeout(1_800_000);
  await open(page);
  const from: Ref = { group: "stations", index: 0 };
  const angle = (a: V, b: V) => Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (len(a) * len(b))))) * 180 / Math.PI;
  const clear = (a: V, b: V) => { const d = sub(b, a), t = Math.max(0, Math.min(1, -dot(a, d) / dot(d, d))); return (len([a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t]) - 1) * EARTH_KM; };
  // two moments of the recorded elements (SGP4 on them, checked here from the rides): CSS Tianhe 12 minutes on is about 20 degrees round from the ISS with the straight line 300 km over the ground (in sight),
  // and DUPLEX at the first moment is about 157 degrees round, behind the Earth
  const CASES = { "in sight": { time: new Date(Date.parse(T0) + 12 * 60_000).toISOString(), ref: { group: "stations", index: 2 } }, "behind the Earth": { time: new Date(Date.parse(T0)).toISOString(), ref: { group: "stations", index: 8 } } };
  const found: Record<string, { time: string; ref: Ref; deg: number; clearKm: number }> = {};
  for (const [where, { time, ref }] of Object.entries(CASES)) {
    await page.locator(SPACE).evaluate((el, time) => el.setAttribute("time", time), time);
    const [mine, other] = await places(page, [from, ref]);
    found[where] = { time, ref, deg: angle(mine!.at, other!.at), clearKm: clear(mine!.at, other!.at) };
  }
  expect(found["in sight"]!.deg > 8 && found["in sight"]!.deg < 30 && found["in sight"]!.clearKm > 150, `in sight: ${JSON.stringify(found["in sight"])}`).toBe(true);
  expect(found["behind the Earth"]!.deg > 110 && found["behind the Earth"]!.clearKm < 0, `behind the Earth: ${JSON.stringify(found["behind the Earth"])}`).toBe(true);

  for (const where of ["in sight", "behind the Earth"] as const) {
    const { time, ref: other, deg, clearKm } = found[where]!;
    await page.locator(SPACE).evaluate((el, time) => el.setAttribute("time", time), time);
    console.log(`${where}: ${other.group}:${other.index} at ${time}, ${deg.toFixed(0)} degrees round, the straight line ${clearKm.toFixed(0)} km over the ground`);
    for (const ride of RIDES) {
      await rideNow(page, from, ride.options);
      const there = await glideTo(page, other, ride.options);
      const riding = await page.locator(SPACE).evaluate((el) => (el as unknown as Space).riding);
      expect(judge(there), `${where}, ${ride.name}: the glide there`).toEqual([]);
      expect(riding?.target, `${where}, ${ride.name}: it rides the other satellite`).toEqual(other);
      expect(riding?.face, `${where}, ${ride.name}: facing the way it faced`).toBe(ride.options.face);
      const back = await glideTo(page, from, ride.options);
      expect(judge(back), `${where}, ${ride.name}: the glide back`).toEqual([]);
      expect(sameWayBack(there, back), `${where}, ${ride.name}: the same way back`).toEqual([]);
      console.log(`  ${ride.name}: ${there.length} frames there, ${back.length} back, lowest ${Math.min(...there.map((c) => (len(c.position) - 1) * EARTH_KM)).toFixed(0)} km`);
    }
  }
});
