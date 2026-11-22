// The flat map's pure parts: the facts of a group, the orbital planes (checked on the real constellations the demo ships), the map's geometry and the words.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { FLAT_WORDS, GROUP_COLOURS, MASK_COLS, MAX_ZOOM, PLANE_COLOURS, clampView, clusterPlanes, groundPoint, groupFacts, nightWeights, photoPieces, photoWidth, pixelsPerDegree, planeLetter, projectFlat, readLook, unprojectFlat, wrapLongitude, zoomAbout, type FlatView } from "../src/flat/index.ts";
import { SATELLITE_GROUPS } from "../src/satellites/index.ts";

interface File {
  fields: string[];
  rows: (string | number)[][];
}
const group = (id: string) => {
  const file = JSON.parse(readFileSync(new URL(`../demo/elements/${id}.json`, import.meta.url), "utf8")) as File;
  return file.rows.map((row) => Object.fromEntries(file.fields.map((field, i) => [field, row[i]])) as { MEAN_MOTION: number; ECCENTRICITY: number; INCLINATION: number; RA_OF_ASC_NODE: number; EPOCH: string });
};

test("plane letters run A to Z, then AA", () => {
  assert.deepEqual([0, 1, 25, 26, 27, 51, 52].map(planeLetter), ["A", "B", "Z", "AA", "AB", "AZ", "BA"]);
});

test("the planes of the real constellations come out as the real planes", () => {
  const planes = (id: string) => clusterPlanes(group(id)).planes;
  assert.equal(planes("gps").length, 6);
  assert.equal(planes("glonass").length, 3);
  assert.equal(planes("iridium").length, 6);
  // Galileo: three planes about 120 degrees apart, lettered going east; its two wrong-orbit satellites are too few to be a plane
  const galileo = clusterPlanes(group("galileo"));
  assert.deepEqual(galileo.planes.map((p) => p.id), ["A", "B", "C"]);
  assert.ok(galileo.planes.every((p, i) => i === 0 || p.raanDeg > galileo.planes[i - 1]!.raanDeg));
  assert.ok(Math.abs(galileo.planes[1]!.raanDeg - galileo.planes[0]!.raanDeg - 120) < 15);
  assert.ok(galileo.other.length >= 1 && galileo.other.length <= 3);
  assert.equal(galileo.planes.reduce((n, p) => n + p.count, 0) + galileo.other.length, 32);
  assert.equal(galileo.clustered, true);
  // every satellite is in one plane or in `other`, and planeOf agrees
  for (const [i, at] of galileo.planeOf.entries()) assert.equal(at >= 0 ? galileo.planes[at]!.members.includes(i) : galileo.other.includes(i), true);
  assert.ok(planes("oneweb").length >= 11);
});

test("a group spread through every longitude has no planes to show, and a belt on the equator has none at all", () => {
  const starlink = clusterPlanes(group("starlink"));
  assert.equal(starlink.clustered, false);
  assert.equal(starlink.planes.length, 1);
  const belt = clusterPlanes(group("geostationary").filter((one) => one.INCLINATION < 3));
  assert.equal(belt.planes.length, 0);
  assert.equal(belt.clustered, false);
});

test("planes wrap across 0 degrees of right ascension", () => {
  const node = (RA_OF_ASC_NODE: number) => ({ INCLINATION: 55, RA_OF_ASC_NODE });
  const clusters = clusterPlanes([node(357), node(359), node(1), node(3), node(180), node(182), node(184)]);
  assert.deepEqual(clusters.planes.map((p) => p.count).sort(), [3, 4]);
  const across = clusters.planes.find((p) => p.count === 4)!;
  assert.ok(across.raanDeg > 357 || across.raanDeg < 3);
  assert.ok(Math.abs(across.spanDeg - 6) < 1e-9);
  assert.deepEqual(clusterPlanes([]).planes, []);
  assert.equal(clusterPlanes([node(10)]).planes.length, 0, "one satellite is too few to be a plane");
});

test("groupFacts: GPS is 6 planes at 20,200 km, 55 degrees, 11 hours 58 minutes", () => {
  const facts = groupFacts(group("gps"));
  assert.equal(facts.count, 32);
  assert.equal(facts.planeCount, 6);
  assert.equal(facts.clustered, true);
  assert.ok(Math.abs(facts.meanAltitudeKm - 20_200) < 250, `${facts.meanAltitudeKm}`);
  assert.ok(Math.abs(facts.meanInclinationDeg - 55) < 2);
  assert.ok(Math.abs(facts.periodMinutes - (11 * 60 + 58)) < 3);
  assert.ok(Math.abs(facts.speedKmS - 3.87) < 0.1);
  assert.ok(facts.minAltitudeKm < facts.meanAltitudeKm && facts.meanAltitudeKm < facts.maxAltitudeKm);
  assert.ok(facts.minInclinationDeg <= facts.meanInclinationDeg && facts.meanInclinationDeg <= facts.maxInclinationDeg);
  assert.equal(facts.newestEpochMs, Math.max(...group("gps").map((one) => Date.parse(`${one.EPOCH}Z`))));
  assert.equal(facts.planes.length, facts.planeCount);
  assert.equal(groupFacts(group("starlink")).clustered, false);
  const shell = groupFacts(group("starlink")).meanAltitudeKm;
  assert.ok(shell > 400 && shell < 650, `${shell}`);
});

test("groupFacts of nothing, or of sets that are not orbits, is all zeros and no NaN", () => {
  const empty = groupFacts([]);
  assert.equal(empty.count, 0);
  for (const value of Object.values(empty)) if (typeof value === "number") assert.ok(Number.isFinite(value));
  assert.equal(groupFacts([{ MEAN_MOTION: 0, ECCENTRICITY: 0, INCLINATION: 0, RA_OF_ASC_NODE: 0 }]).count, 0);
});

test("wrapLongitude keeps the short way round", () => {
  assert.equal(wrapLongitude(190), -170);
  assert.equal(wrapLongitude(-181), 179);
  assert.equal(wrapLongitude(180), -180);
  assert.equal(wrapLongitude(540), -180);
  assert.equal(wrapLongitude(0), 0);
});

const wide: FlatView = { width: 720, height: 360, centerLon: 0, centerLat: 0, zoom: 1 };
test("the map: 2 to 1 fits the width, taller boxes are filled and wrap round the sides", () => {
  assert.equal(pixelsPerDegree(wide), 2);
  assert.equal(pixelsPerDegree({ ...wide, width: 390, height: 520 }), 520 / 180);
  assert.equal(pixelsPerDegree({ ...wide, zoom: 4 }), 8);
});

test("projectFlat and unprojectFlat are each other's opposite, and the date line wraps cleanly", () => {
  const view: FlatView = { ...wide, centerLon: 155 };
  const at = projectFlat(view, 139.7, 35.7);
  assert.ok(Math.abs(at.x - (360 + (139.7 - 155) * 2)) < 1e-9 && Math.abs(at.y - (180 - 35.7 * 2)) < 1e-9);
  const back = unprojectFlat(view, at.x, at.y);
  assert.ok(Math.abs(back.lon - 139.7) < 1e-9 && Math.abs(back.lat - 35.7) < 1e-9);
  // 170 west is 35 degrees east of 155 east across the date line: on the right-hand side, not 650 pixels away
  assert.ok(Math.abs(projectFlat(view, -170, 0).x - (360 + 35 * 2)) < 1e-9);
  assert.equal(Math.round(projectFlat(view, 155 - 180, 0).x), 0);
  assert.equal(Math.round(projectFlat(view, 155 + 179.999, 0).x), 720);
});

test("clampView and zoomAbout keep the view on the map and the place under the pointer still", () => {
  assert.equal(clampView({ ...wide, zoom: 100 }).zoom, MAX_ZOOM);
  assert.equal(clampView({ ...wide, zoom: 0.2 }).zoom, 1);
  assert.equal(clampView({ ...wide, centerLon: 200 }).centerLon, -160);
  assert.equal(clampView({ ...wide, centerLat: 50 }).centerLat, 0, "zoom 1 shows the whole height");
  const zoomed = clampView({ ...wide, zoom: 4, centerLat: 80 });
  assert.ok(Math.abs(zoomed.centerLat - (90 - 360 / 2 / 8)) < 1e-9);
  const before = unprojectFlat(wide, 540, 90);
  const after = zoomAbout(wide, 3, 540, 90);
  assert.equal(after.zoom, 3);
  const still = projectFlat(after, before.lon, before.lat);
  assert.ok(Math.abs(still.x - 540) < 1e-6);
  assert.deepEqual(clampView({ ...wide, centerLon: Number.NaN, zoom: Number.NaN, centerLat: Number.NaN }), wide);
});

test("groundPoint: over the equator at the Greenwich meridian, and the Earth's turn moves the longitude west", () => {
  const over = groundPoint(1.1, 0, 0, 0);
  assert.ok(Math.abs(over.lon) < 1e-9 && Math.abs(over.lat) < 1e-9 && Math.abs(over.altitudeKm - 637.1) < 0.1);
  assert.ok(Math.abs(groundPoint(1.1, 0, 0, 30).lon + 30) < 1e-9);
  // y is north: straight up is the pole; z is TEME's y the other way (z = -1 is 90 degrees east of x)
  assert.ok(Math.abs(groundPoint(0, 1.2, 0, 0).lat - 90) < 1e-9);
  assert.ok(Math.abs(groundPoint(0, 0, -1.1, 0).lon - 90) < 1e-9);
  // the geodetic latitude of a point at 45 degrees geocentric is a little over 45
  const mid = groundPoint(Math.SQRT1_2, Math.SQRT1_2, 0, 0);
  assert.ok(mid.lat > 45.1 && mid.lat < 45.2);
});

test("the words: every key in both languages, with the same places to fill", () => {
  assert.deepEqual(Object.keys(FLAT_WORDS.en).sort(), Object.keys(FLAT_WORDS.ja).sort());
  for (const key of Object.keys(FLAT_WORDS.en)) {
    const places = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    assert.deepEqual(places(FLAT_WORDS.ja[key]!), places(FLAT_WORDS.en[key]!), key);
    assert.ok(FLAT_WORDS.ja[key]!.trim() !== "");
  }
});

test("the colours: every group of the package has one, and the planes have twelve", () => {
  for (const g of SATELLITE_GROUPS) assert.match(GROUP_COLOURS[g.id] ?? "", /^#[0-9a-f]{6}$/, g.id);
  assert.equal(new Set(PLANE_COLOURS).size, 12);
});

test("the look is the drawn map unless the page says photo", () => {
  assert.deepEqual([null, "", "map", "photo", " Photo ", "satellite"].map(readLook), ["map", "map", "map", "photo", "photo", "map"]);
});

test("the photo lands where the map puts a place: the Nile delta and Florida, whatever the centre, zoom and box", () => {
  const places = [{ lon: 31, lat: 30.9 }, { lon: -81, lat: 27.5 }, { lon: 139.7, lat: 35.7 }];
  const views: FlatView[] = [
    { width: 720, height: 360, centerLon: 0, centerLat: 0, zoom: 1 },
    { width: 1000, height: 500, centerLon: 150, centerLat: 0, zoom: 1 },
    { width: 390, height: 292, centerLon: -100, centerLat: 0, zoom: 1 },
    { width: 800, height: 400, centerLon: 31, centerLat: 28, zoom: 5 },
    { width: 800, height: 400, centerLon: -80, centerLat: 25, zoom: 8 },
  ];
  for (const view of views) {
    for (const size of [2048, 4096]) {
      const pieces = photoPieces(view, size, size / 2);
      for (const place of places) {
        const at = projectFlat(view, place.lon, place.lat);
        // the picture's own pixel of that place: longitude -180 at the left edge, 90 degrees north at the top
        const want = { x: ((place.lon + 180) / 360) * size, y: ((90 - place.lat) / 180) * (size / 2) };
        const hits = pieces.filter((p) => at.x >= p.dx && at.x <= p.dx + p.dw && at.y >= p.dy && at.y <= p.dy + p.dh);
        // a place off the box (the world is wider than the box) is in none; every place in the box is in a piece, at the picture's pixel
        const inBox = at.x >= 0 && at.x <= view.width && at.y >= 0 && at.y <= view.height;
        if (inBox) assert.ok(hits.length >= 1, `${place.lon} in ${view.width}`);
        for (const p of hits) {
          const x = p.sx + ((at.x - p.dx) / p.dw) * p.sw;
          const y = p.sy + ((at.y - p.dy) / p.dh) * p.sh;
          assert.ok(Math.abs(y - want.y) < 1e-6, `y ${y} ${want.y}`);
          // the picture repeats round the world: the same pixel
          assert.ok(Math.abs(x - want.x) < 1e-6, `x ${x} ${want.x} at ${view.centerLon}`);
        }
      }
    }
  }
});

test("the photo's pieces fill the box and stay inside the picture", () => {
  for (const view of [{ width: 720, height: 360, centerLon: 170, centerLat: 0, zoom: 1 }, { width: 390, height: 520, centerLon: -179, centerLat: 0, zoom: 1 }, { width: 800, height: 400, centerLon: 0, centerLat: 80, zoom: 4 }] as FlatView[]) {
    const pieces = photoPieces(view, 2048, 1024);
    assert.ok(pieces.length >= 1 && pieces.length <= 3);
    assert.ok(Math.abs(pieces.reduce((sum, p) => sum + p.dw, 0) - view.width) < 1e-6, "the pieces cover the box's width");
    for (const p of pieces) {
      assert.ok(p.sx >= -1e-9 && p.sx + p.sw <= 2048 + 1e-9 && p.sy >= -1e-9 && p.sy + p.sh <= 1024 + 1e-9);
    }
    // joined side by side without a gap
    pieces.slice(1).forEach((p, i) => assert.ok(Math.abs(p.dx - (pieces[i]!.dx + pieces[i]!.dw)) < 1e-6));
  }
});

test("the picture's size follows the zoom, up to 4096 and never above the cap", () => {
  assert.equal(photoWidth("day", 500), 1024);
  assert.equal(photoWidth("day", 1800), 2048);
  assert.equal(photoWidth("day", 9000), 4096);
  assert.equal(photoWidth("day", 9000, 2048), 2048);
  assert.equal(photoWidth("night", 9000), 2048);
  assert.equal(photoWidth("day", 9000, 100), 1024);
});

test("the night: no darkening or lights under the Sun, full at the other side of the Earth, a soft edge between, and the grid is the picture's", () => {
  const { veil, lights } = nightWeights(20, 10);
  const cell = (lon: number, lat: number): number => Math.floor(90 - lat) * MASK_COLS + Math.floor(lon + 180);
  assert.equal(veil[cell(20, 10)], 0);
  assert.equal(lights[cell(20, 10)], 0);
  assert.equal(lights[cell(-160, -10)], 255);
  assert.ok(Math.abs(veil[cell(-160, -10)]! - 219) <= 1);
  // along the equator, 90 degrees from a Sun on it is the terminator: the day picture is already half darkened and the lights are not yet in; 96 degrees on, in twilight, they are half in or more
  const sunUp = nightWeights(0, 0);
  const at90 = sunUp.veil[cell(90, 0)]!;
  assert.ok(at90 > 100 && at90 < 219, `veil at the terminator ${at90}`);
  assert.ok(sunUp.lights[cell(90, 0)]! < 60);
  assert.ok(sunUp.lights[cell(96, 0)]! > 100);
  // darker the further into the night
  let last = -1;
  for (let lon = 20; lon <= 200; lon += 10) {
    const v = veil[cell(lon > 180 ? lon - 360 : lon, 10)]!;
    assert.ok(v >= last, "never lighter further into the night");
    last = v;
  }
});
