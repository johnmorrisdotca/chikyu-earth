import test from "node:test";
import assert from "node:assert/strict";
import { canvasRatio, clusterPoints, placeLabels, project, projectAll } from "../src/markers/index.ts";

const pose = { lon: 10, lat: 20, radius: 100, cx: 150, cy: 150 };
const near = (a: number, b: number, tol: number, what: string): void => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

test("the point at the middle of the view lands at the centre of the disc, facing", () => {
  const p = project(10, 20, pose);
  near(p.x, 150, 1e-9, "x");
  near(p.y, 150, 1e-9, "y");
  near(p.z, 1, 1e-12, "z");
});

test("north is up and east is right", () => {
  assert.ok(project(10, 30, pose).y < 150, "a point north is above");
  assert.ok(project(20, 20, pose).x > 150, "a point east is right");
  near(project(10, 70, { ...pose, lat: 0 }).y, 150 - 100 * Math.sin((70 * Math.PI) / 180), 1e-9, "70 N seen from the equator");
});

test("the far side is behind: z is negative there, and the limb is at z = 0", () => {
  assert.ok(project(190, -20, pose).z < 0);
  near(project(100, 0, { ...pose, lat: 0, lon: 10 }).z, 0, 1e-12, "90 degrees away");
  near(project(100, 0, { ...pose, lat: 0, lon: 10 }).x, 250, 1e-9, "on the right limb");
});

test("projectAll gives what project gives", () => {
  const lons = [0, 40, -120, 179];
  const lats = [0, 60, -30, 5];
  const xs = new Float32Array(4);
  const ys = new Float32Array(4);
  const zs = new Float32Array(4);
  projectAll(lons, lats, 4, pose, xs, ys, zs);
  lons.forEach((lon, i) => {
    const p = project(lon, lats[i]!, pose);
    near(xs[i]!, p.x, 1e-3, "x");
    near(ys[i]!, p.y, 1e-3, "y");
    near(zs[i]!, p.z, 1e-6, "z");
  });
});

test("points in one cell are one cluster at their average; a lone point stays alone", () => {
  const xs = [10, 14, 200, 12];
  const ys = [10, 12, 200, 11];
  const clusters = clusterPoints([0, 1, 2, 3], 4, xs, ys, 28);
  assert.equal(clusters.length, 2);
  assert.deepEqual(clusters[0]!.members, [0, 1, 3]);
  near(clusters[0]!.x, 12, 1e-9, "average x");
  assert.deepEqual(clusters[1]!.members, [2]);
});

test("labels never overlap, the higher priority wins the spot, and at most `max` are placed", () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ x: 100 + (i % 3) * 8, y: 100 + Math.floor(i / 3) * 6, r: 4, w: 60, h: 20, priority: i }));
  const placed = placeLabels(items, 400, 400, 8);
  assert.ok(placed.length <= 8 && placed.length >= 1);
  assert.equal(placed[0]!.item, 11, "the highest priority is first");
  for (let a = 0; a < placed.length; a += 1) {
    for (let b = a + 1; b < placed.length; b += 1) {
      const p = placed[a]!;
      const q = placed[b]!;
      const apart = p.left + 60 <= q.left || q.left + 60 <= p.left || p.top + 20 <= q.top || q.top + 20 <= p.top;
      assert.ok(apart, `labels ${p.item} and ${q.item} overlap`);
    }
  }
});

test("a label that would leave the box is moved to the other side, or left out", () => {
  const placed = placeLabels([{ x: 395, y: 50, r: 4, w: 60, h: 20, priority: 0 }], 400, 100, 5);
  assert.equal(placed.length, 1);
  assert.ok(placed[0]!.left + 60 <= 400 && placed[0]!.left >= 0);
  assert.equal(placeLabels([{ x: 20, y: 20, r: 4, w: 500, h: 20, priority: 0 }], 400, 100, 5).length, 0);
});

test("ten thousand markers cluster and place labels in a few milliseconds", () => {
  const n = 10_000;
  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i += 1) {
    xs[i] = (i * 7919) % 400;
    ys[i] = (i * 104729) % 400;
    idx[i] = i;
  }
  const t0 = performance.now();
  const clusters = clusterPoints(idx, n, xs, ys, 28);
  const items = clusters.filter((c) => c.members.length === 1).map((c) => ({ x: c.x, y: c.y, r: 4, w: 50, h: 20, priority: 0 }));
  placeLabels(items, 400, 400, 24);
  const ms = performance.now() - t0;
  assert.ok(clusters.length <= (Math.ceil(400 / 28) + 1) ** 2);
  assert.ok(ms < 100, `${ms.toFixed(1)} ms`);
});

test("the overlay canvas holds the same pixel budget as the 3D one", () => {
  assert.equal(canvasRatio(420, 420, 1), 1);
  assert.equal(canvasRatio(420, 420, 3), 2);
  const r = canvasRatio(2560, 1440, 2);
  assert.ok(2560 * r <= 4096 && 1440 * r <= 4096 && 2560 * 1440 * r * r <= 6_000_001);
  assert.ok(canvasRatio(8000, 4000, 2) * 8000 <= 4096);
});
