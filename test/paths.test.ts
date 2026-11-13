import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BUILT_IN_PATH_STYLES, capPaths, completeStyle, hitRadius, MAX_PATHS, nearestLoop, nearestOnSegment, readPathHit, resolvePathId, styleOf, styleTable } from "../src/space/paths.ts";
import { PATH_POINTS, PATH_SLOTS } from "../src/space/path-ribbons.ts";
import { createSatelliteLayer, newSatelliteState } from "../src/space/satellite-layer.ts";
import { claimPress, pressClaimed } from "../src/sky/claim.ts";
import { createSatellites, type ElementSet } from "../src/satellites/index.ts";

interface Snapshot {
  fields: string[];
  groups: Record<string, (string | number)[][]>;
}
const snapshot = JSON.parse(readFileSync(new URL("./recorded/celestrak-snapshot-2026-11-02.json", import.meta.url), "utf8")) as Snapshot;
const stations = snapshot.groups["stations"]!.map((row) => Object.fromEntries(snapshot.fields.map((field, index) => [field, row[index]])) as unknown as ElementSet);

test("the built-in looks differ by more than colour: no two share both width and dash", () => {
  const looks = Object.entries(BUILT_IN_PATH_STYLES);
  for (let a = 0; a < looks.length; a += 1) {
    for (let b = a + 1; b < looks.length; b += 1) {
      const [nameA, one] = looks[a]!;
      const [nameB, two] = looks[b]!;
      const same = one.width === two.width && JSON.stringify(one.dash) === JSON.stringify(two.dash);
      assert.equal(same, false, `${nameA} and ${nameB} differ by width or dash`);
    }
  }
  assert.deepEqual(BUILT_IN_PATH_STYLES["favourite"]!.dash, [3, 4]);
  assert.equal(BUILT_IN_PATH_STYLES["favourite"]!.width, 1.75);
});

test("a page's look is held to its range, and what is missing comes from the entry under it", () => {
  const base = BUILT_IN_PATH_STYLES["path"]!;
  const look = completeStyle({ width: 99, opacity: -1, dash: [0, 500], color: " #f00 " }, base);
  assert.equal(look.width, 8);
  assert.equal(look.opacity, 0);
  assert.deepEqual(look.dash, [1, 64]);
  assert.equal(look.color, "#f00");
  assert.deepEqual(completeStyle({ dash: null }, BUILT_IN_PATH_STYLES["favourite"]!).dash, null, "null is a solid line");
  assert.deepEqual(completeStyle({ dash: [1] as unknown as [number, number] }, BUILT_IN_PATH_STYLES["favourite"]!).dash, [3, 4], "a bad dash keeps the entry's");
  assert.equal(completeStyle({ width: Number.NaN }, base).width, base.width);
});

test("the style table: a page's entry is laid over the built-in one of that name, a new name starts from path, null takes the entry away", () => {
  const table = styleTable({ favourite: { color: "#0f0" }, mine: { width: 4 } });
  assert.equal(table["favourite"]!.color, "#0f0");
  assert.equal(table["favourite"]!.width, 1.75, "the rest of the look is the built-in's");
  assert.equal(table["mine"]!.width, 4);
  assert.equal(table["mine"]!.color, BUILT_IN_PATH_STYLES["path"]!.color);
  assert.deepEqual(styleTable({ favourite: null })["favourite"], BUILT_IN_PATH_STYLES["favourite"]);
  assert.equal(BUILT_IN_PATH_STYLES["favourite"]!.color, "#ffd166", "the built-ins are never changed");
  assert.equal(styleOf({ id: 1, style: "missing" }, table).name, "path", "an unknown name is the path look");
  assert.equal(styleOf({ id: 1, style: { width: 3 } }, table).style.width, 3);
  assert.equal(styleOf({ id: 1 }, table).name, "path");
});

test("at most 16 paths are kept, the last of the list", () => {
  const list = Array.from({ length: 20 }, (_, i) => i);
  const { kept, dropped } = capPaths(list);
  assert.equal(MAX_PATHS, 16);
  assert.equal(kept.length, 16);
  assert.equal(dropped, 4);
  assert.deepEqual(kept, list.slice(4));
  assert.deepEqual(capPaths([1, 2]), { kept: [1, 2], dropped: 0 });
  assert.equal(PATH_SLOTS, 17, "the buffers have room for 16 and the chosen orbit");
});

test("an id is a NORAD number or group:index (group/index too), and anything else is no satellite", () => {
  const groups = new Map([["stations", { satellites: createSatellites(stations) }]]);
  const norad = groups.get("stations")!.satellites.sets[3]!.NORAD_CAT_ID;
  assert.deepEqual(resolvePathId(norad, groups), { group: "stations", index: 3 });
  assert.deepEqual(resolvePathId(String(norad), groups), { group: "stations", index: 3 });
  assert.deepEqual(resolvePathId("stations:2", groups), { group: "stations", index: 2 });
  assert.deepEqual(resolvePathId("stations/2", groups), { group: "stations", index: 2 });
  assert.equal(resolvePathId("stations:99", groups), null);
  assert.equal(resolvePathId("nope:0", groups), null);
  assert.equal(resolvePathId(1, groups), null);
  assert.equal(resolvePathId("", groups), null);
  assert.equal(resolvePathId(1.5, groups), null);
});

test("the hit radius: 8 pixels by default, twice that and at least 16 for a touch, none when off, held to 40", () => {
  assert.equal(readPathHit(null), 8);
  assert.equal(readPathHit("off"), 0);
  assert.equal(readPathHit("0"), 0);
  assert.equal(readPathHit("500"), 40);
  assert.equal(readPathHit("x"), 8);
  assert.equal(hitRadius(8, "mouse"), 8);
  assert.equal(hitRadius(8, "pen"), 8);
  assert.equal(hitRadius(8, "touch"), 16);
  assert.equal(hitRadius(3, "touch"), 16);
  assert.equal(hitRadius(30, "touch"), 60);
  assert.equal(hitRadius(0, "touch"), 0);
});

test("the nearest path to a point: the distance to a segment, the closer of two loops, and a hidden stretch is skipped", () => {
  assert.deepEqual(nearestOnSegment(5, 3, 0, 0, 10, 0), { distance: 3, x: 5, y: 0 });
  assert.equal(nearestOnSegment(-4, 3, 0, 0, 10, 0).distance, 5, "past the end it is the end that is near");
  const square = (at: number): { xy: Float32Array; ok: Uint8Array; count: number } => ({ xy: new Float32Array([at, at, at + 20, at, at + 20, at + 20, at, at + 20]), ok: new Uint8Array([1, 1, 1, 1]), count: 4 });
  const far = square(100);
  const near = square(0);
  const best = nearestLoop(10, -3, [far, near], 8)!;
  assert.equal(best.index, 1);
  assert.equal(best.distance, 3);
  assert.equal(nearestLoop(10, -30, [far, near], 8), null, "out of reach");
  const hidden = { ...near, ok: new Uint8Array([0, 0, 1, 1]) };
  assert.equal(nearestLoop(10, -3, [hidden], 8), null, "the stretch whose ends are hidden is not on the picture");
});

test("one press means one thing: a press that was claimed is known to be", () => {
  const event = new Event("pointerup");
  assert.equal(pressClaimed(event), false);
  claimPress(event);
  assert.equal(pressClaimed(event), true);
  assert.equal(pressClaimed(new Event("pointerup")), false, "another press is its own");
});

// Just enough of three.js to build the layer: see satellite-layer.test.ts.
class Obj {
  visible = true;
  frustumCulled = true;
  renderOrder = 0;
  name = "";
  geometry: Geo;
  material: unknown;
  constructor(geometry?: Geo, material?: unknown) {
    this.geometry = geometry ?? new Geo();
    this.material = material;
  }
}
class Geo {
  attributes = new Map<string, unknown>();
  drawRange = 0;
  setAttribute(name: string, attribute: unknown): void {
    this.attributes.set(name, attribute);
  }
  getAttribute(name: string): unknown {
    return this.attributes.get(name);
  }
  setIndex(): void {}
  setDrawRange(_start: number, count: number): void {
    this.drawRange = count;
  }
  dispose(): void {}
}
class Attribute {
  needsUpdate = false;
  array: Float32Array;
  itemSize: number;
  constructor(array: Float32Array, itemSize: number) {
    this.array = array;
    this.itemSize = itemSize;
  }
}
class Material {
  uniforms: Record<string, { value: unknown }> = {};
  opacity = 1;
  color = { set() { return this; } };
  constructor(options: { uniforms?: Record<string, { value: unknown }> } = {}) {
    this.uniforms = options.uniforms ?? {};
  }
  dispose(): void {}
}
class Colour {
  r = 1;
  g = 1;
  b = 1;
  set(): this {
    return this;
  }
}
const parts = { Points: Obj, LineSegments: Obj, BufferGeometry: Geo, BufferAttribute: Attribute, ShaderMaterial: Material, LineBasicMaterial: Material, LineLoop: Obj, Mesh: Obj, DoubleSide: 2, Color: Colour, Vector3: class { x = 0; y = 0; z = 0; } } as never;

const make = () => {
  const local = { children: [] as Obj[], add(item: Obj) { this.children.push(item); }, remove(item: unknown) { this.children = this.children.filter((child) => child !== item); } };
  const state = newSatelliteState();
  const group = createSatellites(stations);
  state.groups.set("stations", { satellites: group, color: "#fff", size: 4, orbits: false, visible: true });
  const layer = createSatelliteLayer(parts, local as never, state, () => 1);
  const mesh = () => local.children.find((child) => child.name === "paths")!;
  return { local, state, group, layer, mesh };
};
const T = Date.parse("2026-11-02T18:00:00Z");

test("at rest nothing is drawn for paths: no path, no chosen satellite, no mesh visible", () => {
  const { state, layer, mesh } = make();
  layer.update(T, 0, 300);
  assert.equal(mesh().visible, false);
  assert.equal(state.drawn.pathDraws, 0);
  assert.equal(state.drawn.pathsDrawn, 0);
});

test("20 paths asked for: the last 16 are drawn in one mesh, 4 are counted as dropped, and the order is kept", () => {
  const { state, layer, mesh, group } = make();
  assert.ok(group.count >= 20);
  state.paths.requests = Array.from({ length: 20 }, (_, i) => ({ id: `stations:${i}`, style: "favourite" }));
  state.paths.version += 1;
  layer.update(T, 0, 300);
  assert.equal(state.paths.info.length, 16);
  assert.equal(state.paths.dropped, 4);
  assert.deepEqual(state.paths.info.map((p) => p.id), Array.from({ length: 16 }, (_, i) => `stations:${i + 4}`));
  assert.equal(mesh().visible, true);
  assert.equal(state.drawn.pathDraws, 1, "one draw for all");
  assert.equal((mesh().geometry as Geo).drawRange, 16 * PATH_POINTS * 6);
});

test("the chosen satellite's own orbit joins the same draw in the selected look, and selected-path off leaves it out", () => {
  const { state, layer, mesh } = make();
  state.selected = { group: "stations", index: 0 };
  layer.update(T, 0, 300);
  assert.equal(state.drawn.pathsDrawn, 1);
  assert.equal(state.drawn.selectedOpacity, BUILT_IN_PATH_STYLES["selected"]!.opacity);
  state.paths.requests = [{ id: "stations:1", style: "favourite" }];
  state.paths.version += 1;
  layer.update(T, 0, 300);
  assert.equal(state.drawn.pathsDrawn, 2, "the page's path and the chosen orbit, one draw");
  assert.equal(state.drawn.pathDraws, 1);
  state.paths.selectedOn = false;
  state.paths.version += 1;
  layer.update(T, 0, 300);
  assert.equal(state.drawn.pathsDrawn, 1, "only the page's path");
  assert.equal(state.drawn.selectedOpacity, 0);
  assert.equal(mesh().visible, true);
  state.paths.requests = [];
  state.paths.version += 1;
  layer.update(T, 0, 300);
  assert.equal(mesh().visible, false, "no path, nothing drawn");
});

test("a path adds and takes away no object, and a path is computed once, not at every frame", () => {
  const { state, layer, local, group } = make();
  layer.update(T, 0, 300);
  const objects = local.children.length;
  const orbit = group.orbit.bind(group);
  let orbits = 0;
  group.orbit = (index, ms, points) => {
    orbits += 1;
    return orbit(index, ms, points);
  };
  for (let round = 0; round < 5; round += 1) {
    state.paths.requests = Array.from({ length: 1 + round * 3 }, (_, i) => ({ id: `stations:${i}` }));
    state.paths.version += 1;
    layer.update(T, 0, 300);
    state.paths.requests = [];
    state.paths.version += 1;
    layer.update(T, 0, 300);
  }
  assert.equal(local.children.length, objects, "no object made or freed");
  state.paths.requests = [{ id: "stations:0" }, { id: "stations:1" }];
  state.paths.version += 1;
  layer.update(T, 0, 300);
  const before = orbits;
  for (let frame = 0; frame < 30; frame += 1) layer.update(T, 0, 300);
  assert.equal(orbits, before, "30 more frames compute no orbit");
});

test("an override of the selected look reaches the drawn paths, and a satellite asked for twice is drawn once, in the later look", () => {
  const { state, layer } = make();
  state.paths.overrides = { selected: { color: "#f00", width: 4 } };
  state.paths.requests = [{ id: "stations:2", style: "favourite" }, { id: "stations:3" }, { id: "stations:2", style: "hovered" }];
  state.selected = { group: "stations", index: 5 };
  state.paths.version += 1;
  layer.update(T, 0, 300);
  assert.deepEqual(state.paths.info.map((p) => `${p.ref.index}:${p.style}`), ["3:path", "2:hovered", "5:selected"]);
});

test("an id that matches nothing is counted, not drawn", () => {
  const { state, layer } = make();
  state.paths.requests = [{ id: 1 }, { id: "stations:0" }, { id: "nope:3" }];
  state.paths.version += 1;
  layer.update(T, 0, 300);
  assert.equal(state.paths.info.length, 1);
  assert.equal(state.paths.unresolved, 2);
});

test("a ridden satellite's own orbit is drawn in the selected look while selected-path is on", () => {
  const { state, layer } = make();
  state.ridden = { group: "stations", index: 4 };
  layer.update(T, 0, 300);
  assert.deepEqual(state.paths.info.map((p) => `${p.ref.index}:${p.style}`), ["4:selected"]);
  state.paths.selectedOn = false;
  state.paths.version += 1;
  layer.update(T, 0, 300);
  assert.equal(state.paths.info.length, 0);
});
