// The rule across layers (MODULES-1072): the layers lay their names out in a fixed order (places, markers, cities, stars) and each keeps clear of the boxes of those before it, so after placement no two boxes of different layers intersect.
import assert from "node:assert/strict";
import { test } from "node:test";
import { layoutCities, type CityFrame, type NamedCity } from "../src/cities/geometry.ts";
import { placeLabels } from "../src/markers/labels.ts";
import type { SkyFrame } from "../src/sky/frame.ts";
import { createSkyHost } from "../src/sky/host.ts";

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}
const meet = (a: Box, b: Box): boolean => a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
const crossing = (first: readonly Box[], second: readonly Box[]): number => first.reduce((sum, a) => sum + second.filter((b) => meet(a, b)).length, 0);

const SIZE = 400;
/** A crowd of dots all about the middle of the picture: every layer wants the same ground. */
const dots = (count: number, seed: number): { x: number; y: number; r: number; w: number; h: number; priority: number }[] =>
  Array.from({ length: count }, (_, i) => ({ x: 120 + ((i * 37 + seed * 11) % 160), y: 120 + ((i * 53 + seed * 7) % 160), r: 4, w: 54 + ((i * 13) % 30), h: 16, priority: count - i }));

test("markers' labels keep clear of the boxes the places took: none of the two layers' boxes intersect", () => {
  const places = dots(30, 1);
  const placed = placeLabels(places, SIZE, SIZE, 30);
  const placeBoxes: Box[] = placed.map((p) => ({ left: p.left, top: p.top, width: places[p.item]!.w, height: places[p.item]!.h }));
  assert.ok(placeBoxes.length > 5, "the places have names");
  const markers = dots(30, 2);
  const free = placeLabels(markers, SIZE, SIZE, 30, 64, placeBoxes);
  const markerBoxes: Box[] = free.map((p) => ({ left: p.left, top: p.top, width: markers[p.item]!.w, height: markers[p.item]!.h }));
  assert.ok(markerBoxes.length > 0, "some markers are still named");
  assert.equal(crossing(placeBoxes, markerBoxes), 0, "no marker label over a place's name");
  // without the places' boxes the same markers do cross them: the rule is what keeps them apart
  const alone = placeLabels(markers, SIZE, SIZE, 30);
  const aloneBoxes: Box[] = alone.map((p) => ({ left: p.left, top: p.top, width: markers[p.item]!.w, height: markers[p.item]!.h }));
  assert.ok(crossing(placeBoxes, aloneBoxes) > 0, "told of nothing, the layers cross");
});

test("cities' names keep clear of the places' and the markers' boxes, in that order", () => {
  const places = dots(20, 3);
  const placeBoxes: Box[] = placeLabels(places, SIZE, SIZE, 20).map((p) => ({ left: p.left, top: p.top, width: places[p.item]!.w, height: places[p.item]!.h }));
  const markers = dots(20, 4);
  const markerBoxes: Box[] = placeLabels(markers, SIZE, SIZE, 20, 64, placeBoxes).map((p) => ({ left: p.left, top: p.top, width: markers[p.item]!.w, height: markers[p.item]!.h }));
  const frame: CityFrame = {
    width: SIZE,
    height: SIZE,
    radius: 190,
    project(lon: number, lat: number, out: { x: number; y: number }) {
      out.x = 120 + (lon % 160);
      out.y = 120 + (lat % 160);
      return 1;
    },
  };
  const cities: NamedCity[] = Array.from({ length: 40 }, (_, i) => ({ id: `Q${i}`, name: { en: `City number ${i}` }, lat: (i * 53) % 160, lon: (i * 37) % 160, population: 1_000_000 - i, capital: "none" as never }));
  const taken = [...placeBoxes, ...markerBoxes];
  const named = layoutCities(cities, frame, "en", { max: 40, size: 12, dot: 3, taken });
  assert.ok(named.length > 0, "cities are still named");
  const cityBoxes: Box[] = named.map((n) => ({ left: n.left, top: n.top, width: n.width, height: n.height }));
  assert.equal(crossing(taken, cityBoxes), 0, "no city name over a place's or a marker's box");
  const alone = layoutCities(cities, frame, "en", { max: 40, size: 12, dot: 3 }).map((n) => ({ left: n.left, top: n.top, width: n.width, height: n.height }));
  assert.ok(crossing(taken, alone) > 0, "told of nothing, the layers cross");
});

// a fake page for the star names' layer, as the sky host's own test has it
interface FakeNode {
  style: { setProperty(): void; removeProperty(): void };
  hidden: boolean;
  textContent: string;
  className: string;
  width: number;
  height: number;
  append(...nodes: FakeNode[]): void;
  remove(): void;
  setAttribute(): void;
  getContext(): unknown;
  addEventListener(): void;
  getBoundingClientRect(): { left: number; top: number; right: number; bottom: number; width: number; height: number };
}
const context = new Proxy({}, { get: () => () => undefined, set: () => true });
let made = 0;
const element = (): FakeNode => {
  const index = made;
  made += 1;
  // each name on its own patch of the picture, 120 by 18
  const left = (index % 3) * 130;
  const top = Math.floor(index / 3) * 24;
  return { style: { setProperty() {}, removeProperty() {} }, hidden: false, textContent: "", className: "", width: 0, height: 0, append() {}, remove() {}, setAttribute() {}, getContext: () => context, addEventListener() {}, getBoundingClientRect: () => ({ left, top, right: left + 120, bottom: top + 18, width: 120, height: 18 }) };
};
const doc = { createElement: element, addEventListener() {}, removeEventListener() {} };
const root = { ownerDocument: doc, append() {}, host: { addEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0 }) } } as unknown as ShadowRoot;
const frame: SkyFrame = {
  width: SIZE,
  height: SIZE,
  discs: [],
  project(ra, dec, out) {
    out.x = 200 + 150 * Math.cos(dec * (Math.PI / 180)) * Math.sin(ra * (Math.PI / 180));
    out.y = 200 - 150 * Math.sin(dec * (Math.PI / 180));
    return Math.cos(dec * (Math.PI / 180)) * Math.cos(ra * (Math.PI / 180)) > -0.9;
  },
};
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

test("star names keep clear of the boxes the layers before them took, are laid out again when those move between draws, and nothing is laid out at rest", async () => {
  made = 0;
  let taken: Box[] = [];
  const host = createSkyHost({ root, attribute: (name) => (name === "star-names" ? "12" : null), language: () => "en", onError: (error) => assert.fail(String(error)), loadFont: async () => undefined, taken: () => taken });
  host.frame(frame);
  for (let waited = 0; waited < 20_000 && !(host.stats.loaded && host.stats.names > 0); waited += 20) await wait(20);
  assert.ok(host.stats.names > 0, "stars are named when nothing is in the way");
  const named = host.stats.names;
  const drawn = host.stats.renders;
  // a place's name and a satellite's ring over the whole picture: no star is named
  taken = [{ left: 0, top: 0, width: SIZE, height: SIZE }];
  host.relayout();
  assert.equal(host.stats.names, 0, "boxes over the whole picture: no star name");
  assert.equal(host.stats.renders, drawn + 1, "one layout for the change");
  await wait(100);
  assert.equal(host.stats.renders, drawn + 1, "and none after it: nothing is laid out at rest");
  taken = [];
  host.relayout();
  assert.equal(host.stats.names, named, "the boxes gone: the stars are named again");
  // a frame reads the boxes too, with no separate layout
  taken = [{ left: 0, top: 0, width: SIZE, height: SIZE }];
  const before = host.stats.renders;
  host.frame(frame);
  assert.equal(host.stats.names, 0);
  assert.equal(host.stats.renders, before + 1, "a frame is one layout");
  host.dispose();
  // no layout at all without a frame
  const idle = createSkyHost({ root, attribute: () => null, language: () => "en", onError: (error) => assert.fail(String(error)), loadFont: async () => undefined });
  idle.relayout();
  assert.equal(idle.stats.renders, 0, "no name asked for: nothing is laid out");
  idle.dispose();
});
