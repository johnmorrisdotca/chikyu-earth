import test from "node:test";
import assert from "node:assert/strict";
import { cleanPlaces, groupCell, groupPlaces, layoutPlaces, MAX_PLACES, nearby, orthoView, placeLabels, readPlaces, type Place } from "../src/markers/index.ts";
import { aimAt, findPlace, glideView } from "../src/markers/go-to-place.ts";

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

test("a place keeps a colour of its own only when it is a plain CSS colour", () => {
  const places = cleanPlaces([
    { lon: 0, lat: 0, color: "#e8475f" },
    { lon: 0, lat: 0, color: "rgb(10, 20, 30)" },
    { lon: 0, lat: 0, color: "teal" },
    { lon: 0, lat: 0, color: "red;background:url(x)" },
    { lon: 0, lat: 0, color: "var(--x)" },
    { lon: 0, lat: 0, color: 7 },
  ]);
  assert.deepEqual(places.map((place) => place.color), ["#e8475f", "rgb(10, 20, 30)", "teal", undefined, undefined, undefined]);
  assert.equal(MAX_PLACES, 5000);
});

test("a place on the night side says so, the twilight is between, and with no Sun every place is in daylight", () => {
  const sun = { lon: 0, lat: 0 };
  const places: Place[] = [
    { id: "noon", lon: 0, lat: 0 },
    { id: "dusk", lon: 89, lat: 0 },
    { id: "night", lon: 120, lat: 0 },
  ];
  const night = (lon: number) => layoutPlaces(places, view(lon, 0), "beam", { sun }).shapes.map((shape) => [places[shape.index]!.id, shape.night]);
  assert.deepEqual(night(0)[0], ["noon", 0]);
  const dusk = night(80).find(([id]) => id === "dusk")![1] as number;
  assert.ok(dusk > 0 && dusk < 1, `twilight ${dusk}`);
  assert.deepEqual(night(120).find(([id]) => id === "night"), ["night", 1]);
  assert.ok(layoutPlaces(places, view(120, 0), "beam").shapes.every((shape) => shape.night === 0));
});

test("crowded places are gathered by cells fixed to the ground, here never is, and the cell follows the Earth's size on the screen", () => {
  assert.equal(groupCell(200), 8);
  assert.equal(groupCell(0), 0);
  assert.equal(groupCell(1_000_000), 0, "so close that nothing needs gathering");
  assert.ok(groupCell(2000) < groupCell(200));
  const places: Place[] = [
    { id: "a", lon: 139.69, lat: 35.69 },
    { id: "here", lon: 139.7, lat: 35.68, kind: "here" },
    { id: "b", lon: 139.75, lat: 35.66 },
    { id: "c", lon: -0.13, lat: 51.51 },
  ];
  const groups = groupPlaces(places, 8);
  assert.deepEqual(groups.map((group) => group.members), [[0, 2], [1], [3]]);
  assert.ok(Math.abs(groups[0]!.lon - 139.72) < 0.01 && Math.abs(groups[0]!.lat - 35.675) < 0.01, "a group is drawn at the middle of its places");
  assert.deepEqual(groupPlaces(places, 0).map((group) => group.members), [[0], [1], [2], [3]]);
  // a crowd of thousands, and every place is in exactly one group
  const crowd: Place[] = Array.from({ length: 5000 }, (_, i) => ({ id: String(i), lon: ((i * 137.508) % 360) - 180, lat: ((i * 61.8) % 170) - 85 }));
  const gathered = groupPlaces(crowd, groupCell(200));
  assert.ok(gathered.length < 1000, `${gathered.length} groups`);
  assert.equal(gathered.reduce((n, group) => n + group.members.length, 0), 5000);
});

test("going to a place: by id or by name, the shorter way round, the tilt held to 90", () => {
  const places: Place[] = [
    { id: "tokyo", lon: 139.69, lat: 35.69, label: "Tokyo" },
    { id: "lima", lon: -77.04, lat: -12.05, label: "Lima" },
  ];
  assert.equal(findPlace(places, "lima")?.label, "Lima");
  assert.equal(findPlace(places, "TOKYO")?.id, "tokyo");
  assert.equal(findPlace(places, "Nowhere"), undefined);
  const aim = aimAt({ lon: 10, lat: 20 }, places[0]!, { yaw: 0, tilt: 0 });
  assert.ok(Math.abs(aim.yaw - (10 - 139.69)) < 1e-9 && Math.abs(aim.tilt - (20 - 35.69)) < 1e-9);
  assert.equal(aimAt({ lon: 170, lat: 0 }, { lon: -170, lat: 0 }, { yaw: 0, tilt: 0 }).yaw, -20, "across the date line, not the long way");
  assert.equal(aimAt({ lon: 0, lat: 60 }, { lon: 0, lat: -60 }, { yaw: 0, tilt: 0 }).tilt, 90);
  let done: [number, number, boolean] | null = null;
  glideView((yaw, tilt, final) => (done = [yaw, tilt, final]), { yaw: 0, tilt: 0 }, { yaw: 30, tilt: -10 }, false, () => true);
  assert.deepEqual(done, [30, -10, true]);
});
