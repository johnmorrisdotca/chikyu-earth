import test from "node:test";
import assert from "node:assert/strict";
import { layoutCities, type CityFrame, type NamedCity } from "../src/cities/geometry.ts";
import { keepOutBoxes, readKeepOut, touchesKeepOut, type KeepOut } from "../src/cities/keep-out.ts";
import { layoutSeaNames } from "../src/sea-names/geometry.ts";
import { project } from "../src/markers/project.ts";

const city = (id: string, en: string, lon: number, lat: number, population: number): NamedCity => ({ id, name: { en }, lon, lat, population, capital: null });

/** 400 by 400, the disc 160 in radius, the view on 0, 0. */
const frame: CityFrame = {
  width: 400,
  height: 400,
  radius: 160,
  project: (lon, lat, out) => {
    const at = project(lon, lat, { lon: 0, lat: 0, radius: 160, cx: 200, cy: 200 });
    out.x = at.x;
    out.y = at.y;
    return at.z;
  },
};
const cities = [city("a", "Alpha", 0, 0, 9_000_000), city("b", "Bravo", 30, 20, 5_000_000), city("c", "Charlie", -30, -20, 4_000_000)];
const options = { max: 10, size: 12, dot: 3 };
const texts = (list: readonly { text: string }[]): string[] => list.map((one) => one.text).sort();
const overlaps = (name: { left: number; top: number; width: number; height: number }, area: KeepOut): boolean => name.left < area.x + area.w && name.left + name.width > area.x && name.top < area.y + area.h && name.top + name.height > area.y;

test("a name whose box touches a keepOut box is not drawn, and the other names are", () => {
  const free = layoutCities(cities, frame, "en", options);
  assert.deepEqual(texts(free), ["Alpha", "Bravo", "Charlie"]);
  const alpha = free.find((one) => one.text === "Alpha")!;
  // a bar laid over the dot and every place its name could go
  const bar: KeepOut = { x: alpha.x - 120, y: alpha.y - 40, w: 240, h: 80 };
  const kept = layoutCities(cities, frame, "en", { ...options, keepOut: [bar] });
  assert.ok(!texts(kept).includes("Alpha"), "Alpha is under the bar");
  for (const one of kept) assert.ok(!overlaps(one, bar), `${one.text} is clear of the bar`);
  assert.ok(texts(kept).includes("Bravo") && texts(kept).includes("Charlie"), "names clear of the bar stay");
});

test("the same name is drawn again when the box is taken away or moved away", () => {
  const alpha = layoutCities(cities, frame, "en", options).find((one) => one.text === "Alpha")!;
  const bar: KeepOut = { x: alpha.x - 120, y: alpha.y - 40, w: 240, h: 80 };
  assert.ok(!texts(layoutCities(cities, frame, "en", { ...options, keepOut: [bar] })).includes("Alpha"));
  assert.ok(texts(layoutCities(cities, frame, "en", { ...options, keepOut: [] })).includes("Alpha"), "removed");
  const away = layoutCities(cities, frame, "en", { ...options, keepOut: [{ ...bar, y: 340, h: 40 }] });
  assert.ok(texts(away).includes("Alpha"), "moved away");
});

test("a name moves round its dot when a box takes only one side, and is not left out", () => {
  const alpha = layoutCities(cities, frame, "en", options).find((one) => one.text === "Alpha")!;
  // the right of the dot, where a name is tried first, is taken; the dot itself is clear
  const right: KeepOut = { x: alpha.x + 6, y: alpha.y - 30, w: 150, h: 60 };
  const moved = layoutCities(cities, frame, "en", { ...options, keepOut: [right] }).find((one) => one.text === "Alpha");
  assert.ok(moved, "Alpha is still named");
  assert.ok(!overlaps(moved, right), "but not under the box");
  assert.notEqual(moved.left, alpha.left, "it moved");
});

test("a city whose dot is under a box is not named at all", () => {
  const alpha = layoutCities(cities, frame, "en", options).find((one) => one.text === "Alpha")!;
  const named = layoutCities(cities, frame, "en", { ...options, keepOut: [{ x: alpha.x - 2, y: alpha.y - 2, w: 4, h: 4 }] });
  assert.ok(!texts(named).includes("Alpha"));
});

test("an empty keepOut changes nothing", () => {
  const before = layoutCities(cities, frame, "en", options);
  assert.deepEqual(layoutCities(cities, frame, "en", { ...options, keepOut: [] }), before);
  assert.deepEqual(layoutCities(cities, frame, "en", { ...options, keepOut: undefined as unknown as KeepOut[] }), before);
});

test("the sea names keep out of the boxes the element hands them", () => {
  const seaFrame = { ...frame, disc: { x: 200, y: 200, radius: 160 } };
  const free = layoutSeaNames(160, seaFrame, "en", []);
  assert.ok(free.length > 0, "the view has sea names");
  const first = free[0]!;
  const box = { left: first.left - 4, top: first.top - 4, width: first.width + 8, height: first.height + 8 };
  const kept = layoutSeaNames(160, seaFrame, "en", keepOutBoxes([{ x: box.left, y: box.top, w: box.width, h: box.height }]));
  for (const one of kept) assert.ok(!(one.left < box.left + box.width && one.left + one.width > box.left && one.top < box.top + box.height && one.top + one.height > box.top), `${one.text} is clear`);
});

test("what a page sets is cleaned: bad entries are dropped, good ones copied, and a list that is not a list is none", () => {
  const given = [{ x: 0, y: 270, w: 400, h: 30 }, { x: Number.NaN, y: 0, w: 1, h: 1 }, { x: 1, y: 2, w: 3 }, null, "x", { x: "1", y: 1, w: 1, h: 1 }];
  const read = readKeepOut(given);
  assert.deepEqual(read, [{ x: 0, y: 270, w: 400, h: 30 }]);
  assert.notEqual(read[0], given[0], "a copy");
  assert.deepEqual(readKeepOut(null), []);
  assert.deepEqual(readKeepOut({ x: 0, y: 0, w: 1, h: 1 }), []);
  assert.deepEqual(keepOutBoxes(read), [{ left: 0, top: 270, width: 400, height: 30 }]);
  assert.equal(touchesKeepOut(read, 100, 280, 3), true);
  assert.equal(touchesKeepOut(read, 100, 250, 3), false);
});
