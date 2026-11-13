import assert from "node:assert/strict";
import test from "node:test";
import { alongTrack, placeOf, PLACE_COAST_KM } from "../src/place/index.ts";

const country = (lon: number, lat: number): string | null => placeOf(lon, lat).country?.code ?? null;

test("fixed points: ocean, coast, border, island, poles, antimeridian", () => {
  const pacific = placeOf(-150, 0);
  assert.equal(pacific.country, null);
  assert.equal(pacific.near, null);
  assert.equal(pacific.sea?.id, "pacific-ocean");
  assert.equal(pacific.continent, null);

  const atlantic = placeOf(-40, 40);
  assert.equal(atlantic.sea?.id, "atlantic-ocean");
  assert.equal(atlantic.country, null);

  const mediterranean = placeOf(18, 35);
  assert.equal(mediterranean.sea?.id, "mediterranean-sea");

  const coast = placeOf(-2, 50);
  assert.equal(coast.country, null);
  assert.equal(coast.near?.code, "FR");
  assert.ok(coast.near && coast.near.distanceKm > 0 && coast.near.distanceKm <= PLACE_COAST_KM);
  assert.equal(coast.sea?.id, "atlantic-ocean");

  assert.equal(country(2.35, 48.86), "FR");
  assert.equal(country(7.82, 48.57), "DE");
  assert.equal(placeOf(2.35, 48.86).continent?.id, "europe");
  assert.equal(placeOf(7.82, 48.57).continent?.id, "europe");

  assert.equal(country(-156.3, 20.8), "US");
  assert.equal(country(46.9, -19), "MG");
  assert.equal(country(-21.9, 64.15), "IS");
  assert.equal(placeOf(46.9, -19).continent?.id, "africa");

  const north = placeOf(0, 90);
  assert.equal(north.country, null);
  assert.equal(north.sea?.id, "arctic-ocean");
  const south = placeOf(0, -90);
  assert.equal(south.country?.code, "AQ");
  assert.equal(south.continent?.id, "antarctica");
  assert.equal(south.sea, null);

  assert.equal(country(178, -18), "FJ");
  assert.equal(placeOf(178, -18).continent?.id, "oceania");
  assert.equal(placeOf(180, 0).sea?.id, "pacific-ocean");
  assert.equal(placeOf(-180, 0).sea?.id, "pacific-ocean");
  assert.equal(placeOf(180, 0).country, null);

  assert.equal(placeOf(139.7, 35.7).country?.code, "JP");
  assert.equal(placeOf(139.7, 35.7).continent?.id, "asia");
  assert.equal(placeOf(151.2, -33.9).continent?.id, "australia");
  assert.equal(placeOf(132.2, 43.3).continent?.id, "asia");
  assert.equal(placeOf(37.6, 55.75).continent?.id, "europe");
  assert.equal(placeOf(-52.3, 4.9).country?.code, "FR");
  assert.equal(placeOf(-52.3, 4.9).continent?.id, "south-america");
  assert.equal(placeOf(91, 0).country, null);
});

test("a track reports each country and sea it enters", () => {
  const rows = alongTrack([
    { lon: -40, lat: 40, t: 0 },
    { lon: -3.7, lat: 40.4, t: 1 },
    { lon: 2.35, lat: 48.86, t: 2 },
  ]);
  assert.deepEqual(rows.map((row) => [row.t, row.leaving?.id ?? null, row.entering?.id ?? null, row.entering?.kind ?? null]), [
    [0, null, "atlantic-ocean", "sea"],
    [1, "atlantic-ocean", "ES", "country"],
    [2, "ES", "FR", "country"],
  ]);
  assert.equal(rows[1]?.leaving?.nameJa, "大西洋");
  assert.equal(rows[2]?.entering?.name, "France");
});

test("the nearest city uses the three tiers, and towns only when asked", () => {
  const cities = {
    nearest: () => ({ city: { id: "big", name: { en: "Big", ja: "大きい" }, country: "fr", lat: 49.1, lon: 2.4 }, km: 30 }),
    within: () => [{ city: { country: "fr" }, km: 30 }],
  };
  const towns = () => [{ id: "small", name: { en: "Small", ja: "小さい" }, lat: 48.86, lon: 2.35, country: "FR" }];
  const asked = placeOf(2.35, 48.86, { cities, towns });
  assert.equal(asked.nearestCity?.name, "Small");
  assert.equal(asked.nearestCity?.nameJa, "小さい");
  assert.equal(asked.nearestCity?.countryCode, "FR");
  assert.ok((asked.nearestCity?.distanceKm ?? 99) < 5);
  const coarse = placeOf(2.35, 48.86, { cities });
  assert.equal(coarse.nearestCity?.name, "Big");
  assert.equal(coarse.nearestCity?.nameJa, "大きい");
  assert.equal(placeOf(2.35, 48.86).nearestCity, null);
  assert.equal(placeOf(2.35, 48.86, { cities, maxKm: 10 }).nearestCity, null);
});

test("a call is cheap enough to make once a second", () => {
  placeOf(0, 0);
  const started = performance.now();
  const n = 200;
  for (let i = 0; i < n; i += 1) placeOf(((i * 17) % 360) - 180, ((i * 13) % 160) - 80);
  const each = (performance.now() - started) / n;
  assert.ok(each < 5, `expected under 5 ms, was ${each.toFixed(3)} ms`);
});
