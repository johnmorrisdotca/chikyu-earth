import test from "node:test";
import assert from "node:assert/strict";
import WORLD_GEO from "@johnmorrisdotca/chizu/world-geo";
import { codesNear, readBorders, shapeBoxes, sharedEdges, type BorderShapes } from "../src/borders/lines.ts";

const RAD = Math.PI / 180;
const square = (code: string, west: number, south: number, size = 1) => ({
  properties: { code },
  geometry: { type: "Polygon", coordinates: [[[west, south], [west + size, south], [west + size, south + size], [west, south + size], [west, south]]] },
});
const lonLat = (positions: Float32Array, i: number): [number, number] => {
  const x = positions[i * 3]!;
  const y = positions[i * 3 + 1]!;
  const z = positions[i * 3 + 2]!;
  return [Math.atan2(x, z) / RAD, Math.asin(y) / RAD];
};
const world = WORLD_GEO as unknown as BorderShapes;

test("the attribute: absent draws none, bare draws both, otherwise the words it names", () => {
  assert.deepEqual(readBorders(null), { countries: false, regions: false });
  assert.deepEqual(readBorders(""), { countries: true, regions: true });
  assert.deepEqual(readBorders("countries"), { countries: true, regions: false });
  assert.deepEqual(readBorders("regions"), { countries: false, regions: true });
  assert.deepEqual(readBorders("Countries, regions"), { countries: true, regions: true });
  assert.deepEqual(readBorders("off"), { countries: false, regions: false });
});

test("only the edge two shapes share is a border: the coasts are left out", () => {
  const edges = sharedEdges({ features: [square("A", 0, 0), square("B", 1, 0)] });
  assert.equal(edges.length / 6, 1, "one segment");
  for (const i of [0, 1]) {
    const [lon] = lonLat(edges, i);
    assert.ok(Math.abs(lon - 1) < 1e-5, `the shared edge is at longitude 1, not ${lon}`);
    assert.ok(Math.abs(Math.hypot(edges[i * 3]!, edges[i * 3 + 1]!, edges[i * 3 + 2]!) - 1) < 1e-6, "on the unit sphere");
  }
  // a lone island has no border, and a shape that touches itself is not its own neighbour
  assert.equal(sharedEdges({ features: [square("A", 0, 0)] }).length, 0);
  const twice = { properties: { code: "A" }, geometry: { type: "MultiPolygon", coordinates: [square("A", 0, 0).geometry.coordinates, square("A", 1, 0).geometry.coordinates] } };
  assert.equal(sharedEdges({ features: [twice] }).length, 0);
  // geometry that is not a polygon is passed over
  assert.equal(sharedEdges({ features: [{ geometry: { type: "Point", coordinates: [0, 0] } }, { geometry: null }] }).length, 0);
});

test("a long edge is cut into pieces along the great circle, so the line keeps to the ground", () => {
  const edges = sharedEdges({ features: [square("A", 0, 0, 10), square("B", 10, 0, 10)] }, 1);
  assert.equal(edges.length / 6, 10, "ten pieces of a degree");
  for (let i = 0; i < edges.length / 3; i += 1) {
    const [lon, lat] = lonLat(edges, i);
    assert.ok(Math.abs(lon - 10) < 1e-4, "on the meridian");
    assert.ok(lat >= -1e-4 && lat <= 10 + 1e-4);
  }
});

test("chizu's world: the land borders between countries, none round an island", () => {
  const edges = sharedEdges(world);
  const segments = edges.length / 6;
  assert.ok(segments > 2000 && segments < 6000, `${segments} segments`);
  // nothing over Honshu and Hokkaido: Japan is an island country with no land border
  for (let i = 0; i < edges.length / 3; i += 1) {
    const [lon, lat] = lonLat(edges, i);
    assert.ok(!(lon > 135 && lon < 146 && lat > 33 && lat < 45), `a border point in Japan at ${lon}, ${lat}`);
  }
  // the border of France and Spain, along the Pyrenees, is there
  let pyrenees = 0;
  for (let i = 0; i < edges.length / 3; i += 1) {
    const [lon, lat] = lonLat(edges, i);
    if (lon > -1.8 && lon < 3.2 && lat > 42.3 && lat < 43.4) pyrenees += 1;
  }
  assert.ok(pyrenees >= 4, `${pyrenees} points on the Pyrenees`);
});

test("boxes: a country across the 180th meridian is boxed the short way round", () => {
  const boxes = shapeBoxes({ features: [{ properties: { code: "FJ" }, geometry: { type: "Polygon", coordinates: [[[177, -18], [-179, -18], [-179, -16], [177, -16], [177, -18]]] } }, square("X", 10, 10)] });
  assert.deepEqual(boxes.get("FJ"), [177, -18, -179, -16]);
  assert.deepEqual(boxes.get("X"), [10, 10, 11, 11]);
  const chizu = shapeBoxes(world);
  const russia = chizu.get("RU")!;
  assert.ok(russia[0] > russia[2], "Russia crosses the 180th meridian");
  assert.ok(chizu.has("JP") && chizu.has("BR"));
});

test("near a place: the countries a view of it can reach", () => {
  const boxes = shapeBoxes(world);
  const tokyo = codesNear(boxes, 139.7, 35.7, 8);
  assert.ok(tokyo.includes("JP"));
  assert.ok(!tokyo.includes("BR") && !tokyo.includes("US") && !tokyo.includes("FR"));
  const berlin = codesNear(boxes, 13.4, 52.5, 5);
  for (const code of ["DE", "PL", "CZ"]) assert.ok(berlin.includes(code), code);
  assert.ok(!berlin.includes("JP"));
  // Fiji, from either side of the 180th meridian
  assert.ok(codesNear(boxes, 179.5, -17.5, 2).includes("FJ"));
  assert.ok(codesNear(boxes, -179.5, -17.5, 2).includes("FJ"));
  // from over the pole, every longitude is in reach
  assert.ok(codesNear(boxes, 0, 85, 10).includes("RU") && codesNear(boxes, 0, 85, 10).includes("CA"));
  assert.ok(codesNear(boxes, 0, 0, 90).length > 100, "the whole near side");
});
