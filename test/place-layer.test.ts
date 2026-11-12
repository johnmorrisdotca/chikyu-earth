import test from "node:test";
import assert from "node:assert/strict";
import { cleanPlaces, orthoView, PLACE_DOTS, PLACE_MARKS, readPlaceGroups } from "../src/markers/index.ts";
import { createPlaceLayer } from "../src/markers/place-layer.ts";

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
