import test from "node:test";
import assert from "node:assert/strict";
import { cleanPlaces, layoutPlaces, MAX_PLACES, nearby, orthoView, placeLabels, readPlaces, type Place } from "../src/markers/index.ts";

const view = (lon: number, lat: number) => orthoView({ lon, lat, radius: 200, cx: 210, cy: 210, width: 420, height: 420 });
const size = () => ({ width: 60, height: 18 });

test("a place list is read from JSON, and anything that cannot be drawn is left out", () => {
  const places = readPlaces('[{"id":"me","lon":-79.4,"lat":43.7,"label":" You ","kind":"here"},{"lon":2.35,"lat":48.86},{"lon":500,"lat":0},{"lat":1},null,"x"]');
  assert.deepEqual(places, [
    { id: "me", lon: -79.4, lat: 43.7, label: "You", kind: "here" },
    { id: "1", lon: 2.35, lat: 48.86, kind: "favourite" },
  ]);
  assert.deepEqual(readPlaces("not json"), []);
  assert.deepEqual(readPlaces(null), []);
  assert.deepEqual(readPlaces('{"lon":1,"lat":2}'), []);
  assert.equal(cleanPlaces([{ lon: 0, lat: 0, kind: "nope" }])[0]?.kind, "favourite");
  assert.equal(cleanPlaces([{ lon: 0, lat: 0, label: "x".repeat(200) }])[0]?.label?.length, 80);
  assert.equal(cleanPlaces(Array.from({ length: MAX_PLACES + 50 }, (_, i) => ({ id: String(i), lon: 0, lat: 0 }))).length, MAX_PLACES);
});

test("nearby puts a place on a grid about 10 km across, so a street is never told", () => {
  const point = { lon: -79.38321, lat: 43.65348 };
  const rounded = nearby(point);
  const km = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) => Math.hypot((a.lat - b.lat) * 111.32, (a.lon - b.lon) * 111.32 * Math.cos((a.lat * Math.PI) / 180));
  assert.ok(km(point, rounded) <= 10, `moved ${km(point, rounded)} km`);
  assert.deepEqual(nearby({ lon: -79.39, lat: 43.66 }), rounded, "a place a street away rounds to the same point");
  assert.ok(km(point, nearby(point, 50)) <= 50);
  const pole = nearby({ lon: 120, lat: 89.99 });
  assert.ok(Math.abs(pole.lon) <= 180 && pole.lat <= 90);
  const dateLine = nearby({ lon: 179.99, lat: 0 });
  assert.ok(dateLine.lon >= -180 && dateLine.lon <= 180);
});

test("a place at the middle of the view: its stick leans up the screen, its ring is round and it is fully shown", () => {
  const layout = layoutPlaces([{ id: "a", lon: 10, lat: 20, kind: "here" }], view(10, 20), "beam");
  const shape = layout.shapes[0]!;
  assert.ok(Math.abs(shape.x - 210) < 1e-9 && Math.abs(shape.y - 210) < 1e-9);
  assert.ok(Math.abs(shape.angle) < 1e-6, "straight up");
  assert.ok(shape.tipY < shape.y && shape.length > 20, "it never shrinks to a dot");
  assert.equal(shape.squash, 1);
  assert.equal(shape.opacity, 1);
});

test("a place towards the edge stands out from the centre and its ring flattens; one on the far side is left out", () => {
  const east = layoutPlaces([{ id: "e", lon: 80, lat: 0 }], view(0, 0), "beam").shapes[0]!;
  assert.ok(east.x > 380, "near the right edge");
  assert.ok(east.tipX > east.x && Math.abs(east.tipY - east.y) < 1, "the stick points out, to the right");
  assert.ok(Math.abs(east.angle - 90) < 1);
  assert.ok(east.squash < 0.2, "the ring is seen almost edge on");
  assert.ok(Math.abs(east.ringAngle - 90) < 1, "flattened along the way the stick points");
  assert.equal(layoutPlaces([{ id: "far", lon: 180, lat: 0 }], view(0, 0), "beam").shapes.length, 0);
  const rim = layoutPlaces([{ id: "rim", lon: 88, lat: 0 }], view(0, 0), "beam").shapes[0]!;
  assert.ok(rim.opacity > 0 && rim.opacity < 1, "it fades at the edge");
});

test("here is taller and wider than a favourite; the ring look has no stick", () => {
  const places: Place[] = [
    { id: "h", lon: 0, lat: 0, kind: "here" },
    { id: "f", lon: 0.001, lat: 0, kind: "favourite" },
  ];
  const [here, favourite] = layoutPlaces(places, view(0, 30), "beam").shapes;
  assert.ok(here!.length > favourite!.length && here!.ring > favourite!.ring);
  for (const shape of layoutPlaces(places, view(0, 30), "ring").shapes) {
    assert.equal(shape.length, 0);
    assert.equal(shape.tipX, shape.x);
  }
});

test("names never overlap, here wins its place, and a name has no room over another layer's box", () => {
  const places: Place[] = [
    { id: "f1", lon: 0.4, lat: 0, label: "Favourite one" },
    { id: "here", lon: 0, lat: 0, label: "You are here", kind: "here" },
    { id: "f2", lon: 0.8, lat: 0, label: "Favourite two" },
    { id: "f3", lon: 0, lat: 0.4, label: "Favourite three" },
  ];
  const layout = layoutPlaces(places, view(0, 0), "beam", { size });
  assert.ok(layout.labels.some((spot) => spot.index === 1), "here is named");
  const boxes = layout.labels.map((spot) => ({ l: spot.left, t: spot.top, r: spot.left + 60, b: spot.top + 18 }));
  for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) assert.ok(!(a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t), "two names overlap");
  assert.ok(layout.labels.length < places.length, "names with no room are left out");

  const here = layout.shapes.find((shape) => shape.index === 1)!;
  const covered = layoutPlaces([places[1]!], view(0, 0), "beam", { size, taken: [{ left: here.tipX - 200, top: here.tipY - 100, width: 400, height: 200 }] });
  assert.equal(covered.labels.length, 0);
  assert.equal(covered.shapes.length, 1, "the marker is still drawn");
});

test("a place with no name size gets no name, and the most names is kept", () => {
  const many: Place[] = Array.from({ length: 40 }, (_, i) => ({ id: String(i), lon: (i % 8) * 10 - 40, lat: Math.floor(i / 8) * 10 - 20, label: `P${i}` }));
  assert.equal(layoutPlaces(many, view(0, 0), "pin").labels.length, 0);
  assert.ok(layoutPlaces(many, view(0, 0), "pin", { size: () => ({ width: 20, height: 12 }), maxLabels: 5 }).labels.length <= 5);
});

test("placeLabels keeps clear of boxes already taken", () => {
  const items = [{ x: 100, y: 100, r: 4, w: 40, h: 16, priority: 0 }];
  assert.equal(placeLabels(items, 300, 300, 5).length, 1);
  assert.equal(placeLabels(items, 300, 300, 5, 64, [{ left: 40, top: 40, width: 140, height: 140 }]).length, 0);
});
