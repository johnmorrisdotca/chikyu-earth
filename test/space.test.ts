import test from "node:test";
import assert from "node:assert/strict";
import { AU_IN_EARTH_RADII, blend, createTrack, frameAt, orbitPath, PLANETS, type Vec3 } from "../src/space/ephemeris.ts";
import { fitDistance } from "../src/space/scene.ts";
import { compress, placeAround, placeMoon, placeSun, RADIUS, SUN_COMPRESSED, truePosition } from "../src/space/scale.ts";

const len = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);
const near = (a: number, b: number, tol: number, what: string): void => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

test("the Sun is about one astronomical unit away and the Moon about sixty Earth radii", () => {
  const f = frameAt(Date.UTC(2026, 10, 2, 12));
  near(len(f.sun), 0.9945, 0.003, "Sun, early November");
  near(len(f.moon) * AU_IN_EARTH_RADII, 60, 4, "Moon in Earth radii");
});

test("the Sun is in the south of the sky in northern winter and the north in summer (the scene's y is up)", () => {
  assert.ok(frameAt(Date.UTC(2026, 11, 21, 12)).sun[1] < -0.35);
  assert.ok(frameAt(Date.UTC(2026, 5, 21, 12)).sun[1] > 0.35);
});

test("the Moon is on the Sun's side at the new moon and opposite at the full moon", () => {
  const dot = (a: Vec3, b: Vec3): number => (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (len(a) * len(b));
  const newMoon = frameAt(Date.UTC(2026, 10, 9, 7, 3));
  const fullMoon = frameAt(Date.UTC(2026, 10, 24, 14, 53));
  assert.ok(dot(newMoon.moon, newMoon.sun) > 0.99, `new ${dot(newMoon.moon, newMoon.sun)}`);
  assert.ok(dot(fullMoon.moon, fullMoon.sun) < -0.99, `full ${dot(fullMoon.moon, fullMoon.sun)}`);
});

test("a planet's place from the Earth is the Sun's plus the planet's from the Sun", () => {
  const ms = Date.UTC(2026, 10, 2, 12);
  const f = frameAt(ms);
  const path = orbitPath("Mars", ms, 96);
  const here = path[0]!;
  // the first point of the path is the planet's own place relative to the Sun at ms
  const geo: Vec3 = [f.sun[0] + here[0], f.sun[1] + here[1], f.sun[2] + here[2]];
  for (let i = 0; i < 3; i += 1) near(geo[i]!, f.planets.Mars[i]!, 0.02, "axis");
  assert.equal(path.length, 97);
  near(len(path[96]!) - len(path[0]!), 0, 0.02, "the path closes");
});

test("the track interpolates within 0.1 degree of the truth at a day a second", () => {
  const track = createTrack(86_400_000);
  const t0 = Date.UTC(2026, 10, 2, 0);
  let worst = 0;
  for (let i = 0; i <= 600; i += 1) {
    const ms = t0 + i * (86_400_000 / 30); // a day a second, 30 frames a second, 20 seconds
    const got = track.at(ms).moon;
    const want = frameAt(ms).moon;
    const cos = (got[0] * want[0] + got[1] * want[1] + got[2] * want[2]) / (len(got) * len(want));
    worst = Math.max(worst, (Math.acos(Math.min(1, cos)) * 180) / Math.PI);
  }
  assert.ok(worst < 0.1, `the worst Moon error ${worst} degrees`);
});

test("at a steady rate the track looks things up once a step, not once a frame", () => {
  const track = createTrack(3_600_000); // an hour of game time a second
  const t0 = Date.UTC(2026, 10, 2, 0);
  for (let i = 0; i < 300; i += 1) track.at(t0 + i * 33 * 3600);
  assert.ok(track.lookups <= 2 * 12, `${track.lookups} lookups for 300 frames over about ${Math.round((300 * 33 * 3600) / 1000)} s of game time`);
});

test("the spin goes the short way round and a blend keeps unit lengths", () => {
  const a = frameAt(Date.UTC(2026, 10, 2, 0));
  const b = { ...a, ms: a.ms + 1000, spin: a.spin + 359.9 };
  const mid = blend(a, b, 0.5);
  near(((mid.spin - a.spin + 540) % 360) - 180, -0.05, 1e-9, "half of -0.1 degrees");
  for (const name of PLANETS) assert.ok(len(mid.planets[name]) > 0.2);
});

test("compressed scale: the Moon is 10 away, the Sun 44, the planets round the Sun in their real directions", () => {
  const f = frameAt(Date.UTC(2026, 10, 2, 12));
  near(len(placeMoon("compressed", f.moon)), 10, 0.5, "Moon");
  const sun = placeSun("compressed", f.sun);
  near(len(sun), SUN_COMPRESSED, 1e-9, "Sun");
  const helio = (v: Vec3): Vec3 => [v[0] - f.sun[0], v[1] - f.sun[1], v[2] - f.sun[2]];
  const neptune = placeAround("compressed", sun, helio(f.planets.Neptune));
  const fromSun = Math.hypot(neptune[0] - sun[0], neptune[1] - sun[1], neptune[2] - sun[2]);
  assert.ok(fromSun > 150 && fromSun < 260, `Neptune ${fromSun} from the Sun`);
  const h = helio(f.planets.Mars);
  const m = placeAround("compressed", sun, h);
  const d: Vec3 = [m[0] - sun[0], m[1] - sun[1], m[2] - sun[2]];
  near((d[0] * h[0] + d[1] * h[1] + d[2] * h[2]) / (len(d) * len(h)), 1, 1e-9, "same direction from the Sun");
  const earthOrbit = placeAround("compressed", sun, [-f.sun[0], -f.sun[1], -f.sun[2]]);
  near(len(earthOrbit), 0, 1.5, "the Earth, one astronomical unit from the Sun, is drawn where the Earth is (the origin)");
  const t = placeAround("true", [0, 0, 0], [1, 0, 0]);
  assert.deepEqual(t, [AU_IN_EARTH_RADII, 0, 0]);
  const v: Vec3 = [3, 4, 0];
  const c = compress(v);
  near(c[0] / c[1], 0.75, 1e-9, "direction");
  assert.deepEqual(truePosition([1, 0, 0]), [AU_IN_EARTH_RADII, 0, 0]);
});

test("the default painter makes a sphere in a colour for each planet and a facing glow for the Sun, and lights and frees them", async () => {
  const { plainPainter, PLANETS: names } = await import("../src/space/scene.ts").then(async (m) => ({ plainPainter: m.plainPainter, PLANETS: (await import("../src/space/ephemeris.ts")).PLANETS }));
  const made: string[] = [];
  class Thing {
    scale = { setScalar: () => undefined };
    position = { set: () => undefined };
    add(): void {}
    setAttribute(): void {}
    setIndex(): void {}
    dispose(): void {
      made.push("disposed");
    }
  }
  class Vec {
    x = 0;
    y = 0;
    z = 0;
    set(x: number, y: number, z: number): void {
      [this.x, this.y, this.z] = [x, y, z];
    }
  }
  const three = { BufferGeometry: Thing, BufferAttribute: Thing, ShaderMaterial: Thing, Mesh: Thing, Group: Thing, Vector3: Vec, Color: Vec } as never;
  const sun = plainPainter.make(three, "Sun");
  assert.equal(sun.billboard, true);
  assert.equal(sun.light, undefined);
  sun.dispose();
  for (const name of names) {
    const drawing = plainPainter.make(three, name);
    assert.ok(drawing.object);
    assert.equal(typeof drawing.light, "function");
    drawing.light?.([1, 0, 0]);
    drawing.dispose();
  }
  assert.ok(made.length >= 2 * (names.length + 1), "each drawing frees its geometry and its material");
});

test("Pluto is a planet of the view: nearly 40 astronomical units from the Sun in 2026, outside Neptune, with a radius and an orbit", () => {
  assert.ok((PLANETS as readonly string[]).includes("Pluto"));
  const f = frameAt(Date.UTC(2026, 10, 2, 12));
  const helio = (v: Vec3): Vec3 => [v[0] - f.sun[0], v[1] - f.sun[1], v[2] - f.sun[2]];
  const au = len(helio(f.planets.Pluto));
  assert.ok(au > 30 && au < 50, `Pluto ${au} au from the Sun`);
  assert.ok(au > len(helio(f.planets.Neptune)));
  const sun = placeSun("compressed", f.sun);
  const placed = placeAround("compressed", sun, helio(f.planets.Pluto));
  const pluto = Math.hypot(placed[0] - sun[0], placed[1] - sun[1], placed[2] - sun[2]);
  const neptune = placeAround("compressed", sun, helio(f.planets.Neptune));
  assert.ok(pluto > Math.hypot(neptune[0] - sun[0], neptune[1] - sun[1], neptune[2] - sun[2]), "outside Neptune's orbit");
  assert.ok(RADIUS["Pluto"]!.compressed < RADIUS["Mercury"]!.compressed && RADIUS["Pluto"]!.true < 0.2, "the smallest");
  const orbit = orbitPath("Pluto", f.ms, 12);
  assert.equal(orbit.length, 13);
  assert.ok(len(orbit[0]!) > 25);
});

test("the camera's distance at Fit puts the Earth's disc, and so its glow, inside the shorter side of a box of any shape", () => {
  const tan = Math.tan((35 / 2) * (Math.PI / 180));
  /** The disc's radius as a share of half the shorter side: the Earth's tangent ray from the camera, over the field of view. */
  const share = (distance: number, aspect: number): number => 1 / Math.sqrt(distance * distance - 1) / tan / Math.min(1, aspect);
  for (const aspect of [16 / 9, 1, 9 / 16, 3]) {
    const distance = fitDistance(0.9, aspect);
    assert.ok(Math.abs(share(distance, aspect) - 0.9) < 1e-9, `aspect ${aspect}: ${share(distance, aspect)}`);
    // the glow reaches 8% beyond the disc: still inside
    assert.ok(share(distance, aspect) * 1.08 <= 1, "the glow is not cut");
  }
  assert.ok(fitDistance(0.9, 9 / 16) > fitDistance(0.9, 1), "a tall box needs the camera further back");
  assert.equal(fitDistance(0.9, 16 / 9), fitDistance(0.9, 1), "a wide box is fitted by its height, as a square is");
});
