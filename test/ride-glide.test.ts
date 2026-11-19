import test from "node:test";
import assert from "node:assert/strict";
import { GLIDE_FLOOR_KM, satelliteGlide, satelliteGlideKm, type GlidePose, type Quat } from "../src/space/ride-glide.ts";
import { ridePose, type RideFace } from "../src/space/ride.ts";

type V = [number, number, number];
const EARTH_KM = 6371;
const dot = (a: number[], b: number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const len = (a: number[]): number => Math.hypot(a[0]!, a[1]!, a[2]!);
const cross = (a: number[], b: number[]): V => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];

/** The camera's orientation from its forward and up (three.js: it looks down -z, up is +y). */
function quatOf(forward: number[], up: number[]): Quat {
  const z = [-forward[0]!, -forward[1]!, -forward[2]!], x = cross(up, z), y = cross(z, x);
  const m = [[x[0], y[0], z[0]], [x[1], y[1], z[1]], [x[2], y[2], z[2]]] as number[][];
  const trace = m[0]![0]! + m[1]![1]! + m[2]![2]!;
  if (trace > 0) { const s = 0.5 / Math.sqrt(trace + 1); return [(m[2]![1]! - m[1]![2]!) * s, (m[0]![2]! - m[2]![0]!) * s, (m[1]![0]! - m[0]![1]!) * s, 0.25 / s]; }
  if (m[0]![0]! > m[1]![1]! && m[0]![0]! > m[2]![2]!) { const s = 2 * Math.sqrt(1 + m[0]![0]! - m[1]![1]! - m[2]![2]!); return [0.25 * s, (m[0]![1]! + m[1]![0]!) / s, (m[0]![2]! + m[2]![0]!) / s, (m[2]![1]! - m[1]![2]!) / s]; }
  if (m[1]![1]! > m[2]![2]!) { const s = 2 * Math.sqrt(1 + m[1]![1]! - m[0]![0]! - m[2]![2]!); return [(m[0]![1]! + m[1]![0]!) / s, 0.25 * s, (m[1]![2]! + m[2]![1]!) / s, (m[0]![2]! - m[2]![0]!) / s]; }
  const s = 2 * Math.sqrt(1 + m[2]![2]! - m[0]![0]! - m[1]![1]!);
  return [(m[0]![2]! + m[2]![0]!) / s, (m[1]![2]! + m[2]![1]!) / s, 0.25 * s, (m[1]![0]! - m[0]![1]!) / s];
}
/** A vector of the camera's own axes in the scene's. */
function turnBy([qx, qy, qz, qw]: Quat, [x, y, z]: number[]): V {
  const ix = qw * x! + qy * z! - qz * y!, iy = qw * y! + qz * x! - qx * z!, iz = qw * z! + qx * y! - qy * x!, iw = -qx * x! - qy * y! - qz * z!;
  return [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx];
}
const angleDeg = (a: Quat, b: Quat): number => (2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])))) * 180 / Math.PI;

/** A satellite `km` up at `deg` round the equator from +x, going north-east-ish, and the camera riding from it with a facing (the horizon look). */
function rider(deg: number, km: number, face: RideFace, heading = 0): GlidePose {
  const a = (deg * Math.PI) / 180, r = 1 + km / EARTH_KM;
  const position: V = [r * Math.cos(a), 0, r * Math.sin(a)];
  const east: V = [-Math.sin(a), 0, Math.cos(a)], h = (heading * Math.PI) / 180;
  const velocity: V = [east[0] * Math.cos(h) * 7.6, Math.sin(h) * 7.6, east[2] * Math.cos(h) * 7.6];
  const pose = ridePose({ position, velocity, look: "horizon", yaw: 0, tilt: 0, zoom: 1, face });
  return { p: position, q: quatOf(pose.forward, pose.up) };
}
const vertical = (p: number[]): V => { const r = len(p); return [p[0]! / r, p[1]! / r, p[2]! / r]; };

/** The glide at `steps` points, with what each check reads. */
function fly(from: GlidePose, to: GlidePose, steps = 200) {
  const out: { p: V; q: Quat; ease: number }[] = [];
  for (let i = 0; i <= steps; i += 1) { const e = i / steps, g = satelliteGlide(from, to, e); out.push({ p: g.p, q: g.q, ease: e }); }
  return out;
}

for (const face of ["ahead", "down"] as const) {
  for (const [name, deg, heading] of [["behind the Earth", 140, 40], ["in sight", 25, -20], ["across a pole's side", 175, 120]] as const) {
    test(`${name}, facing ${face}: round the Earth, never under 100 km, nearer at each step, the view turning once and never rolling over`, () => {
      const from = rider(0, 420, face), to = rider(deg, 550, face, heading);
      const path = fly(from, to);
      let lastAway = Infinity, lastTurn = Infinity;
      const upSide = (q: Quat, p: V) => dot(turnBy(q, [0, 1, 0]), vertical(p));
      const lookSide = (q: Quat, p: V) => dot(turnBy(q, [0, 0, -1]), vertical(p));
      const ups = [upSide(from.q, from.p), upSide(to.q, to.p)], looks = [lookSide(from.q, from.p), lookSide(to.q, to.p)];
      for (const at of path) {
        const height = (len(at.p) - 1) * EARTH_KM;
        assert.ok(height >= Math.min(420, 550) - 1e-6, `${height.toFixed(1)} km up at ${at.ease}: never under the lower end`);
        assert.ok(height >= GLIDE_FLOOR_KM, `over the floor at ${at.ease}`);
        assert.ok(height <= 550 + 1e-6, `${height.toFixed(1)} km up: never over the higher end`);
        const away = len([at.p[0] - to.p[0], at.p[1] - to.p[1], at.p[2] - to.p[2]]) * EARTH_KM;
        assert.ok(away <= lastAway + 1e-6, `the distance to the end grew at ${at.ease}: ${lastAway} to ${away}`);
        lastAway = away;
        const turned = angleDeg(at.q, to.q);
        assert.ok(turned <= lastTurn + 1e-6, `the view turned away from its end at ${at.ease}: ${lastTurn} to ${turned}`);
        lastTurn = turned;
        for (const [side, ends] of [[upSide(at.q, at.p), ups], [lookSide(at.q, at.p), looks]] as const) {
          if (Math.sign(ends[0]!) === Math.sign(ends[1]!) && Math.abs(ends[0]!) > 0.2 && Math.abs(ends[1]!) > 0.2) assert.ok(Math.sign(side) === Math.sign(ends[0]!), `rolled over against the vertical at ${at.ease}: ${side}`);
        }
      }
      assert.ok(path[path.length - 1]!.p.every((v, i) => Math.abs(v - to.p[i]!) < 1e-12), "it ends on the second ride's camera");
      assert.ok(angleDeg(path[path.length - 1]!.q, to.q) < 1e-3, "with its look");
      assert.ok(path[0]!.p.every((v, i) => Math.abs(v - from.p[i]!) < 1e-12) && angleDeg(path[0]!.q, from.q) < 1e-3, "and starts on the first");
    });
  }
}

test("the glide back is the same glide the other way", () => {
  const a = rider(0, 420, "ahead"), b = rider(130, 550, "ahead", 60);
  for (let i = 0; i <= 20; i += 1) {
    const e = i / 20, there = satelliteGlide(a, b, e), back = satelliteGlide(b, a, 1 - e);
    assert.ok(len([there.p[0] - back.p[0], there.p[1] - back.p[1], there.p[2] - back.p[2]]) * EARTH_KM < 1e-6, `the same place at ${e}`);
    assert.ok(angleDeg(there.q, back.q) < 1e-3, `the same look at ${e}`);
  }
});

test("a short hop is all but the straight glide", () => {
  const a = rider(0, 420, "ahead"), b = rider(25 / 6791 * (180 / Math.PI), 420, "ahead");
  const mid = satelliteGlide(a, b, 0.5), straight = [(a.p[0] + b.p[0]) / 2, (a.p[1] + b.p[1]) / 2, (a.p[2] + b.p[2]) / 2];
  const off = len([mid.p[0] - straight[0]!, mid.p[1] - straight[1]!, mid.p[2] - straight[2]!]) * EARTH_KM;
  assert.ok(off < 0.015, `${(off * 1000).toFixed(1)} m from the straight line half way along 25 km`);
});

test("between ends lower than the floor the glide rises over it in the middle, and the floor can be set", () => {
  const a = rider(0, 40, "ahead"), b = rider(60, 40, "ahead");
  const mid = (len(satelliteGlide(a, b, 0.5).p) - 1) * EARTH_KM;
  assert.ok(mid >= GLIDE_FLOOR_KM - 1e-6, `${mid.toFixed(1)} km half way`);
  assert.ok((len(satelliteGlide(a, b, 0.5, 300).p) - 1) * EARTH_KM >= 300 - 1e-6, "a floor of 300 km");
  assert.ok(Math.abs((len(satelliteGlide(a, b, 0).p) - 1) * EARTH_KM - 40) < 1e-6, "the ends stay where they are");
});

test("opposite sides of the Earth: the glide still goes round it", () => {
  const a: GlidePose = { p: [1.07, 0, 0], q: [0, 0, 0, 1] }, b: GlidePose = { p: [-1.07, 0, 0], q: [0, 0, 0, 1] };
  for (let i = 0; i <= 10; i += 1) assert.ok(len(satelliteGlide(a, b, i / 10).p) > 1.06, `round it at ${i / 10}`);
});

test("the glide's length is the way along the circle with the change of height", () => {
  assert.ok(Math.abs(satelliteGlideKm([1.07, 0, 0], [0, 1.07, 0]) - (Math.PI / 2) * 1.07 * EARTH_KM) < 1e-6);
  assert.ok(Math.abs(satelliteGlideKm([1.07, 0, 0], [1.17, 0, 0]) - 0.1 * EARTH_KM) < 1e-6);
});
