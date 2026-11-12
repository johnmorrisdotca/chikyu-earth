import test from "node:test";
import assert from "node:assert/strict";
import { cleanPlaces, orthoView, PLACE_DOTS, PLACE_MARKS, readPlaceGroups } from "../src/markers/index.ts";
import { createPlaceLayer, PLACE_STYLE, placesUnavailableEvent } from "../src/markers/place-layer.ts";
import { createPlaceRings, type PlaceSprites, type PlaceSpriteData } from "../src/markers/place-sprites.ts";

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
  const style: Record<string, unknown> = {
    setProperty: (name: string, value: string) => void values.set(name, value),
    removeProperty: (name: string) => void values.delete(name),
    getPropertyValue: (name: string) => values.get(name) ?? "",
  };
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
  assert.equal(stats.sprites, dots);

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
  assert.equal(visible(box, "pl-dot"), layer.stats.sprites);

  // nothing left on the page once the places go
  layer.set([]);
  layer.frame(view());
  assert.equal(visible(box, "pl-dot"), 0);
  assert.equal(layer.stats.omitted, 0);
});

test("the circles take no compositor layer of their own: a page with 600 of them would have 600", () => {
  const rule = /\.pl-dot\{[^}]*\}/.exec(PLACE_STYLE)?.[0] ?? "";
  assert.ok(rule.includes("position:absolute"), "the rule for the circles is there");
  assert.ok(!rule.includes("will-change"), rule);
});

test("a picture at rest writes nothing to the circles, and one that moved writes only the circles that moved", () => {
  const box = fakeBox();
  const layer = createPlaceLayer(box as unknown as HTMLElement);
  layer.ringsInPicture = false;
  layer.grouping = false;
  layer.set(crowd(300));
  layer.frame(view());
  const dots = box.children.filter((child) => child.className === "pl-dot" && !child.hidden);
  assert.ok(dots.length > 100);
  let writes = 0;
  for (const dot of dots) {
    let value = dot.style["transform"];
    Object.defineProperty(dot.style, "transform", { get: () => value, set: (next: string) => { writes += 1; value = next; } });
  }
  layer.frame(view());
  layer.frame(view());
  assert.equal(writes, 0, "the same picture, the same places: no write");
  const moved = orthoView({ lon: TOKYO.lon + 0.5, lat: TOKYO.lat, radius: 200, cx: 210, cy: 210, width: 420, height: 420 });
  layer.frame(moved);
  assert.ok(writes > 0, "a turn of the Earth moves them");
  assert.ok(writes <= dots.length, "each written at most once");
});

test("without Points each group's place is asked of the view once a frame, not once to see it and again to draw it", () => {
  const box = fakeBox();
  const layer = createPlaceLayer(box as unknown as HTMLElement);
  layer.ringsInPicture = false;
  layer.grouping = false;
  const places = crowd(500);
  layer.set(places);
  const base = view();
  let asked = 0;
  const counting = { ...base, at: (lon: number, lat: number, out: Parameters<typeof base.at>[2]) => { asked += 1; return base.at(lon, lat, out); } };
  layer.frame(counting);
  asked = 0;
  layer.frame(counting);
  assert.ok(layer.stats.sprites > 100, "there are circles to place");
  // the markers' own layout asks for its few places; every other place was asked for once
  assert.ok(asked <= places.length + PLACE_MARKS, `${asked} lookups for ${places.length} places and at most ${PLACE_MARKS} markers`);
});

test("the page is told once, and only when a place in sight had no room for a circle", () => {
  const told: number[] = [];
  const box = fakeBox();
  const layer = createPlaceLayer(box as unknown as HTMLElement);
  layer.onOmitted = (omitted) => told.push(omitted);
  // the picture draws the rings: nothing is lost, nobody is told
  layer.set(crowd(2000));
  layer.grouping = false;
  layer.frame(view());
  assert.deepEqual(told, []);
  // no Points but the room is enough: every place drawn, nobody is told
  layer.ringsInPicture = false;
  layer.set(crowd(300));
  layer.frame(view());
  assert.equal(layer.stats.omitted, 0);
  assert.deepEqual(told, []);
  // more in sight than the circles' room: told, once, however many frames follow
  layer.set(crowd(2000));
  layer.frame(view());
  layer.frame(view());
  layer.frame(view());
  assert.equal(told.length, 1);
  assert.equal(told[0], layer.stats.omitted);
  assert.ok(told[0]! > 0);
});

test("the event says what was lost and the room the circles have", () => {
  const event = placesUnavailableEvent(40);
  assert.equal(event.type, "chikyu-places-unavailable");
  assert.equal(event.detail.omitted, 40);
  assert.ok(event.detail.reason.includes(String(PLACE_DOTS)), "the room comes from PLACE_DOTS, not a number typed again");
  assert.ok(event.detail.reason.includes("40"));
});

/** Rings the test can count: made from a stand-in for the three.js parts, with or without `Points`. */
const data: PlaceSpriteData = { version: 1, count: 0, points: new Float32Array(0), colors: [], shapesVersion: 1, shapes: new Float32Array(0) };
const fakeSprites = (log: string[]): PlaceSprites => ({ sync: () => void log.push("sync"), dispose: () => void log.push("dispose") });

test("the picture makes its rings once, on the first draw that has data, and tells the page once whether it could", () => {
  const log: string[] = [];
  const told: boolean[] = [];
  let made = 0;
  const rings = createPlaceRings(() => { made += 1; return fakeSprites(log); }, (drawn) => told.push(drawn));
  rings.sync(null, 1, 400, 300, true);
  assert.equal(made, 0, "nothing wanted, nothing made");
  assert.deepEqual(told, []);
  rings.sync(data, 1, 400, 300, true);
  rings.sync(data, 1, 400, 300, true);
  rings.sync(null, 1, 400, 300, true);
  rings.sync(data, 1, 400, 300, false);
  assert.equal(made, 1);
  assert.deepEqual(told, [true]);
  assert.equal(log.filter((entry) => entry === "sync").length, 4, "the rings are synced at every draw after they are made");
  rings.dispose();
  assert.deepEqual(log.filter((entry) => entry === "dispose"), ["dispose"]);
});

test("without Points the picture tries once, tells the page once, and never tries or tells again", () => {
  const told: boolean[] = [];
  let tried = 0;
  const rings = createPlaceRings(() => { tried += 1; return null; }, (drawn) => told.push(drawn));
  for (let i = 0; i < 20; i += 1) rings.sync(data, 1, 400, 300, true);
  assert.equal(tried, 1);
  assert.deepEqual(told, [false]);
  assert.doesNotThrow(() => rings.dispose());
  // no listener is fine
  const quiet = createPlaceRings(() => null);
  assert.doesNotThrow(() => quiet.sync(data, 1, 400, 300, true));
});
