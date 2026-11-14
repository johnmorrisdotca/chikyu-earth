// Which place a press is on (MODULES-1082): the layer says which of the places it drew as markers is under a point, from the last frame. A place the Earth hides, one gathered into a group, and one past the marker cap
// are not markers of their own, so no press is on them.
import assert from "node:assert/strict";
import test from "node:test";
import { cleanPlaces, orthoView, PLACE_MARKS, type Place } from "../src/markers/index.ts";
import { createPlaceLayer } from "../src/markers/place-layer.ts";

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
  const style: Record<string, unknown> = { setProperty: (name: string, value: string) => void values.set(name, value), removeProperty: (name: string) => void values.delete(name), getPropertyValue: (name: string) => values.get(name) ?? "" };
  Object.defineProperty(style, "transform", { get: () => values.get("transform") ?? "", set: (value: string) => void values.set("transform", value) });
  Object.defineProperty(style, "opacity", { get: () => values.get("opacity") ?? "", set: (value: string) => void values.set("opacity", value) });
  const element: Fake = {
    className: "",
    hidden: false,
    textContent: "",
    dataset: {},
    style,
    children: [],
    ownerDocument: doc,
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
const box = (): HTMLElement => {
  const doc = { createElement: (): Fake => fakeElement(doc) };
  return fakeElement(doc) as unknown as HTMLElement;
};

const TOKYO = { lon: 139.69, lat: 35.69 };
const view = () => orthoView({ lon: TOKYO.lon, lat: TOKYO.lat, radius: 200, cx: 210, cy: 210, width: 420, height: 420 });
const where = (place: Place): { x: number; y: number; facing: number } => {
  const out = { x: 0, y: 0, upX: 0, upY: 0, facing: 0 };
  view().at(place.lon, place.lat, out);
  return out;
};
const PLACES = cleanPlaces([
  { id: "here", lon: TOKYO.lon, lat: TOKYO.lat, label: "You are here", kind: "here" },
  { id: "osaka", lon: 135.5, lat: 34.69, label: "Osaka" },
  { id: "far", lon: TOKYO.lon - 150, lat: -20, label: "Far side" },
]);

test("a press at a place's foot is on that place, and the nearest of two is the one", () => {
  const layer = createPlaceLayer(box());
  layer.set(PLACES);
  layer.frame(view());
  const here = where(PLACES[0]!);
  assert.equal(layer.pick(here.x, here.y, "mouse")?.id, "here");
  const osaka = where(PLACES[1]!);
  assert.equal(layer.pick(osaka.x, osaka.y, "mouse")?.id, "osaka");
  assert.equal(layer.pick(here.x, here.y, "mouse")?.lon, TOKYO.lon, "the place as given");
});

test("the reach is 14 px for a mouse and 22 for a touch, and a stick is pressed along its length as at its foot", () => {
  for (const look of ["beam", "pin", "ring"] as const) {
    const layer = createPlaceLayer(box());
    layer.look = look;
    layer.set(PLACES.slice(0, 1));
    layer.frame(view());
    const here = where(PLACES[0]!);
    assert.equal(layer.pick(here.x + 13, here.y, "mouse")?.id, "here", look);
    assert.equal(layer.pick(here.x + 16, here.y, "mouse"), null, look);
    assert.equal(layer.pick(here.x + 16, here.y, "touch")?.id, "here", look);
    assert.equal(layer.pick(here.x + 24, here.y, "touch"), null, look);
    // half way up the stick (beam and pin), a point that is 30 px from the foot
    if (look !== "ring") assert.equal(layer.pick(here.x, here.y - 30, "mouse")?.id, "here", look);
    else assert.equal(layer.pick(here.x, here.y - 30, "mouse"), null, look);
  }
});

test("a place the Earth hides is not pressed, and nothing is pressed before a frame or after the places are cleared", () => {
  const layer = createPlaceLayer(box());
  layer.set(PLACES);
  assert.equal(layer.pick(210, 210, "mouse"), null, "no frame yet");
  layer.frame(view());
  const far = where(PLACES[2]!);
  assert.ok(far.facing < 0, "the far side");
  assert.equal(layer.pick(far.x, far.y, "mouse"), null);
  const here = where(PLACES[0]!);
  layer.frame(null);
  assert.equal(layer.pick(here.x, here.y, "mouse"), null, "the Earth is not in the picture");
  layer.frame(view());
  layer.set([]);
  layer.frame(view());
  assert.equal(layer.pick(here.x, here.y, "mouse"), null, "no places");
});

test("places gathered into a group are not pressed, and are once place-groups is off", () => {
  const crowd = cleanPlaces(Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, lon: TOKYO.lon + i * 0.01, lat: TOKYO.lat + i * 0.01 })));
  const grouped = createPlaceLayer(box());
  grouped.set(crowd);
  grouped.frame(view());
  assert.ok(grouped.stats.groups > 0, "gathered");
  const at = where(crowd[0]!);
  assert.equal(grouped.pick(at.x, at.y, "mouse"), null);
  const single = createPlaceLayer(box());
  single.grouping = false;
  single.set(crowd);
  single.frame(view());
  assert.ok(single.pick(at.x, at.y, "mouse") !== null);
});

test("a place past the marker cap is not pressed", () => {
  let seed = 863;
  const random = (): number => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const crowd = cleanPlaces(Array.from({ length: 300 }, (_, i) => ({ id: `p${i}`, lon: TOKYO.lon + (random() - 0.5) * 110, lat: TOKYO.lat + (random() - 0.5) * 80 })));
  const layer = createPlaceLayer(box());
  layer.grouping = false;
  layer.set(crowd);
  layer.frame(view());
  assert.equal(layer.stats.marks, PLACE_MARKS);
  const drawn = crowd.slice(0, PLACE_MARKS);
  const left = crowd.slice(PLACE_MARKS).filter((place) => {
    const at = where(place);
    return at.facing > 0.3 && drawn.every((one) => Math.hypot(where(one).x - at.x, where(one).y - at.y) > 40);
  });
  assert.ok(left.length > 0, "a place with no marker, away from the markers");
  for (const place of left) {
    const at = where(place);
    assert.equal(layer.pick(at.x, at.y, "mouse"), null, place.id);
  }
  const first = where(drawn[0]!);
  assert.equal(layer.pick(first.x, first.y, "mouse")?.id, "p0");
});
