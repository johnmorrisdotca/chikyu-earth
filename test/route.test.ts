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
  // GeographicLib 2.1 (Karney's geodesic, WGS84) for the same two places, read 2026-11-13: 9582.317519 km, 336.263635 and 211.653406 degrees
  assert.ok(Math.abs(leg.kilometres - 9582.317519) < 0.001, String(leg.kilometres));
  assert.ok(Math.abs(leg.initialBearing - 336.263635) < 0.0005, String(leg.initialBearing));
  assert.ok(Math.abs(leg.finalBearing - 211.653406) < 0.0005, String(leg.finalBearing));
  assert.ok(Math.abs(leg.flightHours - 9582.317519 / FLIGHT_SPEED_KM_H) < 1e-6);
  assert.ok(Math.abs(leg.kilometres - leg.greatCircleKm) < 40);
  const points = routePoints(TOKYO, LONDON, 5);
  assert.equal(points.length, 5);
  assert.equal(points[0]?.lon, TOKYO.lon);
  assert.deepEqual(points[4], LONDON);
  assert.ok(Math.abs(points[2]!.lat - leg.midpoint.lat) < 1e-9);
  assert.ok(Math.abs(points[2]!.lon - leg.midpoint.lon) < 1e-9);
});

test("Vincenty's test pair, Flinders Peak to Buninyong, agrees with Karney's geodesic to a tenth of a millimetre", () => {
  // The pair Geoscience Australia and Vincenty (1975) use; the values are GeographicLib 2.1's for WGS84, read 2026-11-13: 54972.271139 m, azimuths 306.868159 and 307.173631 (the book's 54972.271 m is on GRS80)
  const flinders = { lon: 144 + 25 / 60 + 29.5244 / 3600, lat: -(37 + 57 / 60 + 3.7203 / 3600) };
  const buninyong = { lon: 143 + 55 / 60 + 35.3839 / 3600, lat: -(37 + 39 / 60 + 10.1561 / 3600) };
  const leg = routeLeg(flinders, buninyong);
  assert.ok(leg?.exact);
  assert.ok(Math.abs(leg.kilometres * 1000 - 54972.271139) < 1e-3, String(leg.kilometres * 1000));
  assert.ok(Math.abs(leg.initialBearing - 306.868159) < 1e-5, String(leg.initialBearing));
  assert.ok(Math.abs(leg.finalBearing - 307.173631) < 1e-5, String(leg.finalBearing));
});

test("Sydney to Los Angeles is 12063.191 km (GeographicLib 2.1, read 2026-11-13)", () => {
  assert.ok(Math.abs((routeLeg(SYDNEY, LOS_ANGELES)?.kilometres ?? 0) - 12063.190949) < 0.001);
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

test("two places nearly opposite have a route of evenly spaced points from one to the other", () => {
  // Vincenty's formula does not converge here, so the route is the great circle
  const from = { lon: 0, lat: 0 };
  const to = { lon: 179.5, lat: 0.3 };
  const leg = routeLeg(from, to);
  assert.equal(leg?.exact, false);
  const points = routePoints(from, to, 5);
  assert.equal(points.length, 5);
  assert.deepEqual(points[0], from);
  assert.deepEqual(points[4], to);
  const step = (leg?.greatCircleKm ?? 0) / 4;
  for (let i = 1; i < 5; i += 1) {
    const apart = greatCircleKm(points[i - 1]!, points[i]!) ?? 0;
    assert.ok(Math.abs(apart - step) < 1, `${i}: ${apart} against ${step}`);
  }
});
