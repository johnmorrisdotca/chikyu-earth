// The small map's numbers: the night side is the hemisphere opposite the Sun, and a ground track is split where it crosses the date line.
import assert from "node:assert/strict";
import test from "node:test";
import { subsolarPoint } from "../src/realistic/sun.ts";
import type { ElementSet } from "../src/satellites/types.ts";
import { nightSide, trackPicture } from "../src/track/index.ts";

const RAD = Math.PI / 180;
const ISS: ElementSet = {
  OBJECT_NAME: "ISS (ZARYA)",
  EPOCH: "2026-11-02T10:25:21.580320",
  MEAN_MOTION: 15.49150046,
  ECCENTRICITY: 0.0007139,
  INCLINATION: 51.6332,
  RA_OF_ASC_NODE: 335.9757,
  ARG_OF_PERICENTER: 339.3739,
  MEAN_ANOMALY: 20.6961,
  NORAD_CAT_ID: 25544,
  BSTAR: 0.00012,
  MEAN_MOTION_DOT: 0.0001,
  MEAN_MOTION_DDOT: 0,
};

/** Degrees between two points on the sphere. */
const apart = (lat: number, lon: number, otherLat: number, otherLon: number): number => {
  const a = lat * RAD;
  const b = otherLat * RAD;
  const cos = Math.sin(a) * Math.sin(b) + Math.cos(a) * Math.cos(b) * Math.cos((otherLon - lon) * RAD);
  return Math.acos(Math.max(-1, Math.min(1, cos))) / RAD;
};

test("the night side is the hemisphere opposite the Sun, closed along the night pole", () => {
  const ms = Date.UTC(2026, 10, 3, 12);
  const sun = subsolarPoint(ms);
  const ring = nightSide(ms);
  assert.ok(Math.abs(sun.lat) >= 2, "November noon is not an equinox");
  const curve = ring.slice(0, -2);
  for (const [lat, lon] of curve) {
    assert.ok(lat > -90 && lat < 90);
    assert.ok(Math.abs(apart(sun.lat, sun.lon, lat, lon) - 90) < 0.2, `${lat}, ${lon}`);
  }
  const lons = curve.map(([, lon]) => lon);
  assert.ok(Math.max(...lons) - Math.min(...lons) > 300);
  const pole = ring[ring.length - 1]!;
  assert.equal(pole[0], sun.lat >= 0 ? -90 : 90);
  assert.ok(apart(sun.lat, sun.lon, pole[0], pole[1]) > 90);
});

test("near an equinox the night side is the half of the map opposite the Sun", () => {
  const ms = Date.UTC(2026, 2, 20, 12);
  const sun = subsolarPoint(ms);
  assert.ok(Math.abs(sun.lat) < 2);
  const ring = nightSide(ms);
  assert.deepEqual(ring.map(([lat]) => lat), [90, -90, -90, 90]);
  const west = ring[0]![1];
  const east = ring[2]![1];
  const anti = sun.lon + 180;
  assert.equal(east - west, 180);
  assert.ok(anti > west && anti < east);
});

test("one orbit's track has a past and a coming part, and no part jumps the date line", () => {
  const picture = trackPicture(ISS, Date.UTC(2026, 10, 3, 12), 180);
  const lines = picture.filter((piece) => piece.kind === "line");
  assert.ok(lines.some((piece) => piece.part === "past"));
  assert.ok(lines.some((piece) => piece.part === "coming"));
  for (const piece of lines) {
    for (let i = 1; i < piece.points.length; i += 1) assert.ok(Math.abs(piece.points[i]![1] - piece.points[i - 1]![1]) <= 180);
  }
  const mark = picture.find((piece) => piece.kind === "mark");
  assert.ok(mark && mark.kind === "mark");
  assert.ok(Math.abs(mark.at[0]) < 52);
  assert.ok(picture.some((piece) => piece.kind === "night"));
});
