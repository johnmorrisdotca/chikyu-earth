// Places on the Earth: the list a page hands in is checked and copied, a place stands where the picture puts it, a beam is sized in pixels and a place on the far side is not drawn.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_PLACES, PLACE_STYLES, destination, orthographicProjector, putPlaces, readPlaces, readPlacesAttribute } from "../src/places/index.ts";
import { placeLabels } from "../src/markers/labels.ts";

const POSE = { lon: 0, lat: 0, radius: 200, cx: 210, cy: 210 };

test("a list is checked and copied: what cannot be drawn is left out and counted, the longitude is brought into range, the first of two ids wins, and the page's own objects are not kept", () => {
  const given = { id: "a", lat: 35.7, lon: 190, label: "  Tokyo  ", kind: "here" as const };
  const read = readPlaces([given, { id: "a", lat: 1, lon: 1 }, { id: "b", lat: 91, lon: 0 }, { id: "c", lat: Number.NaN, lon: 0 }, { id: "", lat: 0, lon: 0 }, { lat: 0, lon: 0 }, null, 7, { id: "d", lat: -90, lon: -540, kind: "other" }]);
  assert.deepEqual(read.places, [
    { id: "a", lat: 35.7, lon: -170, label: "Tokyo", kind: "here" },
    { id: "d", lat: -90, lon: -180, kind: "favourite" },
  ]);
  assert.equal(read.skipped, 7);
  assert.notEqual(read.places[0], given);
  assert.equal(given.lon, 190, "the page's object is not changed");
  assert.deepEqual(readPlaces("nothing"), { places: [], skipped: 0 });
  assert.deepEqual(readPlaces(undefined), { places: [], skipped: 0 });
});

test("no more than MAX_PLACES are kept, and a long label is cut", () => {
  const many = Array.from({ length: MAX_PLACES + 5 }, (_, i) => ({ id: `p${i}`, lat: 0, lon: i % 360 }));
  const read = readPlaces(many);
  assert.equal(read.places.length, MAX_PLACES);
  assert.equal(read.skipped, 5);
  assert.equal(readPlaces([{ id: "x", lat: 0, lon: 0, label: "x".repeat(200) }]).places[0]!.label!.length, 60);
});

test("the places attribute is JSON, and text that is not JSON or not a list is no places", () => {
  assert.equal(readPlacesAttribute('[{"id":"t","lat":35.68,"lon":139.69,"label":"Tokyo"}]').places.length, 1);
  for (const bad of [null, "", "  ", "not json", "{}", '"x"', "[1,2]"]) assert.deepEqual(readPlacesAttribute(bad).places, [], String(bad));
});

test("the middle of the disc faces the viewer, the far side does not, the rim is left out, and a point above the surface is further out", () => {
  const view = orthographicProjector(POSE, 420, 420);
  assert.deepEqual(view.at(0, 0, 0), { x: 210, y: 210, facing: true });
  assert.equal(view.at(180, 0, 0).facing, false);
  assert.equal(view.at(90, 0, 0).facing, false, "the rim itself");
  assert.equal(view.at(80, 0, 0).facing, true);
  const foot = view.at(60, 0, 0);
  const head = view.at(60, 0, 0.2);
  assert.ok(Math.abs(head.x - 210) > Math.abs(foot.x - 210), "the head is further from the middle than the foot");
  assert.ok(Math.abs(foot.x - (210 + 200 * Math.sin(Math.PI / 3))) < 1e-9);
  // north is up
  assert.ok(view.at(0, 40, 0).y < 210);
});

test("a place is where the pose puts it when the view is turned: the place the view is centred on is in the middle", () => {
  const view = orthographicProjector({ lon: 139.7, lat: 35.7, radius: 300, cx: 400, cy: 300 }, 800, 600);
  const there = view.at(139.7, 35.7, 0);
  assert.ok(Math.abs(there.x - 400) < 1e-9 && Math.abs(there.y - 300) < 1e-9);
});

test("a beam is a fixed number of pixels tall at the rim whatever the zoom, a ring is drawn only for a place that faces, and the far side is not drawn", () => {
  for (const radius of [60, 200, 900]) {
    const view = orthographicProjector({ ...POSE, radius }, 2000, 2000);
    const [on] = putPlaces([{ id: "h", lat: 0, lon: 80, kind: "here" }], view);
    // at 80 degrees the beam is nearly across the line of sight: its length on the screen is close to its height in pixels
    const length = Math.hypot(on!.headX - on!.footX, on!.headY - on!.footY);
    assert.ok(Math.abs(length - Math.min(PLACE_STYLES.here.beamPx, radius * 0.5) * Math.cos((10 * Math.PI) / 180)) < 4, `radius ${radius}: ${length}`);
    assert.equal(on!.ring.length, 28);
  }
  const view = orthographicProjector(POSE, 420, 420);
  const [far, near] = putPlaces([{ id: "f", lat: 0, lon: 180 }, { id: "n", lat: 0, lon: 0 }], view);
  assert.equal(far!.facing, false);
  assert.deepEqual(far!.ring, []);
  assert.equal(near!.facing, true);
  // a place in the middle of the disc: the beam points at the viewer, so it is short on the screen (a pin seen end on)
  assert.ok(Math.hypot(near!.headX - near!.footX, near!.headY - near!.footY) < 1e-9);
});

test("the ring is round on the ground: its points are the same distance from the place at the middle of the disc, and flattened towards the rim", () => {
  const view = orthographicProjector({ ...POSE, radius: 400 }, 800, 800);
  const [mid] = putPlaces([{ id: "m", lat: 0, lon: 0 }], view);
  const radii = mid!.ring.map((p) => Math.hypot(p.x - mid!.footX, p.y - mid!.footY));
  assert.ok(Math.max(...radii) - Math.min(...radii) < 0.2, "a ring in the middle is a circle");
  const [rim] = putPlaces([{ id: "r", lat: 0, lon: 75 }], view);
  const across = rim!.ring.map((p) => p.x);
  const down = rim!.ring.map((p) => p.y);
  assert.ok(Math.max(...across) - Math.min(...across) < (Math.max(...down) - Math.min(...down)) * 0.5, "seen at a slant it is an ellipse, narrower across the line to the middle");
});

test("destination: a quarter of the way round to the east of the equator is 90 degrees east, over the pole is the other side, and a distance of nothing is the place", () => {
  const east = destination(0, 0, 90, Math.PI / 2);
  assert.ok(Math.abs(east.lon - 90) < 1e-9 && Math.abs(east.lat) < 1e-9);
  const pole = destination(10, 80, 0, (20 * Math.PI) / 180);
  assert.ok(Math.abs(Math.abs(pole.lon - 10) - 180) < 1e-6 && Math.abs(pole.lat - 80) < 1e-6);
  const same = destination(33, -12, 123, 0);
  assert.ok(Math.abs(same.lon - 33) < 1e-9 && Math.abs(same.lat + 12) < 1e-9);
});

test("names never overlap: right of the marker, then left, above, below, and the lesser place is left out when none is free", () => {
  const dense = [
    { x: 100, y: 100, r: 5, w: 60, h: 18, priority: 1_000_000 },
    { x: 110, y: 100, r: 5, w: 60, h: 18, priority: 999 },
    { x: 105, y: 100, r: 5, w: 60, h: 18, priority: 998 },
  ];
  const placed = placeLabels(dense, 400, 300, 24);
  const boxes = placed.map((p) => ({ l: p.left, t: p.top, r: p.left + dense[p.item]!.w, b: p.top + dense[p.item]!.h }));
  for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) assert.ok(boxes[i]!.r <= boxes[j]!.l || boxes[j]!.r <= boxes[i]!.l || boxes[i]!.b <= boxes[j]!.t || boxes[j]!.b <= boxes[i]!.t, "no two names overlap");
  assert.equal(placed[0]!.item, 0, "the visitor's own place is placed first");
  assert.ok(placed.every((p) => p.left >= 0 && p.top >= 0), "inside the box");
});

test("the ring's points are worked out once for a place and a size: the same places give the same rings, and a new size gives new ones", () => {
  const places = [{ id: "a", lat: 35.68, lon: 139.69 }];
  const view = orthographicProjector({ lon: 139.69, lat: 35.68, radius: 200, cx: 210, cy: 210 }, 420, 420);
  const first = putPlaces(places, view)[0]!;
  const again = putPlaces(places, view)[0]!;
  assert.equal(first.ring.length, 28);
  assert.deepEqual(again.ring, first.ring);
  const bigger = putPlaces(places, orthographicProjector({ lon: 139.69, lat: 35.68, radius: 400, cx: 210, cy: 210 }, 420, 420))[0]!;
  const reach = (one: typeof first): number => Math.max(...one.ring.map((p) => Math.hypot(p.x - one.footX, p.y - one.footY)));
  assert.ok(reach(bigger) < reach(first) * 1.5 + 1, "the ring is a number of pixels across, so it does not grow with the Earth");
  assert.deepEqual(putPlaces(places, view)[0]!.ring, first.ring, "and the size it had before still gives the ring it had");
});
