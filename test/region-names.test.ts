// The names of the regions (MODULES-1143): the countries' names' layer for provinces, states and prefectures, handed in a country at a time by the borders. No browser: the layout is pure, and the host runs on a small fake of the shadow root.
import test from "node:test";
import assert from "node:assert/strict";
import { loadDivisionsGeo } from "@johnmorrisdotca/chizu/divisions-geo";
import { countrySpots, layoutCountryNames, type CountryFrame } from "../src/country-names/geometry.ts";
import { createCountryHost, namesStyle, COUNTRY_NAMES_STYLE } from "../src/country-names/host.ts";
import { REGION_LAYER, REGION_NAMES_STYLE, regionShapes } from "../src/region-names/host.ts";
import type { BorderShapes } from "../src/borders/lines.ts";
import { project } from "../src/markers/project.ts";

const view = (lon: number, lat: number, radius: number): CountryFrame => {
  const size = radius * 2 + 40;
  const pose = { lon, lat, radius, cx: size / 2, cy: size / 2 };
  return {
    width: size,
    height: size,
    radius,
    disc: { x: size / 2, y: size / 2, radius },
    project: (plon, plat, out) => {
      const at = project(plon, plat, pose);
      out.x = at.x;
      out.y = at.y;
      return at.z;
    },
  };
};
const overlap = (a: { left: number; top: number; width: number; height: number }, b: { left: number; top: number; width: number; height: number }): boolean =>
  a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;

const japan = (await loadDivisionsGeo("JP")) as unknown as BorderShapes;

test("regionShapes: each region is told apart by its own iso, not its country's code, and a region with no name is passed over", () => {
  const square = (name: string | null, iso: string | null) => ({ properties: { code: "XX", iso, name, nameJa: null }, geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] } });
  const shapes = regionShapes({ features: [square("One", "XX-1"), square(null, "XX-2"), square("Three", null)] });
  assert.deepEqual(
    shapes.map((one) => [one.properties?.code, one.properties?.name]),
    [["XX-1", "One"], ["XX-Three", "Three"]],
  );
  const real = regionShapes(japan);
  assert.ok(real.length >= 47, `Japan has its prefectures (${real.length})`);
  assert.equal(new Set(real.map((one) => one.properties?.code)).size, real.length, "every prefecture has a code of its own");
});

test("over Japan, close in: the prefectures are named in the page's case or its Japanese, never over each other, a taken box or the edge of the disc", () => {
  const spots = countrySpots({ features: regionShapes(japan) });
  const frame = view(137, 37, 1400);
  const taken = [{ left: frame.width / 2 - 60, top: frame.height / 2 - 20, width: 120, height: 40 }];
  const en = layoutCountryNames(spots, frame, "en", { max: 60, smallest: 9, largest: 13, taken, capitals: false });
  const ja = layoutCountryNames(spots, frame, "ja", { max: 60, smallest: 9, largest: 13, taken, capitals: false });
  assert.ok(en.length >= 10, `many are named close in (${en.length})`);
  assert.ok(ja.length >= 10);
  assert.ok(en.some((one) => one.text === "Hokkaido" || one.text === "Niigata" || one.text === "Nagano"), `English as the data spells it, not in capitals (${en.map((one) => one.text).join(" ")})`);
  assert.ok(en.every((one) => one.text !== one.text.toUpperCase() || one.text.length < 3), "no English name is in capitals");
  assert.ok(ja.some((one) => /[一-龯]/.test(one.text)), "Japanese on a page in Japanese");
  for (const names of [en, ja]) {
    for (const [i, one] of names.entries()) {
      for (const other of names.slice(i + 1)) assert.equal(overlap(one, other), false, `${one.text} and ${other.text} overlap`);
      assert.equal(overlap(one, taken[0]!), false, `${one.text} keeps off the taken box`);
    }
  }
  // far from Japan nothing is in sight
  assert.deepEqual(layoutCountryNames(spots, view(-60, -20, 1400), "en", { max: 60, smallest: 9, largest: 13, capitals: false }), []);
});

test("the style: the regions' own variables come first and the countries' are the fallback, so the two look alike until a page says otherwise", () => {
  assert.match(REGION_NAMES_STYLE, /#rg-names\{/);
  assert.match(REGION_NAMES_STYLE, /\.rg-name\{/);
  assert.match(REGION_NAMES_STYLE, /var\(--chikyu-region-font,var\(--chikyu-country-font,/);
  assert.match(REGION_NAMES_STYLE, /var\(--chikyu-region-colour,var\(--chikyu-country-colour,/);
  assert.doesNotMatch(COUNTRY_NAMES_STYLE, /region/);
  assert.match(COUNTRY_NAMES_STYLE, /#co-names\{/);
  assert.match(COUNTRY_NAMES_STYLE, /font-weight:var\(--chikyu-country-weight,600\)/);
  assert.match(namesStyle(REGION_LAYER, 500), /font-weight:var\(--chikyu-region-weight,var\(--chikyu-country-weight,500\)\)/);
});

/** A shadow root as small as the layer needs, with what it was given to add. */
function fakeRoot() {
  const added: { id: string; children: unknown[] }[] = [];
  const element = () => {
    const node: Record<string, unknown> = { style: { setProperty() {}, removeProperty() {} }, hidden: false, textContent: "", className: "", children: [] as unknown[], setAttribute() {}, remove() {} };
    node.append = (...kids: unknown[]) => (node.children as unknown[]).push(...kids);
    return node;
  };
  const doc = { addEventListener() {}, removeEventListener() {}, createElement: element };
  const root = {
    ownerDocument: doc,
    host: null,
    getElementById: () => null,
    append: (node: { id: string; children: unknown[] }) => added.push(node),
    insertBefore: (node: { id: string; children: unknown[] }) => added.push(node),
  } as unknown as ShadowRoot;
  return { root, added };
}

test("the layer: nothing is added until region-names is set and a frame is told, shapes handed in before are kept, and the names are in the layer's own box and class", () => {
  const { root, added } = fakeRoot();
  let attribute: string | null = null;
  const host = createCountryHost({ root, attribute: (name) => (name === "region-names" ? attribute : null), language: () => "en", onError: () => assert.fail("a layer that loads nothing has no load to fail"), layer: REGION_LAYER });
  const frame = view(137, 37, 1400);
  host.add(regionShapes(japan));
  host.frame(frame);
  assert.equal(added.length, 0, "off: nothing added");
  assert.equal(host.stats.on, false);
  attribute = "";
  host.refresh();
  assert.equal(host.stats.on, true);
  assert.equal(host.stats.max, 40, "bare asks for 40 at most");
  assert.equal(added.length, 1, "on, with a frame: one box");
  assert.equal(added[0]!.id, "rg-names");
  assert.ok(host.stats.countries >= 47, "the regions handed in before were kept");
  assert.ok(host.shown.length > 0 && host.shown.length <= 40);
  assert.deepEqual(host.boxes, host.shown, "the boxes the later layers keep clear of are the names' own");
  assert.ok(added[0]!.children.every((one) => (one as { className: string }).className === "rg-name"));
  host.frame(null);
  assert.equal(host.shown.length, 0, "no frame (the regions are not showing): no names");
  host.frame(frame);
  assert.ok(host.shown.length > 0);
  host.add(regionShapes({ features: [] }));
  host.dispose();
  host.add(regionShapes(japan));
  assert.equal(host.shown.length, 0, "after dispose nothing is laid out again");
});
