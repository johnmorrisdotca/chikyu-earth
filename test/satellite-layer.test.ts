import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSatelliteLayer, newSatelliteState } from "../src/space/satellite-layer.ts";
import { createSatellites, MAX_SATELLITE_SPEED, type ElementSet } from "../src/satellites/index.ts";
import { madeUp } from "./madeup-elements.ts";

interface Snapshot {
  fields: string[];
  groups: Record<string, (string | number)[][]>;
}
const snapshot = JSON.parse(readFileSync(new URL("./recorded/celestrak-snapshot-2026-11-02.json", import.meta.url), "utf8")) as Snapshot;
const stations = snapshot.groups["stations"]!.map((row) => Object.fromEntries(snapshot.fields.map((field, index) => [field, row[index]])) as unknown as ElementSet);

// Just enough of three.js for the layer to be built and updated without a browser.
class Obj {
  visible = true;
  frustumCulled = true;
  renderOrder = 0;
  geometry: Geo;
  material: unknown;
  constructor(geometry?: Geo, material?: unknown) {
    this.geometry = geometry ?? new Geo();
    this.material = material;
  }
}
class Geo {
  attributes = new Map<string, unknown>();
  setAttribute(name: string, attribute: unknown): void {
    this.attributes.set(name, attribute);
  }
  getAttribute(name: string): unknown {
    return this.attributes.get(name);
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
class Vec {
  x = 0;
  y = 0;
  z = 0;
}
const parts = (withLines: boolean) =>
  ({ Points: Obj, ...(withLines ? { LineSegments: Obj } : {}), BufferGeometry: Geo, BufferAttribute: Attribute, ShaderMaterial: Material, LineBasicMaterial: Material, LineLoop: Obj, Color: Colour, Vector3: Vec }) as never;
const scene = { children: [] as unknown[], add(item: unknown) { this.children.push(item); }, remove(item: unknown) { this.children = this.children.filter((child) => child !== item); } };

const run = (withLines: boolean) => {
  const state = newSatelliteState();
  state.groups.set("stations", { satellites: createSatellites(stations), color: "#fff", size: 4, orbits: false, visible: true });
  const warnings: string[] = [];
  const warn = console.warn;
  console.warn = (message: unknown) => void warnings.push(String(message));
  try {
    const layer = createSatelliteLayer(parts(withLines), scene as never, state, () => 1);
    const time = Date.parse("2026-11-02T18:00:00Z");
    const speed = MAX_SATELLITE_SPEED * 10;
    layer.update(time, speed, 300);
    layer.update(time + speed * 33, speed, 300);
    layer.update(time + speed * 66, speed, 300);
    return { state, warnings, count: state.groups.get("stations")!.satellites.count };
  } finally {
    console.warn = warn;
  }
};

test("three.js parts without LineSegments do not throw: the satellites above 60 times real time are dots, with one clear warning", () => {
  const { state, warnings, count } = run(false);
  assert.equal(state.drawn.tooFast, true);
  assert.equal(state.drawn.placed, count, "every satellite is still drawn as a dot");
  assert.equal(state.drawn.segments, 0, "no streaks without LineSegments");
  assert.equal(warnings.length, 1, "said once, not every frame");
  assert.match(warnings[0]!, /LineSegments/);
});

test("three.js parts with LineSegments draw a streak for every satellite above 60 times real time, and say nothing", () => {
  const { state, warnings, count } = run(true);
  assert.equal(state.drawn.placed, count);
  assert.equal(state.drawn.segments, count);
  assert.equal(warnings.length, 0);
});

test("a jump in the time above 60 times real time pins the satellites again at once, not up to a second later", () => {
  const state = newSatelliteState();
  const group = createSatellites(stations);
  state.groups.set("stations", { satellites: group, color: "#fff", size: 4, orbits: false, visible: true });
  const layer = createSatelliteLayer(parts(true), scene as never, state, () => 1);
  const time = Date.parse("2026-11-02T18:00:00Z");
  const speed = MAX_SATELLITE_SPEED * 10;
  layer.update(time, speed, 300);
  const pinned = group.propagations;
  layer.update(time + speed * 33, speed, 300);
  const eccentric = group.sets.filter((set) => set.ECCENTRICITY >= 0.02).length;
  assert.ok(group.propagations - pinned <= eccentric * 2 + 1, "the next frame pins a slice of the group at most (a frame that came a moment after the last one: one satellite), not the whole of it");
  const before = group.propagations;
  layer.update(time + 5 * 86_400_000, speed, 300);
  assert.ok(group.propagations - before >= group.count, "five days on, the whole group is pinned again in that frame");
});

test("above 60 times real time a big group is pinned whole once, then a slice a frame: no frame runs SGP4 for the whole group", () => {
  const state = newSatelliteState();
  const group = createSatellites(madeUp("starlink", 3000, "2026-11-02T12:00:00") as unknown as ElementSet[]);
  state.groups.set("many", { satellites: group, color: "#fff", size: 4, orbits: false, visible: true });
  const layer = createSatelliteLayer(parts(true), scene as never, state, () => 1);
  const time = Date.parse("2026-11-02T18:00:00Z");
  const speed = MAX_SATELLITE_SPEED * 10;
  const first = group.propagations;
  layer.update(time, speed, 300);
  assert.equal(group.propagations - first, group.count, "the first frame pins every satellite, so none is left without a place");
  let widest = 0;
  let total = 0;
  for (let frame = 1; frame <= 40; frame += 1) {
    const before = group.propagations;
    layer.update(time + speed * 16 * frame, speed, 300);
    const used = group.propagations - before;
    widest = Math.max(widest, used);
    total += used;
  }
  assert.ok(widest < group.count / 10, `a frame pinned ${widest} of ${group.count} satellites`);
  assert.ok(total > 0, "slices are pinned: the places do not go stale");
  assert.equal(state.drawn.placed, group.count, "every satellite is still drawn");
});

test("focusing one group dims the other through the dim uniform, hiding draws it not at all, and clearing puts both back", () => {
  const state = newSatelliteState();
  const low = createSatellites(madeUp("stations", 4, "2026-11-02T12:00:00") as unknown as ElementSet[]);
  const high = createSatellites(madeUp("gps", 3, "2026-11-02T12:00:00") as unknown as ElementSet[]);
  state.groups.set("stations", { satellites: low, color: "#fff", size: 4, orbits: false, visible: true });
  state.groups.set("gps", { satellites: high, color: "#9cf", size: 3, orbits: false, visible: false });
  const local = { children: [] as { visible: boolean; material?: { uniforms?: Record<string, { value: unknown }> }; geometry?: { getAttribute(name: string): { array: Float32Array } | undefined } }[], add(item: unknown) { this.children.push(item as never); }, remove(item: unknown) { this.children = this.children.filter((child) => child !== item); } };
  const layer = createSatelliteLayer(parts(true), local as never, state, () => 1);
  const time = Date.parse("2026-11-02T18:00:00Z");
  state.focus = { name: "gps", others: "dim" };
  layer.update(time, 1, 300);
  const dots = local.children.filter((child) => (child.geometry?.getAttribute("position")?.array.length ?? 0) > 3);
  const of = (count: number) => dots.find((child) => child.geometry!.getAttribute("position")!.array.length === count * 3);
  const stations = of(4);
  const gps = of(3);
  assert.equal(stations?.visible, true, "a shown group stays drawn while another is focused");
  assert.equal(stations?.material?.uniforms?.["groupDim"]?.value, 1, "the other group uses the dim term");
  assert.equal(gps?.visible, true, "the focused group is drawn even when the page had hidden it");
  assert.equal(gps?.material?.uniforms?.["groupDim"]?.value, 0, "the focused group is not dimmed");
  assert.equal(state.groups.get("stations")?.placed, 4);
  assert.equal(state.groups.get("gps")?.placed, 3);
  const made = local.children.length;
  state.focus = { name: "gps", others: "hide" };
  layer.update(time, 1, 300);
  assert.equal(stations?.visible, false, "hide does not draw the other group");
  assert.equal(state.groups.get("stations")?.placed, 0);
  assert.equal(gps?.visible, true);
  state.focus = null;
  layer.update(time, 1, 300);
  assert.equal(stations?.visible, true, "clearing the focus draws a group the page had shown");
  assert.equal(stations?.material?.uniforms?.["groupDim"]?.value, 0);
  assert.equal(gps?.visible, false, "clearing the focus hides a group the page had hidden");
  assert.equal(local.children.length, made, "dimming and hiding add no object");
});
