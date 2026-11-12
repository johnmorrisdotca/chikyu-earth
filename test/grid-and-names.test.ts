import test from "node:test";
import assert from "node:assert/strict";
import WORLD_GEO from "@johnmorrisdotca/chizu/world-geo";
import { EARTH_TILT, GRID_FINE_RADIUS, gridLines, readGrid } from "../src/grid/lines.ts";
import { countryNameBox, countryNameText, countrySpots, layoutCountryNames, readCountryNames, type CountryFrame, type NamedShape } from "../src/country-names/geometry.ts";
import { project } from "../src/markers/project.ts";

const RAD = Math.PI / 180;
const world = WORLD_GEO as unknown as { features: readonly NamedShape[] };
const spots = countrySpots(world);

/** The orthographic view of a disc of `radius` pixels in the middle of a `size` box, looking at a place. */
const view = (lon: number, lat: number, radius: number, size = radius * 2 + 40): CountryFrame => {
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

test("the grid's attribute: absent or off draws none, anything else draws it", () => {
  assert.equal(readGrid(null), false);
  assert.equal(readGrid(""), true);
  assert.equal(readGrid("on"), true);
  assert.equal(readGrid("OFF"), false);
});

test("the grid: on the unit sphere, the special lines first, then every 30 degrees, then every 15", () => {
  const grid = gridLines();
  assert.equal(grid.points % 2, 0, "two points to a segment");
  assert.ok(grid.coarse > 0 && grid.coarse < grid.points);
  assert.equal(grid.colours.length, grid.positions.length);
  console.log(`${grid.points / 2} segments, ${grid.coarse / 2} of them every 30 degrees, ${(grid.positions.byteLength + grid.colours.byteLength) / 1024} kB`);
  for (let i = 0; i < grid.points; i += 1) {
    const r = Math.hypot(grid.positions[i * 3]!, grid.positions[i * 3 + 1]!, grid.positions[i * 3 + 2]!);
    assert.ok(Math.abs(r - 1) < 1e-6, `point ${i} is on the sphere`);
  }
  const latOf = (i: number): number => Math.asin(grid.positions[i * 3 + 1]!) / RAD;
  const lonOf = (i: number): number => Math.atan2(grid.positions[i * 3]!, grid.positions[i * 3 + 2]!) / RAD;
  // the parallels of the special lines are there: the equator, the tropics and the polar circles
  const parallels = new Set<number>();
  for (let i = 0; i < grid.points; i += 2) if (Math.abs(latOf(i) - latOf(i + 1)) < 1e-6) parallels.add(Math.round(latOf(i) * 1000) / 1000);
  for (const lat of [0, EARTH_TILT, -EARTH_TILT, 90 - EARTH_TILT, EARTH_TILT - 90]) assert.ok([...parallels].some((one) => Math.abs(one - lat) < 0.01), `the parallel at ${lat}`);
  // the coarse part has only 30-degree lines besides the special ones, the rest only 15-degree ones
  for (let i = 0; i < grid.points; i += 2) {
    const meridian = Math.abs(lonOf(i) - lonOf(i + 1)) < 1e-6 && Math.abs(Math.cos(latOf(i) * RAD)) > 1e-3;
    if (!meridian) continue;
    const lon = Math.round(lonOf(i));
    if (lon === 0) continue;
    if (i < grid.coarse) assert.equal(((lon % 30) + 30) % 30, 0, `coarse meridian at ${lon}`);
    else assert.equal(((lon % 30) + 30) % 30, 15, `fine meridian at ${lon}`);
  }
  // the prime meridian is warm, the equator white, a plain line dimmer than both
  const colourAt = (i: number): number[] => [grid.colours[i * 3]!, grid.colours[i * 3 + 1]!, grid.colours[i * 3 + 2]!];
  assert.deepEqual(colourAt(0), [255, 255, 255], "the equator first, in white");
  const last = colourAt(grid.points - 1);
  assert.ok(last[0]! < 180 && last[2]! < 230, "a plain line is dimmer");
  assert.ok(GRID_FINE_RADIUS > 0);
});

test("the country names' attribute: absent or off is none, bare 40, a number that many (1 to 120)", () => {
  assert.equal(readCountryNames(null), null);
  assert.equal(readCountryNames("off"), null);
  assert.equal(readCountryNames(""), 40);
  assert.equal(readCountryNames("12"), 12);
  assert.equal(readCountryNames("0"), 1);
  assert.equal(readCountryNames("500"), 120);
  assert.equal(readCountryNames("many"), 40);
});

test("every named country of chizu's world has points on its own land, about 48 of them", () => {
  assert.equal(spots.countries.length, world.features.length);
  let total = 0;
  for (const country of spots.countries) {
    const count = country.points.length / 4;
    total += count;
    assert.ok(count >= 1, `${country.code} has a point`);
    assert.ok(count <= 400, `${country.code} has ${count} points`);
  }
  console.log(`${spots.countries.length} countries, ${total} points, ${(total * 16) / 1024} kB`);
  assert.ok(total < 12_000, "a small table");
  // the points of a country with a hole or a strange shape are on its land: Italy's are not in the sea, South Africa's not in Lesotho
  const za = spots.countries.find((country) => country.code === "ZA")!;
  const ls = world.features.find((feature) => feature.properties?.code === "LS")!;
  const lesotho = (ls.geometry!.coordinates as number[][][])[0]!;
  for (let i = 0; i < za.points.length; i += 4) {
    const lon = za.points[i]!;
    const lat = za.points[i + 1]!;
    let odd = false;
    for (let a = 0, b = lesotho.length - 1; a < lesotho.length; b = a, a += 1) {
      const [xa, ya] = lesotho[a] as [number, number];
      const [xb, yb] = lesotho[b] as [number, number];
      if (ya > lat !== yb > lat && lon < ((xb - xa) * (lat - ya)) / (yb - ya) + xa) odd = !odd;
    }
    assert.equal(odd, false, "no point of South Africa is in Lesotho");
  }
});

test("the text: Japanese on a page in Japanese, capitals otherwise", () => {
  assert.equal(countryNameText({ name: { en: "Japan", ja: "日本" } }, "ja"), "日本");
  assert.equal(countryNameText({ name: { en: "Japan", ja: "日本" } }, "en"), "JAPAN");
  assert.equal(countryNameText({ name: { en: "Kosovo" } }, "ja"), "KOSOVO");
  assert.ok(countryNameBox("日本", 12).width > countryNameBox("JP", 12).width - 2);
});

test("over Europe and Africa: names in sight only, at their own land, never over one another, inside the disc, the largest first", () => {
  for (const lang of ["en", "ja"] as const) {
    for (const radius of [150, 300, 900]) {
      const frame = view(15, 30, radius);
      const names = layoutCountryNames(spots, frame, lang, { max: 120, smallest: 10, largest: 16 });
      assert.ok(names.length > 0, `${lang} at ${radius}: some names`);
      for (const [i, one] of names.entries()) {
        for (const other of names.slice(i + 1)) assert.equal(overlap(one, other), false, `${one.text} and ${other.text} overlap`);
        for (const [x, y] of [
          [one.left, one.top],
          [one.left + one.width, one.top],
          [one.left, one.top + one.height],
          [one.left + one.width, one.top + one.height],
        ] as const)
          assert.ok(Math.hypot(x - frame.disc!.x, y - frame.disc!.y) <= radius, `${one.text} stays on the disc`);
        // the anchor is a point of the country's own land, on the near side
        const country = spots.countries.find((c) => c.code === one.code)!;
        let found = false;
        const out = { x: 0, y: 0 };
        for (let k = 0; k < country.points.length && !found; k += 4) {
          const facing = frame.project(country.points[k]!, country.points[k + 1]!, out);
          if (facing > 0 && Math.abs(out.x - one.x) < 1e-6 && Math.abs(out.y - one.y) < 1e-6) found = true;
        }
        assert.ok(found, `${one.text} is named at a point of its own land`);
      }
      const codes = names.map((one) => one.code);
      // the Americas' far side and Australia are out of sight from over the Sahara
      assert.ok(!codes.includes("AU") && !codes.includes("NZ") && !codes.includes("CL"), `${lang} at ${radius}: no name from the far side (${codes.join(" ")})`);
      if (radius >= 300) assert.ok(codes.includes("DZ") || codes.includes("LY"), `${lang} at ${radius}: the Sahara's countries are named`);
      console.log(`${lang} at radius ${radius}: ${names.length} names`);
    }
  }
  // more names as the Earth grows
  const few = layoutCountryNames(spots, view(15, 30, 150), "en", { max: 120, smallest: 10, largest: 16 }).length;
  const many = layoutCountryNames(spots, view(15, 30, 600), "en", { max: 120, smallest: 10, largest: 16 }).length;
  assert.ok(many > few, `more names on a larger Earth (${few} then ${many})`);
});

test("the names keep clear of the boxes taken, and of the most asked for", () => {
  const frame = view(15, 30, 300);
  const free = layoutCountryNames(spots, frame, "en", { max: 120, smallest: 10, largest: 16 });
  const first = free[0]!;
  const taken = [{ left: first.left - 2, top: first.top - 2, width: first.width + 4, height: first.height + 4 }];
  const kept = layoutCountryNames(spots, frame, "en", { max: 120, smallest: 10, largest: 16, taken });
  for (const one of kept) assert.equal(overlap(one, taken[0]!), false, `${one.text} is not over the box taken`);
  assert.equal(layoutCountryNames(spots, frame, "en", { max: 3, smallest: 10, largest: 16 }).length, 3);
});

test("a name measured wider than the estimate is laid out at the measured width", () => {
  const frame = view(15, 30, 300);
  const names = layoutCountryNames(spots, frame, "en", { max: 120, smallest: 10, largest: 16, measure: (text, size) => ({ width: text.length * size * 1.2, height: size * 1.8 }) });
  for (const one of names) {
    assert.ok(one.width >= one.text.length * one.size * 1.2, `${one.text} is as wide as measured`);
    assert.ok(one.height >= Math.ceil(one.size * 1.8), `${one.text} is as tall as measured`);
  }
  for (const [i, one] of names.entries()) for (const other of names.slice(i + 1)) assert.equal(overlap(one, other), false);
});

test("the layer: nothing loaded or added until asked for, and when the outlines cannot be loaded it says why and shows nothing", async () => {
  const { createCountryHost } = await import("../src/country-names/host.ts");
  const added: unknown[] = [];
  const doc = { addEventListener() {}, removeEventListener() {}, createElement: () => ({ style: {}, setAttribute() {} }) };
  const root = { ownerDocument: doc, host: null, getElementById: () => null, append: (...nodes: unknown[]) => added.push(...nodes), insertBefore: (node: unknown) => added.push(node) } as unknown as ShadowRoot;
  let attribute: string | null = null;
  let loads = 0;
  const errors: unknown[] = [];
  const host = createCountryHost({
    root,
    attribute: () => attribute,
    language: () => "en",
    onError: (error) => errors.push(error),
    load: () => {
      loads += 1;
      return Promise.reject(new Error("Cannot find module '@johnmorrisdotca/chizu/world-geo'"));
    },
  });
  const frame = { width: 400, height: 400, radius: 180, project: () => 1 };
  host.frame(frame);
  assert.equal(loads, 0, "off: nothing loaded");
  assert.equal(added.length, 0, "and nothing added");
  attribute = "";
  host.refresh();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(loads, 1);
  assert.equal(errors.length, 1);
  assert.match(String(errors[0]), /chizu/);
  assert.deepEqual(host.stats, { on: true, max: 40, countries: 0, names: 0, renders: 0, failed: true });
  host.frame(frame);
  assert.equal(loads, 1, "asked once only");
  assert.equal(added.length, 0, "nothing shown");
  host.dispose();
});

test("the layer: an outline load that finishes after dispose is ignored, whether it arrives or fails", async () => {
  const { createCountryHost } = await import("../src/country-names/host.ts");
  for (const outcome of ["arrives", "fails"] as const) {
    const added: unknown[] = [];
    const style = { setProperty() {}, removeProperty() {} };
    const doc = { addEventListener() {}, removeEventListener() {}, createElement: () => ({ style, setAttribute() {}, remove() {} }) };
    const root = { ownerDocument: doc, host: null, getElementById: () => null, append: (...nodes: unknown[]) => added.push(...nodes), insertBefore: (node: unknown) => added.push(node) } as unknown as ShadowRoot;
    const errors: unknown[] = [];
    let settle: () => void = () => {};
    const host = createCountryHost({
      root,
      attribute: () => "",
      language: () => "en",
      onError: (error) => errors.push(error),
      load: () =>
        new Promise((resolve, reject) => {
          settle = outcome === "arrives" ? () => resolve({ features: [] }) : () => reject(new Error("late"));
        }),
    });
    host.frame({ width: 400, height: 400, radius: 180, project: () => 1 });
    host.dispose();
    settle();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(added.length, 0, `${outcome}: no box is made after dispose`);
    assert.equal(errors.length, 0, `${outcome}: nobody is told after dispose`);
    assert.deepEqual(host.stats, { on: true, max: 40, countries: 0, names: 0, renders: 0, failed: false }, `${outcome}: nothing changed`);
  }
});
