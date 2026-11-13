// Distance and the route between two places. The equator and the pole are WGS84 (NIMA TR8350.2). The cities are kuni 1.6.1, read 2026-11-13.
import test from "node:test";
import assert from "node:assert/strict";
import { FLIGHT_SPEED_KM_H, WGS84_A_M, greatCircleKm, readRoute, routeLeg, routePoints, routeRuns, routeText } from "../src/route.ts";

const TOKYO = { lon: 139.6917, lat: 35.6895 }; // Q1490
const LONDON = { lon: -0.1275, lat: 51.5072 }; // Q84
const SYDNEY = { lon: 151.21, lat: -33.8678 }; // Q3130
const LOS_ANGELES = { lon: -118.24, lat: 34.05 };

test("one degree of the equator is the WGS84 equatorial radius times a degree", () => {
  const leg = routeLeg({ lon: 0, lat: 0 }, { lon: 1, lat: 0 });
  assert.ok(leg);
  assert.equal(leg.exact, true);
  assert.ok(Math.abs(leg.kilometres - (WGS84_A_M * Math.PI) / 180 / 1000) < 1e-6, leg.kilometres.toFixed(9));
  assert.equal(leg.initialBearing, 90);
  assert.equal(leg.finalBearing, 90);
  assert.equal(leg.flightHours, leg.kilometres / FLIGHT_SPEED_KM_H);
});

test("the equator to the pole is the WGS84 quarter meridian, 10001.966 km", () => {
  const leg = routeLeg({ lon: 0, lat: 0 }, { lon: 0, lat: 90 });
  assert.ok(leg?.exact);
  assert.ok(Math.abs(leg.kilometres - 10001.965729) < 1e-3, String(leg.kilometres));
  assert.equal(leg.initialBearing, 0);
});

test("Tokyo to London, the geodesic, the bearings and the flight time (kuni 1.6.1, read 2026-11-13)", () => {
  const leg = routeLeg(TOKYO, LONDON);
  assert.ok(leg?.exact);
  assert.equal(leg.kilometres.toFixed(3), "9582.320");
  assert.equal(leg.initialBearing.toFixed(2), "336.26");
  assert.equal(leg.finalBearing.toFixed(2), "211.65");
  assert.equal(leg.flightHours.toFixed(4), "10.6470");
  assert.ok(Math.abs(leg.kilometres - leg.greatCircleKm) < 40);
  const points = routePoints(TOKYO, LONDON, 5);
  assert.equal(points.length, 5);
  assert.equal(points[0]?.lon, TOKYO.lon);
  assert.deepEqual(points[4], LONDON);
  assert.ok(Math.abs(points[2]!.lat - leg.midpoint.lat) < 1e-9);
  assert.ok(Math.abs(points[2]!.lon - leg.midpoint.lon) < 1e-9);
});

test("Sydney to Los Angeles is split at the date line", () => {
  const runs = routeRuns(routePoints(SYDNEY, LOS_ANGELES, 24));
  assert.ok(runs.length >= 2, String(runs.length));
  assert.equal(routeRuns([{ lon: 179, lat: 0 }, { lon: -179, lat: 0 }]).length, 2);
});

test("a place on itself, a bad place, and the attribute", () => {
  const same = routeLeg({ lon: 10, lat: 20 }, { lon: 10, lat: 20 });
  assert.equal(same?.kilometres, 0);
  assert.equal(same?.flightHours, 0);
  assert.equal(greatCircleKm({ lon: 0, lat: 91 }, { lon: 0, lat: 0 }), null);
  assert.equal(routeLeg({ lon: 0, lat: 0 }, { lon: 180, lat: 0 })?.exact, false);
  assert.deepEqual(readRoute("139.6917,35.6895,-0.1275,51.5072"), { from: TOKYO, to: LONDON });
  assert.equal(readRoute("no"), null);
  assert.equal(readRoute(null), null);
  assert.equal(routeText({ from: { lon: 1, lat: 2 }, to: { lon: 3, lat: 4 } }), "1,2,3,4");
});
