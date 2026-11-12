import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSatelliteLayer, newSatelliteState } from "../src/space/satellite-layer.ts";
import { createSatellites, MAX_SATELLITE_SPEED, type ElementSet } from "../src/satellites/index.ts";

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
