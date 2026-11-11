// The Earth-orbit catalogue's pure rules: the class of an orbit from its elements (our thresholds, stated), the kind of an object, the colours and legend, and the fleets. The sample is test/recorded/catalogue-gp-sample-2026-11-11.json:
// Space-Track's GP shape, with the ISS, Hubble and NAVSTAR 48 rows from the recorded answer of 2026-11-08 and the rest made up (six-digit numbers, a debris piece, a Molniya-like orbit).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CLASS_COLOURS, CLASS_LABELS, CLASS_LIMITS, FLEETS, GEO_ALTITUDE_KM, KIND_COLOURS, OBJECT_KINDS, ORBIT_CLASSES, classOfElements, countFleets, fleetOf, legend, orbitClass, orbitShape, readCatalogueRecords, readKind, type OrbitShape } from "../src/catalogue/index.ts";

const SAMPLE = readFileSync(new URL("./recorded/catalogue-gp-sample-2026-11-11.json", import.meta.url), "utf8");
const shape = (perigeeKm: number, apogeeKm: number): OrbitShape => {
  const a = (perigeeKm + apogeeKm) / 2 + 6371;
  return { semiMajorKm: a, periodMinutes: 0, perigeeKm, apogeeKm, eccentricity: (apogeeKm - perigeeKm) / (2 * a) };
};

test("the shape of an orbit comes from the mean motion and eccentricity alone, and the ISS is where it is", () => {
  const iss = orbitShape(15.49256954, 0.0007219)!;
  assert.ok(iss.perigeeKm > 400 && iss.apogeeKm < 440, `${iss.perigeeKm} to ${iss.apogeeKm}`);
  assert.ok(Math.abs(iss.periodMinutes - 92.95) < 0.05);
  const geo = orbitShape(1.00270, 0)!;
  assert.ok(Math.abs(geo.perigeeKm - GEO_ALTITUDE_KM) < 20, `${geo.perigeeKm}`);
  for (const bad of [[0, 0], [-1, 0], [15, 1], [15, -0.1], [Number.NaN, 0], [Infinity, 0]] as const) assert.equal(orbitShape(bad[0], bad[1]), null);
});

test("the class thresholds: low under 2,000 km, geostationary within 1,500 km of 35,786, highly elliptical from 0.25, medium between", () => {
  assert.deepEqual(CLASS_LIMITS, { leoApogeeKm: 2_000, heoEccentricity: 0.25, geoBandKm: 1_500 });
  assert.equal(orbitClass(shape(400, 420)), "leo");
  assert.equal(orbitClass(shape(500, 1_999.9)), "leo");
  assert.equal(orbitClass(shape(500, 2_000)), "other", "a lowest point under 2,000 km and a highest of 2,000 is not low and not medium");
  assert.equal(orbitClass(shape(2_000, 3_000)), "meo");
  assert.equal(orbitClass(shape(19_000, 34_285)), "meo");
  assert.equal(orbitClass(shape(19_000, 34_286)), "other");
  assert.equal(orbitClass(shape(34_286, 37_286)), "geo");
  assert.equal(orbitClass(shape(34_285, 37_286)), "other");
  assert.equal(orbitClass(shape(34_286, 37_287)), "other");
  assert.equal(orbitClass(shape(38_000, 39_000)), "other", "above the geostationary belt");
  assert.equal(orbitClass({ ...shape(500, 600), eccentricity: 0.25 }), "heo");
  assert.equal(orbitClass({ ...shape(500, 600), eccentricity: 0.2499 }), "leo");
  assert.equal(orbitClass(shape(600, 39_000)), "heo", "a transfer orbit swings far out");
});

test("classes of the sample's objects, from their elements alone", () => {
  const { records } = readCatalogueRecords(SAMPLE);
  const classes = Object.fromEntries(records.map((record) => [record.set.NORAD_CAT_ID, classOfElements(record.set.MEAN_MOTION, record.set.ECCENTRICITY)]));
  assert.equal(classes[25544], "leo");
  assert.equal(classes[20580], "leo");
  assert.equal(classes[26407], "meo");
  assert.equal(classes[900001], "geo");
  assert.equal(classes[1000002], "heo");
  assert.equal(classes[345678], "leo");
  assert.equal(classOfElements(0, 0), null);
});

test("kinds: Space-Track's words and the short codes, anything else unknown", () => {
  assert.deepEqual(["PAYLOAD", "PAY", "payload", " Payload "].map(readKind), ["PAY", "PAY", "PAY", "PAY"]);
  assert.deepEqual(["ROCKET BODY", "R/B", "RB"].map(readKind), ["RB", "RB", "RB"]);
  assert.deepEqual(["DEBRIS", "deb"].map(readKind), ["DEB", "DEB"]);
  assert.deepEqual(["TBA", "UNKNOWN", "", "satellite"].map(readKind), ["UNK", "UNK", "UNK", "UNK"]);
  assert.equal(readKind(undefined), "UNK");
  assert.equal(readKind(null), "UNK");
});

test("a colour and a legend for each class and each kind, in both languages, and no two colours alike", () => {
  for (const by of ["class", "kind"] as const) {
    for (const lang of ["en", "ja"] as const) {
      const lines = legend(by, lang);
      assert.equal(lines.length, by === "class" ? ORBIT_CLASSES.length : OBJECT_KINDS.length);
      assert.ok(lines.every((line) => line.label.length > 0 && /^#[0-9a-f]{6}$/.test(line.colour)));
      assert.equal(new Set(lines.map((line) => line.colour)).size, lines.length);
    }
  }
  assert.deepEqual(legend("class", "en").map((line) => line.key), [...ORBIT_CLASSES]);
  assert.deepEqual(legend("kind", "ja").map((line) => line.key), [...OBJECT_KINDS]);
  assert.equal(legend("kind", "ja")[2]?.label, "デブリ");
  assert.equal(Object.keys(CLASS_COLOURS).length, 5);
  assert.equal(Object.keys(KIND_COLOURS).length, 4);
  assert.ok(Object.values(CLASS_LABELS).every((label) => label.rule.length > 0));
});

test("fleets are found from the name and only for payloads", () => {
  assert.equal(fleetOf("STARLINK-1007", "PAY"), "starlink");
  assert.equal(fleetOf("starlink-30000"), "starlink");
  assert.equal(fleetOf("STARLINK-1007 R/B", "RB"), undefined);
  assert.equal(fleetOf("IRIDIUM 33 DEB", "DEB"), undefined);
  assert.equal(fleetOf("IRIDIUM 106", "PAY"), "iridium");
  assert.equal(fleetOf("ONEWEB-0012", "PAY"), "oneweb");
  assert.equal(fleetOf("NAVSTAR 48 (USA 151)", "PAY"), "gps");
  assert.equal(fleetOf("GPS BIIR-2  (PRN 13)", "PAY"), "gps");
  assert.equal(fleetOf("GSAT0101 (GALILEO-PFM)", "PAY"), "galileo");
  assert.equal(fleetOf("COSMOS 2545 (GLONASS-M)", "PAY"), "glonass");
  assert.equal(fleetOf("BEIDOU-3 M1", "PAY"), "beidou");
  assert.equal(fleetOf("ISS (ZARYA)", "PAY"), "stations");
  assert.equal(fleetOf("CSS (TIANHE)", "PAY"), "stations");
  assert.equal(fleetOf("HST", "PAY"), undefined);
  assert.equal(fleetOf("ISSA SATELLITE"), undefined, "a name that only starts with the letters is not the station");
  assert.deepEqual(FLEETS.map((fleet) => fleet.id), ["starlink", "oneweb", "gps", "galileo", "glonass", "beidou", "iridium", "stations"]);
});

test("N of M: the count in each fleet and the total", () => {
  const { fleets, total } = countFleets([{ name: "STARLINK-1", kind: "PAY" }, { name: "STARLINK-2", kind: "PAY" }, { name: "STARLINK-3 DEB", kind: "DEB" }, { name: "ONEWEB-1", kind: "PAY" }, { name: "HST", kind: "PAY" }]);
  assert.equal(total, 5);
  assert.equal(fleets["starlink"], 2);
  assert.equal(fleets["oneweb"], 1);
  assert.equal(fleets["gps"], 0);
  assert.equal(Object.keys(fleets).length, FLEETS.length);
});
