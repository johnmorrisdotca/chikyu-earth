// The addresses of NASA GIBS snapshots: the box, the layer for a day, the date line and the poles, the days to try and the credit. Nothing is fetched: only the address strings are read.
import assert from "node:assert/strict";
import { test } from "node:test";
import { PHOTO_DEFAULT_PX, PHOTO_MAX_KM, PHOTO_MAX_PX, PHOTO_MIN_KM, photoBox, photoCredit, photoFallbacks, photoLayer, photoPieces, photoUrl } from "../src/photos/index.ts";

const NOAA20 = "VIIRS_NOAA20_CorrectedReflectance_TrueColor";
const SNPP = "VIIRS_SNPP_CorrectedReflectance_TrueColor";
const TERRA = "MODIS_Terra_CorrectedReflectance_TrueColor";
const query = (url: string): URLSearchParams => new URL(url).searchParams;
const bbox = (url: string): number[] => query(url).get("BBOX")!.split(",").map(Number);
const near = (actual: number, expected: number, tolerance = 1e-4): void => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

test("photoUrl: a GetMap request for EPSG:4326 with the layer, the day, the box and the size", () => {
  const url = photoUrl({ lat: 35.68, lon: 139.77, sizeKm: 200, date: "2026-11-10", widthPx: 600 })!;
  assert.ok(url.startsWith("https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?"));
  const q = query(url);
  assert.equal(q.get("SERVICE"), "WMS");
  assert.equal(q.get("REQUEST"), "GetMap");
  assert.equal(q.get("VERSION"), "1.1.1");
  assert.equal(q.get("SRS"), "EPSG:4326");
  assert.equal(q.get("FORMAT"), "image/jpeg");
  assert.equal(q.get("LAYERS"), NOAA20);
  assert.equal(q.get("TIME"), "2026-11-10");
  assert.equal(q.get("WIDTH"), "600");
  assert.equal(q.get("HEIGHT"), "600");
  const [west, south, east, north] = bbox(url);
  near((south! + north!) / 2, 35.68);
  near((west! + east!) / 2, 139.77);
  near(north! - south!, 200 / 111.195);
  // longitude is stretched by 1 / cos(latitude) so the ground is square
  near((east! - west!) * Math.cos((35.68 * Math.PI) / 180), 200 / 111.195, 1e-3);
});

test("photoUrl: the width defaults to 512, is held at 2048 and the box size is held between 1 and 4000 km", () => {
  const plain = photoUrl({ lat: 0, lon: 0, sizeKm: 100, date: "2026-11-10" })!;
  assert.equal(query(plain).get("WIDTH"), "512");
  assert.equal(PHOTO_DEFAULT_PX, 512);
  assert.equal(PHOTO_MAX_PX, 2048);
  assert.equal(PHOTO_MAX_KM, 4000);
  assert.equal(PHOTO_MIN_KM, 1);
  assert.equal(query(photoUrl({ lat: 0, lon: 0, sizeKm: 100, date: "2026-11-10", widthPx: 9999 })!).get("WIDTH"), "2048");
  assert.equal(query(photoUrl({ lat: 0, lon: 0, sizeKm: 100, date: "2026-11-10", widthPx: 0 })!).get("WIDTH"), "1");
  const [, s1, , n1] = bbox(photoUrl({ lat: 0, lon: 0, sizeKm: 0.001, date: "2026-11-10" })!);
  near(n1! - s1!, PHOTO_MIN_KM / 111.195);
  const [, s2, , n2] = bbox(photoUrl({ lat: 0, lon: 0, sizeKm: 99999, date: "2026-11-10" })!);
  near(n2! - s2!, PHOTO_MAX_KM / 111.195);
});

test("photoUrl: a date as a Date or milliseconds gives its UTC day; a bad one throws", () => {
  const ms = Date.UTC(2026, 10, 10, 23, 59);
  assert.equal(query(photoUrl({ lat: 0, lon: 0, sizeKm: 50, date: ms })!).get("TIME"), "2026-11-10");
  assert.equal(query(photoUrl({ lat: 0, lon: 0, sizeKm: 50, date: new Date(ms) })!).get("TIME"), "2026-11-10");
  assert.throws(() => photoUrl({ lat: 0, lon: 0, sizeKm: 50, date: "2026-13-01" }), RangeError);
  assert.throws(() => photoUrl({ lat: 0, lon: 0, sizeKm: 50, date: "10 Nov 2026" }), RangeError);
  assert.throws(() => photoUrl({ lat: 0, lon: 0, sizeKm: 50, date: Number.NaN }), RangeError);
  assert.throws(() => photoUrl({ lat: Number.NaN, lon: 0, sizeKm: 50, date: "2026-11-10" }), RangeError);
  assert.throws(() => photoUrl({ lat: 0, lon: Number.POSITIVE_INFINITY, sizeKm: 50, date: "2026-11-10" }), RangeError);
  assert.throws(() => photoUrl({ lat: 0, lon: 0, sizeKm: Number.NaN, date: "2026-11-10" }), RangeError);
});

test("photoUrl: no picture before the first day of MODIS Terra", () => {
  assert.equal(photoUrl({ lat: 0, lon: 0, sizeKm: 50, date: "2000-02-23" }), null);
  assert.ok(photoUrl({ lat: 0, lon: 0, sizeKm: 50, date: "2000-02-24" }));
});

test("photoLayer: NOAA-20 from 2018-01-05, Suomi NPP for its gaps and before it, MODIS Terra before that, none before 2000-02-24", () => {
  assert.equal(photoLayer("2026-11-10"), NOAA20);
  assert.equal(photoLayer("2018-01-05"), NOAA20);
  // a day after the last listed one: the layers still running are asked for, in the order of the list
  assert.equal(photoLayer("2026-11-17"), NOAA20);
  assert.equal(photoLayer("2027-03-01"), NOAA20);
  // NOAA-20 has no 2018-02-22 or 2018-02-23: Suomi NPP has them
  assert.equal(photoLayer("2018-02-22"), SNPP);
  // before NOAA-20: Suomi NPP from 2015-11-24, MODIS Terra before that; in Suomi NPP's own gap (2022-07-28 to 2022-08-09) NOAA-20 has the day
  assert.equal(photoLayer("2017-12-31"), SNPP);
  assert.equal(photoLayer("2015-11-24"), SNPP);
  assert.equal(photoLayer("2015-11-23"), TERRA);
  assert.equal(photoLayer("2010-06-01"), TERRA);
  assert.equal(photoLayer("2022-08-05"), NOAA20);
  assert.equal(photoLayer("2000-02-24"), TERRA);
  assert.equal(photoLayer("1999-12-31"), null);
  // the oldest days of Terra's gaps in the list have no picture
  assert.equal(photoLayer("2000-04-26"), null);
});

test("photoBox: a plain box is square on the ground and does not wrap", () => {
  const box = photoBox({ lat: 0, lon: 10, sizeKm: 111.195, date: "2026-11-10" });
  near(box.south, -0.5);
  near(box.north, 0.5);
  near(box.west, 9.5);
  near(box.east, 10.5);
  assert.equal(box.wraps, false);
  const wrapped = photoBox({ lat: 0, lon: 370, sizeKm: 111.195, date: "2026-11-10" });
  near(wrapped.west, 9.5);
});

test("photoBox: at 60 degrees north a degree of longitude is half as long, so the box is twice as wide", () => {
  const box = photoBox({ lat: 60, lon: 0, sizeKm: 111.195, date: "2026-11-10" });
  near(box.north - box.south, 1);
  near(box.east - box.west, 1 / Math.cos((60 * Math.PI) / 180), 0.01);
});

test("photoBox: across the date line west goes below -180 or east above 180", () => {
  const east = photoBox({ lat: 0, lon: 179.9, sizeKm: 111.195, date: "2026-11-10" });
  assert.equal(east.wraps, true);
  near(east.east, 180.4);
  const west = photoBox({ lat: 0, lon: -179.9, sizeKm: 111.195, date: "2026-11-10" });
  assert.equal(west.wraps, true);
  near(west.west, -180.4);
  assert.equal(photoBox({ lat: 0, lon: 180, sizeKm: 111.195, date: "2026-11-10" }).wraps, true);
  assert.equal(photoBox({ lat: 0, lon: -180, sizeKm: 111.195, date: "2026-11-10" }).wraps, true);
});

test("photoBox: at a pole the box is moved down to stay on the Earth and spreads round in longitude", () => {
  const north = photoBox({ lat: 90, lon: 0, sizeKm: 500, date: "2026-11-10" });
  near(north.north, 90);
  near(north.north - north.south, 500 / 111.195);
  // 4.5 degrees of latitude from the pole: a square on the ground is about 115 degrees of longitude wide
  near(north.east - north.west, 114.6, 0.2);
  near((north.west + north.east) / 2, 0);
  assert.equal(north.wraps, false);
  const south = photoBox({ lat: -90, lon: 30, sizeKm: 500, date: "2026-11-10" });
  near(south.south, -90);
  near(south.north, -90 + 500 / 111.195);
  const close = photoBox({ lat: 89, lon: 0, sizeKm: 200, date: "2026-11-10" });
  assert.ok(close.north <= 90 + 1e-9);
  assert.ok(close.east - close.west > 100);
  const beyond = photoBox({ lat: 123, lon: 0, sizeKm: 200, date: "2026-11-10" });
  assert.ok(beyond.north <= 90 + 1e-9);
});

test("photoUrl: a box over the date line or a pole is moved inside the world, one request", () => {
  const [west, , east] = bbox(photoUrl({ lat: 0, lon: 179.9, sizeKm: 111.195, date: "2026-11-10" })!);
  assert.ok(west! >= -180 && east! <= 180 + 1e-9);
  near(east! - west!, 1);
  const [w2, , e2] = bbox(photoUrl({ lat: 0, lon: -179.9, sizeKm: 111.195, date: "2026-11-10" })!);
  assert.ok(w2! >= -180 - 1e-9 && e2! <= 180);
  const [, south, , north] = bbox(photoUrl({ lat: 90, lon: 0, sizeKm: 300, date: "2026-11-10" })!);
  assert.ok(south! >= -90 && north! <= 90 + 1e-9);
});

test("photoPieces: one piece for a plain box, two that meet at the date line for a box across it", () => {
  const one = photoPieces({ lat: 35, lon: 139, sizeKm: 100, date: "2026-11-10", widthPx: 400 });
  assert.equal(one.length, 1);
  assert.equal(one[0]!.offsetPx, 0);
  assert.equal(one[0]!.widthPx, 400);
  assert.equal(one[0]!.heightPx, 400);

  const two = photoPieces({ lat: 0, lon: 179.75, sizeKm: 111.195, date: "2026-11-10", widthPx: 400 });
  assert.equal(two.length, 2);
  const [left, right] = two as [(typeof two)[number], (typeof two)[number]];
  near(left.west, 179.25);
  assert.equal(left.east, 180);
  assert.equal(right.west, -180);
  near(right.east, -179.75);
  assert.equal(left.offsetPx, 0);
  assert.equal(right.offsetPx, left.widthPx);
  assert.equal(left.widthPx + right.widthPx, 400);
  assert.equal(left.widthPx, 300);
  assert.equal(left.heightPx, 400);
  assert.equal(right.heightPx, 400);
  assert.deepEqual(bbox(left.url), [left.west, left.south, 180, left.north].map((n) => Number(n.toFixed(5))));
  assert.equal(query(right.url).get("WIDTH"), "100");
  assert.equal(query(left.url).get("TIME"), "2026-11-10");

  // the other side of the line: the western piece is on the right-hand end of the world
  const mirror = photoPieces({ lat: 0, lon: -179.75, sizeKm: 111.195, date: "2026-11-10", widthPx: 400 });
  assert.equal(mirror.length, 2);
  near(mirror[0]!.west, 179.75);
  assert.equal(mirror[0]!.east, 180);
  assert.equal(mirror[1]!.west, -180);
  near(mirror[1]!.east, -179.25);
  assert.equal(mirror[0]!.widthPx, 100);
  assert.equal(mirror[1]!.widthPx, 300);

  assert.deepEqual(photoPieces({ lat: 0, lon: 0, sizeKm: 100, date: "1990-01-01" }), []);
});

test("photoFallbacks: the day asked for, then the days before it, skipping a day no layer has", () => {
  const shots = photoFallbacks({ lat: 35, lon: 139, sizeKm: 100, date: "2026-11-10" }, 3);
  assert.deepEqual(shots.map((shot) => shot.date), ["2026-11-10", "2026-11-09", "2026-11-08"]);
  assert.ok(shots.every((shot) => shot.layer === NOAA20));
  assert.ok(shots.every((shot, i) => query(shot.url).get("TIME") === shots[i]!.date && shot.pieces.length === 1));
  assert.equal(photoFallbacks({ lat: 35, lon: 139, sizeKm: 100, date: "2026-11-10" }).length, 3);
  assert.equal(photoFallbacks({ lat: 35, lon: 139, sizeKm: 100, date: "2026-11-10" }, 1).length, 1);
  // across a month and a year end
  assert.deepEqual(photoFallbacks({ lat: 0, lon: 0, sizeKm: 100, date: "2027-01-01" }, 2).map((shot) => shot.date), ["2027-01-01", "2026-12-31"]);
  // the first day of the data: only that day is left
  assert.deepEqual(photoFallbacks({ lat: 0, lon: 0, sizeKm: 100, date: "2000-02-25" }, 5).map((shot) => shot.date), ["2000-02-25", "2000-02-24"]);
  // the layer changes with the day
  const crossing = photoFallbacks({ lat: 0, lon: 0, sizeKm: 100, date: "2018-01-05" }, 2);
  assert.deepEqual(crossing.map((shot) => shot.layer), [NOAA20, SNPP]);
  // a shot across the date line carries both pieces
  assert.equal(photoFallbacks({ lat: 0, lon: 180, sizeKm: 100, date: "2026-11-10" }, 1)[0]!.pieces.length, 2);
  assert.deepEqual(photoFallbacks({ lat: 0, lon: 0, sizeKm: 100, date: "1999-01-01" }), []);
});

test("photoCredit: names NASA and GIBS in both languages, and the full line is NASA's acknowledgement", () => {
  assert.match(photoCredit("en"), /NASA/);
  assert.match(photoCredit("en"), /GIBS/);
  assert.match(photoCredit("en"), /Worldview/);
  assert.match(photoCredit("ja"), /NASA/);
  assert.match(photoCredit("ja"), /GIBS/);
  assert.match(photoCredit("ja"), /[ぁ-んァ-ヶ一-龠]/);
  assert.notEqual(photoCredit("en"), photoCredit("ja"));
  assert.ok(photoCredit("en", true).startsWith("We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS)"));
  assert.ok(photoCredit("ja", true).includes("Global Imagery Browse Services"));
  assert.ok(photoCredit("ja", true).length > photoCredit("ja").length);
});
