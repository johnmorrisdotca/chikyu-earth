import test from "node:test";
import assert from "node:assert/strict";
import { cleanPlaces, orthoView, PLACE_DOTS, PLACE_MARKS, readPlaceGroups } from "../src/markers/index.ts";
import { createPlaceLayer, PLACE_STYLE, placesLostNotice } from "../src/markers/place-layer.ts";
import { beginPlaceSprites } from "../src/markers/place-sprites.ts";

// Just enough of a page for the places' layer: elements that take attributes, children, a style and a size.
interface Fake {
  className: string;
  hidden: boolean;
  textContent: string;
  dataset: Record<string, string>;
  style: Record<string, unknown>;
  children: Fake[];
  ownerDocument: { createElement(tag: string): Fake };
  [key: string]: unknown;
}
function fakeElement(doc: { createElement(tag: string): Fake }): Fake {
  const values = new Map<string, string>();
  let transformWrites = 0;
  const style: Record<string, unknown> = {
    setProperty: (name: string, value: string) => void values.set(name, value),
    removeProperty: (name: string) => void values.delete(name),
    getPropertyValue: (name: string) => values.get(name) ?? "",
  };
  Object.defineProperty(style, "transform", {
    get: () => values.get("transform") ?? "",
    set: (value: string) => {
      transformWrites += 1;
      values.set("transform", value);
    },
  });
  Object.defineProperty(style, "opacity", {
    get: () => values.get("opacity") ?? "",
    set: (value: string) => void values.set("opacity", value),
  });
  const element: Fake = {
    className: "",
    hidden: false,
    textContent: "",
    dataset: {},
    style,
    children: [],
    ownerDocument: doc,
    transformWrites: () => transformWrites,
    setAttribute() {},
    toggleAttribute() {},
    append(...nodes: Fake[]) {
      element.children.push(...nodes);
    },
    replaceChildren() {
      element.children.length = 0;
    },
    getBoundingClientRect: () => ({ width: 40, height: 16 }),
    classList: { toggle() {} },
  };
  return element;
}
function fakeBox(): Fake {
  const doc = { createElement: (): Fake => fakeElement(doc) };
  return fakeElement(doc);
}
const visible = (box: Fake, className: string): number => box.children.filter((child) => child.className === className && !child.hidden).length;

const TOKYO = { lon: 139.69, lat: 35.69 };
const crowd = (n: number) => {
  let seed = 863;
  const random = (): number => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  return cleanPlaces(Array.from({ length: n }, (_, i) => ({ id: `p${i}`, lon: TOKYO.lon + (random() - 0.5) * 30, lat: TOKYO.lat + (random() - 0.5) * 24, label: `Place ${i}` })));
};
const view = () => orthoView({ lon: TOKYO.lon, lat: TOKYO.lat, radius: 200, cx: 210, cy: 210, width: 420, height: 420 });

test("place-groups: on unless it says off", () => {
  assert.equal(readPlaceGroups(null), true);
  assert.equal(readPlaceGroups(""), true);
  assert.equal(readPlaceGroups("on"), true);
  assert.equal(readPlaceGroups("off"), false);
  assert.equal(readPlaceGroups(" OFF "), false);
});

test("places gather into groups by default, and place-groups=off leaves every place its own ring", () => {
  const places = crowd(800);
  const grouped = createPlaceLayer(fakeBox() as unknown as HTMLElement);
  grouped.set(places);
  grouped.frame(view());
  assert.equal(grouped.grouping, true);
  assert.ok(grouped.stats.groups > 0, "the crowd is gathered");
  const gatheredRings = grouped.stats.sprites;

  const single = createPlaceLayer(fakeBox() as unknown as HTMLElement);
  single.grouping = false;
  single.set(places);
  single.frame(view());
  assert.equal(single.stats.groups, 0, "no group with the switch off");
  assert.ok(single.stats.sprites > gatheredRings, "every place keeps a ring of its own");
  assert.equal(single.stats.marks + single.stats.sprites, single.stats.shown, "every place in sight is a marker or a ring");

  // the switch can be turned while the layer is on the page
  grouped.grouping = false;
  grouped.frame(view());
  assert.equal(grouped.stats.groups, 0);
  grouped.grouping = true;
  grouped.frame(view());
  assert.ok(grouped.stats.groups > 0);
});

test("with the picture's rings, the layer draws none itself and omits nothing", () => {
  const box = fakeBox();
  const layer = createPlaceLayer(box as unknown as HTMLElement);
  layer.set(crowd(800));
  layer.frame(view());
  assert.equal(layer.ringsInPicture, true);
  assert.equal(visible(box, "pl-dot"), 0);
  assert.equal(layer.stats.omitted, 0);
});

test("without Points every place in sight is still drawn: as a small circle in the page, up to PLACE_DOTS, and the rest counted, never dropped quietly", () => {
  const box = fakeBox();
  const layer = createPlaceLayer(box as unknown as HTMLElement);
  layer.ringsInPicture = false;
  layer.grouping = false;
  layer.set(crowd(2000));
  layer.frame(view());
  const dots = visible(box, "pl-dot");
  const stats = layer.stats;
  assert.ok(stats.marks <= PLACE_MARKS);
  assert.equal(dots, PLACE_DOTS, "the circles fill their room");
  assert.ok(stats.omitted > 0, "there are more in sight than the room");
  assert.equal(stats.marks + dots + stats.omitted, stats.shown, "markers, circles and the counted rest are every place in sight");
  assert.equal(stats.sprites, 0, "the circles are not the picture's one draw call");
  assert.equal(stats.dots, dots);

  // with the crowd thinner than the room, all are drawn and none is counted as lost
  layer.set(crowd(300));
  layer.frame(view());
  assert.equal(layer.stats.omitted, 0);
  assert.equal(layer.stats.marks + visible(box, "pl-dot"), layer.stats.shown);

  // gathered, a group is one circle with its count
  layer.grouping = true;
  layer.set(crowd(800));
  layer.frame(view());
  assert.ok(layer.stats.groups > 0);
  assert.equal(layer.stats.omitted, 0);
  assert.equal(visible(box, "pl-dot"), layer.stats.dots);
  assert.equal(layer.stats.sprites, 0);

  // nothing left on the page once the places go
  layer.set([]);
  layer.frame(view());
  assert.equal(visible(box, "pl-dot"), 0);
  assert.equal(layer.stats.omitted, 0);
});

test("a fallback circle does not take a compositor layer, and a frame that does not move it writes nothing", () => {
  assert.equal(/\.pl-dot\{[^}]*will-change/.test(PLACE_STYLE), false);
  const box = fakeBox();
  const layer = createPlaceLayer(box as unknown as HTMLElement);
  layer.ringsInPicture = false;
  layer.grouping = false;
  layer.set(crowd(40));
  layer.frame(view());
  const dot = box.children.find((child) => child.className === "pl-dot" && !child.hidden);
  assert.ok(dot, "a place past the markers is a circle");
  const writes = dot.transformWrites as () => number;
  const before = writes();
  layer.frame(view());
  assert.equal(writes(), before, "the same place is not written again");
});

test("a fallback circle fades toward the limb and is dimmer at night", () => {
  const box = fakeBox();
  const layer = createPlaceLayer(box as unknown as HTMLElement);
  layer.ringsInPicture = false;
  layer.grouping = false;
  const seen = view();
  const probe = { x: 0, y: 0, upX: 0, upY: 0, facing: 0 };
  const limbLat = -50;
  seen.at(TOKYO.lon, limbLat, probe);
  assert.ok(probe.facing > 0.04 && probe.facing < 0.1, "a place near the edge is in the view");
  layer.set([...crowd(40), { id: "limb", lon: TOKYO.lon, lat: limbLat, label: "Limb" }]);
  layer.frame(seen, [], [], { lon: TOKYO.lon, lat: TOKYO.lat });
  const day = box.children.find((child) => child.className === "pl-dot");
  assert.equal(day?.style["opacity"], "0.90");
  seen.at(TOKYO.lon, limbLat, probe);
  const limb = box.children.find((child) => child.className === "pl-dot" && String(child.style["transform"]).startsWith(`translate(${probe.x.toFixed(1)}`));
  assert.ok(limb, "the place near the edge is a circle");
  assert.ok(Number(limb.style["opacity"]) < 0.7, "it fades toward the edge");
  layer.frame(seen, [], [], { lon: TOKYO.lon + 180, lat: -TOKYO.lat });
  const night = box.children.find((child) => child.className === "pl-dot" && !child.hidden);
  assert.ok(Number(night?.style["opacity"]) < 0.6, "night is about half");
});

test("chikyu-places-unavailable is told once, and only when a place is left out", () => {
  const state = { told: false };
  assert.equal(placesLostNotice(state, 0), null);
  assert.equal(state.told, false);
  const detail = placesLostNotice(state, 4);
  assert.ok(detail);
  assert.equal(detail.reason.includes(String(PLACE_DOTS)), true);
  assert.equal(detail.reason.includes("600") && PLACE_DOTS === 600, true);
  assert.equal(placesLostNotice(state, 4), null, "a later frame says nothing");
});

test("the place rings are tried once: no data is not a try, and a failure is not asked again", () => {
  const state: { sprites: null; tried: boolean } = { sprites: null, tried: false };
  const data = { version: 1, count: 1, points: new Float32Array(3), colors: ["#ffd27a"], shapesVersion: 1, shapes: new Float32Array(2) };
  let made = 0;
  assert.equal(beginPlaceSprites(state, null, () => { made += 1; return null; }), false);
  assert.equal(state.tried, false);
  assert.equal(beginPlaceSprites(state, data, () => { made += 1; return null; }), true);
  assert.equal(beginPlaceSprites(state, data, () => { made += 1; return null; }), false);
  assert.equal(made, 1);
});
