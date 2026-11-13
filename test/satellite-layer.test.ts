import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSatelliteLayer, CROWD_COVER_DOTS, CROWD_COVER_STREAKS, crowdFade, DEFAULT_STREAK_MAX, markWeight, newSatelliteState, readStreakMax, STREAK_REACH } from "../src/space/satellite-layer.ts";
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
  opacity = 1;
  color = { value: "#ffffff", set(value: string) { this.value = value; return this; } };
  constructor(options: { uniforms?: Record<string, { value: unknown }>; opacity?: number; color?: string } = {}) {
    this.uniforms = options.uniforms ?? {};
    if (options.opacity !== undefined) this.opacity = options.opacity;
    if (options.color !== undefined) this.color.value = options.color;
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

test("the orbit under the pointer is computed once, at about a third of the chosen orbit's brightness, and it goes when the pointer leaves", () => {
  const local = { children: [] as { name?: string; visible: boolean; geometry?: Geo; material?: { opacity: number } }[], add(item: { name?: string; visible: boolean }) { this.children.push(item); }, remove(item: unknown) { this.children = this.children.filter((child) => child !== item); } };
  const state = newSatelliteState();
  const group = createSatellites(stations);
  const orbit = group.orbit.bind(group);
  const orbits: number[] = [];
  group.orbit = (index, ms, points) => {
    orbits.push(index);
    return orbit(index, ms, points);
  };
  state.groups.set("stations", { satellites: group, color: "#fff", size: 4, orbits: false, visible: true });
  const layer = createSatelliteLayer(parts(true), local as never, state, () => 1);
  const time = Date.parse("2026-11-02T18:00:00Z");
  layer.update(time, 0, 300);
  const hover = state as unknown as { hover: { ref: { group: string; index: number } | null; fade: number; enabled: boolean; color: string; opacity: number } };
  const drawn = state.drawn as unknown as { hoverPath?: boolean; hoverOpacity?: number; selectedOpacity?: number };
  hover.hover = { ref: { group: "stations", index: 0 }, fade: 1, enabled: true, color: "#ffffff", opacity: 0.85 / 3 };
  const before = orbits.length;
  layer.update(time, 0, 300);
  assert.deepEqual(orbits.slice(before), [0], "the path is computed once when the pointer comes to rest");
  assert.equal(drawn.hoverPath, true, "the faint orbit is drawn");
  assert.ok((drawn.hoverOpacity ?? 0) > 0);
  assert.ok((drawn.hoverOpacity ?? 1) < 0.85, "fainter than the chosen orbit");
  assert.ok(Math.abs((drawn.hoverOpacity ?? 0) * 3 - 0.85) < 0.02, "about a third of the brightness");
  const line = local.children.find((child) => child.name === "hover-path");
  assert.ok(line, "one hover path");
  const positions = (line.geometry!.getAttribute("position") as Attribute).array;
  const again = orbit(0, time, positions.length / 3);
  for (let i = 0; i < positions.length; i += 1) assert.equal(positions[i], again[i], `point ${i}`);
  layer.update(time + 120_000, 0, 300);
  assert.equal(orbits.length, before + 1, "a still pointer does not compute the path again");
  state.selected = { group: "stations", index: 0 };
  layer.update(time, 0, 300);
  assert.equal(drawn.hoverPath, false, "a chosen orbit is not covered by a second one");
  assert.ok((drawn.selectedOpacity ?? 0) > (drawn.hoverOpacity ?? 1));
  state.selected = { group: "stations", index: 1 };
  hover.hover.ref = { group: "stations", index: 0 };
  hover.hover.fade = 1;
  layer.update(time, 0, 300);
  assert.equal(drawn.hoverPath, true);
  assert.deepEqual(orbits.slice(before), [0, 0, 1], "the two later paths are the chosen satellite's; the one under the pointer is not computed again");
  hover.hover.fade = 0;
  hover.hover.ref = null;
  layer.update(time, 0, 300);
  assert.equal(drawn.hoverPath, false, "leaving takes the path away");
  assert.equal(local.children.filter((child) => child.name === "hover-path").length, 1, "twenty hovers would still be the one line");
});

/** The longest streak, in CSS pixels, after a run of frames `frameMs` of wall time apart at `speed`, with the Earth `radius` pixels across its radius and the cap `max`. */
const longestAfter = (speed: number, frameMs: number, radius: number, max: number): number => {
  const state = newSatelliteState();
  state.streakMax = max;
  const round = stations.filter((set) => set.ECCENTRICITY < 0.02);
  state.groups.set("stations", { satellites: createSatellites(round), color: "#fff", size: 4, orbits: false, visible: true });
  const layer = createSatelliteLayer(parts(true), scene as never, state, () => 1);
  const time = Date.parse("2026-11-02T18:00:00Z");
  for (let frame = 0; frame < 4; frame += 1) layer.update(time + frame * speed * frameMs, speed, radius);
  return state.drawn.longestStreakPx;
};

test("the streak is the same length whether the frames come every 33 or every 200 milliseconds, capped or not", () => {
  for (const [speed, max] of [[120, DEFAULT_STREAK_MAX], [600, DEFAULT_STREAK_MAX], [3600, DEFAULT_STREAK_MAX], [86_400, DEFAULT_STREAK_MAX], [120, 0], [3600, 0]] as const) {
    const quick = longestAfter(speed, 33, 300, max);
    const slow = longestAfter(speed, 200, 300, max);
    assert.ok(quick > 0, `${speed} times: a streak is drawn`);
    assert.ok(Math.abs(quick - slow) / quick < 0.001, `${speed} times, cap ${max}: ${quick.toFixed(3)} px at 33 ms against ${slow.toFixed(3)} px at 200 ms`);
  }
});

/** The cap on the screen: a share of the Earth's drawn radius, with the pixel ceiling. */
const capOf = (radius: number, max: number): number => Math.min(max, STREAK_REACH * radius);

test("the longest streak on the screen is the cap at an hour and a day a second, and keeps the 10-minutes-a-second look", () => {
  const ten = longestAfter(600, 33, 300, DEFAULT_STREAK_MAX);
  assert.ok(ten > 5 && ten <= capOf(300, DEFAULT_STREAK_MAX), `10 minutes a second on a whole Earth: ${ten.toFixed(1)} px`);
  assert.equal(ten, longestAfter(600, 33, 300, 0), "the cap does not touch the 10-minutes-a-second look");
  for (const speed of [3600, 86_400]) {
    const capped = longestAfter(speed, 33, 300, DEFAULT_STREAK_MAX);
    assert.ok(Math.abs(capped - capOf(300, DEFAULT_STREAK_MAX)) < 0.02 * DEFAULT_STREAK_MAX, `${speed} times: ${capped.toFixed(2)} px against a cap of ${capOf(300, DEFAULT_STREAK_MAX)}`);
    assert.ok(longestAfter(speed, 33, 300, 0) > 3 * DEFAULT_STREAK_MAX, `${speed} times with no cap: the stretch is long`);
  }
  assert.ok(Math.abs(longestAfter(3600, 33, 900, 20) - 20) < 0.4, "a page that asks for a ceiling of 20 pixels gets 20 on a large Earth");
  assert.ok(Math.abs(longestAfter(3600, 33, 300, 20) - STREAK_REACH * 300) < 0.2, "and the share of the radius on a smaller one");
});

test("the streak shrinks with the Earth's drawn size: a share of its radius, a few pixels on a whole Earth and a dot on a tiny one", () => {
  const sizes = [210, 105, 42, 10] as const;
  const long = sizes.map((radius) => longestAfter(3600, 33, radius, DEFAULT_STREAK_MAX));
  const slow = sizes.map((radius) => longestAfter(600, 33, radius, DEFAULT_STREAK_MAX));
  sizes.forEach((radius, i) => {
    assert.ok(Math.abs(long[i]! - STREAK_REACH * radius) < 0.02 * STREAK_REACH * radius + 0.01, `an hour a second, Earth radius ${radius} px: ${long[i]!.toFixed(2)} px against ${(STREAK_REACH * radius).toFixed(2)}`);
    assert.ok(slow[i]! <= long[i]! + 1e-9 && slow[i]! <= STREAK_REACH * radius + 1e-9, "10 minutes a second is never longer than the cap either");
  });
  assert.ok(Math.abs(long[1]! / long[0]! - 0.5) < 0.02, "half the Earth, half the streak");
  assert.ok(Math.abs(long[2]! / long[0]! - 0.2) < 0.02, "a fifth of the Earth, a fifth of the streak");
  assert.ok(long[3]! < 0.5, "a tiny Earth: the streak is a dot");
});

test("the marks lose weight as the Earth is drawn smaller: full from 150 pixels, none at 40, fainter streaks and no dark rim", () => {
  assert.equal(markWeight(210), 1);
  assert.equal(markWeight(150), 1);
  assert.equal(markWeight(40), 0);
  assert.equal(markWeight(5), 0);
  assert.ok(markWeight(105) > 0.4 && markWeight(105) < 0.8);
  assert.ok(markWeight(60) < markWeight(80) && markWeight(80) < markWeight(120), "it only grows with the size");
  const state = newSatelliteState();
  const rims: number[] = [];
  const opacities: number[] = [];
  const round = stations.filter((set) => set.ECCENTRICITY < 0.02);
  state.groups.set("stations", { satellites: createSatellites(round), color: "#fff", size: 4, orbits: false, visible: true });
  const layer = createSatelliteLayer(parts(true), scene as never, state, () => 1);
  const time = Date.parse("2026-11-02T18:00:00Z");
  for (const radius of [210, 105, 42]) {
    layer.update(time, 600, radius);
    const entries = scene.children as { material?: { uniforms?: { rim?: { value: number } }; opacity?: number } }[];
    const dots = [...entries].reverse().find((child) => child.material?.uniforms?.rim && child.material.uniforms.rim.value !== undefined && (child.material.uniforms as { ring?: { value: number } }).ring?.value === 0);
    rims.push(dots!.material!.uniforms!.rim!.value);
    opacities.push(state.drawn.weight);
  }
  assert.deepEqual(rims, opacities, "the dots' rim follows the same weight");
  assert.ok(rims[0]! === 1 && rims[1]! < 1 && rims[2]! < 0.1, `rim at three sizes: ${rims.map((r) => r.toFixed(2)).join(", ")}`);
});

test("satellite-streak-max reads a number of pixels, off or 0 for none, and anything else is the default", () => {
  assert.equal(readStreakMax(null), DEFAULT_STREAK_MAX);
  assert.equal(readStreakMax(""), DEFAULT_STREAK_MAX);
  assert.equal(readStreakMax("12"), 12);
  assert.equal(readStreakMax("2.5"), 2.5);
  assert.equal(readStreakMax("0"), 0);
  assert.equal(readStreakMax("off"), 0);
  assert.equal(readStreakMax(" OFF "), 0);
  assert.equal(readStreakMax("-3"), DEFAULT_STREAK_MAX);
  assert.equal(readStreakMax("wide"), DEFAULT_STREAK_MAX);
  assert.equal(newSatelliteState().streakMax, DEFAULT_STREAK_MAX);
});

test("a crowd of marks is drawn fainter on a small Earth, in proportion to what they would cover, and not at all on a whole one", () => {
  const dot = (radius: number, marks = 18_252): number => crowdFade(marks, (2 * Math.max(0.45, Math.min(1, radius / 205))) ** 2, radius, CROWD_COVER_DOTS);
  assert.equal(dot(205), 1, "16,000 satellites on a whole Earth are drawn as ever");
  assert.equal(dot(150), 1);
  assert.equal(crowdFade(20, 4, 41, CROWD_COVER_DOTS), 1, "twenty stations on a small Earth are not a crowd");
  assert.ok(dot(103) < 1 && dot(103) > dot(41), "half the Earth: partly faded");
  assert.ok(dot(41) < 0.1, `a fifth of the Earth: ${dot(41).toFixed(3)}`);
  const streak = (radius: number): number => crowdFade(18_252, Math.max(1, 0.025 * radius), radius, CROWD_COVER_STREAKS, false);
  assert.ok(streak(205) > 0.95, `16,000 streaks on a whole Earth: ${streak(205).toFixed(2)}`);
  assert.ok(streak(103) < streak(205) && streak(41) < streak(103), "the smaller the Earth, the fainter the crowd");
  assert.ok(streak(41) < 0.25);
  assert.ok(streak(41) >= dot(41), "streaks are allowed more cover than dots");
  assert.equal(crowdFade(20, 4, 41, CROWD_COVER_STREAKS, false), 1, "a few streaks are not a crowd at any size");
  assert.equal(crowdFade(0, 4, 41, CROWD_COVER_DOTS), 1);
  assert.equal(crowdFade(100, 4, 0, CROWD_COVER_DOTS), 1);
});
