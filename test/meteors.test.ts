// Meteors: the shower table, when each shower is active, where its meteors fall, and how many streaks the layer draws.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  METEOR_HEIGHT_KM,
  METEOR_SHOWERS,
  METEORS_PER_SECOND_MAX,
  SPORADIC_HOURLY_RATE,
  activeShowers,
  apexPoint,
  darkness,
  hourlyRateAt,
  meteorSky,
  placeVector,
  pointBeneath,
  showerRate,
  solarLongitude,
  streakPath,
  streaksPerSecond,
} from "../src/meteors/index.ts";
import { subsolarPoint, unitVector } from "../src/realistic/sun.ts";

const shower = (code: string) => METEOR_SHOWERS.find((entry) => entry.code === code)!;

test("the table is the IMO's working list of 2026: 37 showers, each code and number once, every figure in range", () => {
  assert.equal(METEOR_SHOWERS.length, 37);
  assert.equal(new Set(METEOR_SHOWERS.map((entry) => entry.code)).size, 37);
  assert.equal(new Set(METEOR_SHOWERS.map((entry) => entry.iau)).size, 37);
  for (const entry of METEOR_SHOWERS) {
    assert.match(entry.code, /^[A-Z]{3}$/);
    assert.ok(entry.name.length > 3 && entry.nameJa.endsWith("流星群"), entry.code);
    for (const [month, day] of [entry.start, entry.end, entry.peak]) assert.ok(month >= 1 && month <= 12 && day >= 1 && day <= 31, entry.code);
    assert.ok(entry.peakSolarLongitude >= 0 && entry.peakSolarLongitude < 360);
    assert.ok(entry.radiant.ra >= 0 && entry.radiant.ra < 360 && Math.abs(entry.radiant.dec) <= 90);
    assert.ok(entry.speedKmS >= 11 && entry.speedKmS <= 72, `${entry.code} speed`);
    assert.ok(entry.populationIndex >= 2 && entry.populationIndex <= 3);
    assert.ok(entry.zhr === null || entry.zhr > 0);
  }
  // a few rows, as the Calendar prints them
  assert.deepEqual({ ...shower("PER"), nameJa: undefined }, { code: "PER", iau: 7, name: "Perseids", nameJa: undefined, start: [7, 17], end: [8, 24], peak: [8, 13], peakSolarLongitude: 140, radiant: { ra: 48, dec: 58 }, speedKmS: 59, populationIndex: 2.2, zhr: 100, parent: "comet 109P/Swift-Tuttle" });
  assert.equal(shower("GEM").zhr, 150);
  assert.equal(shower("QUA").peakSolarLongitude, 283.15);
  assert.equal(shower("JBO").zhr, null);
});

test("the Sun's longitude on each maximum day of 2026 is the table's, within a day's travel", () => {
  for (const entry of METEOR_SHOWERS) {
    const got = solarLongitude(Date.UTC(2026, entry.peak[0] - 1, entry.peak[1], 12));
    const off = Math.abs(((got - entry.peakSolarLongitude + 540) % 360) - 180);
    assert.ok(off < 0.8, `${entry.code}: ${got.toFixed(2)} against ${entry.peakSolarLongitude}`);
  }
  // the equinoxes: 0 in March, 180 in September
  assert.ok(Math.abs(((solarLongitude(Date.UTC(2026, 2, 20, 14, 46)) + 180) % 360) - 180) < 0.4);
  assert.ok(Math.abs(solarLongitude(Date.UTC(2026, 8, 23, 0, 5)) - 180) < 0.4);
});

test("a shower's rate is its ZHR at the maximum, half a meteor an hour on its first and last day, and nothing outside its dates", () => {
  const geminids = shower("GEM");
  const peak = Date.UTC(2026, 11, 14, 9);
  assert.ok(showerRate(geminids, peak) > 120 && showerRate(geminids, peak) <= 150);
  assert.ok(showerRate(geminids, Date.UTC(2026, 11, 13, 9)) < showerRate(geminids, peak));
  // the first day (4 December) and the last (20 December) are still in, at about half a meteor an hour
  assert.ok(Math.abs(showerRate(geminids, Date.UTC(2026, 11, 4, 1)) - 0.5) < 0.2);
  assert.ok(Math.abs(showerRate(geminids, Date.UTC(2026, 11, 20, 23)) - 0.5) < 0.2);
  assert.equal(showerRate(geminids, Date.UTC(2026, 11, 3, 12)), 0);
  assert.equal(showerRate(geminids, Date.UTC(2026, 11, 21, 12)), 0);
  assert.equal(showerRate(geminids, Date.UTC(2026, 10, 30)), 0);
  assert.equal(showerRate(geminids, Date.UTC(2026, 11, 24)), 0);
  assert.equal(showerRate(geminids, Date.UTC(2026, 5, 14)), 0);
  // a shower over the new year: the Quadrantids start on 28 December
  const quadrantids = shower("QUA");
  assert.ok(showerRate(quadrantids, Date.UTC(2026, 11, 30)) > 0);
  assert.ok(showerRate(quadrantids, Date.UTC(2027, 0, 3, 20)) > 40);
  assert.equal(showerRate(quadrantids, Date.UTC(2027, 0, 20)), 0);
  // a variable shower gives none
  assert.equal(showerRate(shower("JBO"), Date.UTC(2026, 5, 22, 12)), 0);
});

test("the active showers of a night, strongest first", () => {
  const august = activeShowers(Date.UTC(2026, 7, 13, 2));
  assert.equal(august[0]!.shower.code, "PER");
  assert.ok(august[0]!.zhr > 80);
  assert.ok(august.some((entry) => entry.shower.code === "KCG"));
  for (let i = 1; i < august.length; i += 1) assert.ok(august[i]!.zhr <= august[i - 1]!.zhr);
  // the middle of March has no shower of the list
  assert.deepEqual(activeShowers(Date.UTC(2026, 2, 15)), []);
});

test("a radiant stands overhead at its own declination, and a sidereal day later at the same place", () => {
  const perseids = shower("PER");
  const moment = Date.UTC(2026, 7, 13, 2);
  const place = pointBeneath(perseids.radiant, moment);
  assert.equal(place.lat, 58);
  const later = pointBeneath(perseids.radiant, moment + 86_164_091);
  assert.ok(Math.abs(place.lon - later.lon) < 0.01);
  // an hour on, the Earth has turned 15 degrees east under it
  assert.ok(Math.abs(((pointBeneath(perseids.radiant, moment + 3_600_000).lon - place.lon + 540) % 360) - 180 + 15.04) < 0.01);
});

test("the apex is on the morning side: about six hours of longitude behind the Sun, within the tropics", () => {
  for (const moment of [Date.UTC(2026, 2, 20, 12), Date.UTC(2026, 5, 21, 3), Date.UTC(2026, 11, 14, 8)]) {
    const apex = apexPoint(moment);
    const sun = subsolarPoint(moment);
    assert.ok(Math.abs(apex.lat) < 23.6);
    const west = ((sun.lon - apex.lon + 540) % 360) - 180;
    assert.ok(Math.abs(west - 90) < 12, `the apex is ${west.toFixed(1)} degrees west of the Sun`);
  }
});

test("the hourly rate at a place: the background leans to the morning side, and a shower adds its rate times the sine of its radiant's height", () => {
  const quiet = meteorSky(Date.UTC(2026, 2, 15, 12));
  assert.deepEqual(quiet.showers, []);
  assert.ok(Math.abs(hourlyRateAt(quiet, quiet.apex) - SPORADIC_HOURLY_RATE * 1.6) < 1e-9);
  assert.ok(Math.abs(hourlyRateAt(quiet, [-quiet.apex[0], -quiet.apex[1], -quiet.apex[2]]) - SPORADIC_HOURLY_RATE * 0.4) < 1e-9);

  const moment = Date.UTC(2026, 11, 14, 9);
  const sky = meteorSky(moment);
  assert.equal(sky.showers[0]!.shower.code, "GEM");
  const under = pointBeneath(shower("GEM").radiant, moment);
  const zhr = sky.showers[0]!.zhr;
  assert.ok(hourlyRateAt(sky, under) > zhr);
  // 60 degrees from the radiant's place the radiant is 30 degrees up: half the shower's rate
  const aside = { lon: under.lon + 60 / Math.cos((under.lat * Math.PI) / 180), lat: under.lat };
  assert.ok(hourlyRateAt(sky, aside) < hourlyRateAt(sky, under));
  // on the far side of the Earth the radiant is down: only the background and other showers
  const far = placeVector({ lon: under.lon + 180, lat: -under.lat });
  assert.ok(hourlyRateAt(sky, far) < 30);
  // a place and its unit vector give the same answer
  assert.equal(hourlyRateAt(sky, under), hourlyRateAt(sky, placeVector(under)));
});

test("it is dark where the Sun is six degrees down, light where it is up, and twilight between", () => {
  const sun = unitVector(subsolarPoint(Date.UTC(2026, 5, 21, 12)));
  assert.equal(darkness(sun, sun), 0);
  assert.equal(darkness([-sun[0], -sun[1], -sun[2]], sun), 1);
  // three degrees past the edge of day, the Sun is three degrees down: half way to dark
  const overEquator = placeVector({ lon: 0, lat: 0 });
  assert.ok(Math.abs(darkness(placeVector({ lon: 93, lat: 0 }), overEquator) - 0.5) < 0.01);
  assert.equal(darkness(placeVector({ lon: 97, lat: 0 }), overEquator), 1);
  assert.equal(darkness(placeVector({ lon: 89, lat: 0 }), overEquator), 0);
});

test("streaks a second follow the rate, squeezed, between none and nine", () => {
  assert.equal(streaksPerSecond(0), 0);
  assert.equal(streaksPerSecond(-1), 0);
  assert.equal(streaksPerSecond(SPORADIC_HOURLY_RATE), 2.5);
  assert.ok(streaksPerSecond(40) > streaksPerSecond(8) && streaksPerSecond(40) < 2.5 * 5);
  assert.equal(streaksPerSecond(1e6), METEORS_PER_SECOND_MAX);
});

test("a streak comes down the line from its radiant, inside the heights where meteors burn", () => {
  const place = placeVector({ lon: 30, lat: 40 });
  const height = (v: readonly number[]) => (Math.hypot(v[0]!, v[1]!, v[2]!) - 1) * 6371;
  const down = streakPath(place, place);
  assert.ok(Math.abs(down.km - 25) < 1e-9);
  assert.ok(Math.abs(height(down.end) - 85) < 1e-6 && Math.abs(height(down.start) - 110) < 1e-6);
  assert.ok(height(down.start) <= METEOR_HEIGHT_KM.top && height(down.end) >= METEOR_HEIGHT_KM.bottom);
  // a radiant 30 degrees up: twice the path, the same heights (to the curve of the Earth)
  const low = streakPath(place, placeVector({ lon: 30, lat: 40 - 60 }));
  assert.ok(Math.abs(low.km - 50) < 1e-6);
  assert.ok(Math.abs(height(low.start) - 110) < 0.5);
  // a grazer is held to 260 km, and a stretch only lengthens the drawing
  assert.equal(streakPath(place, placeVector({ lon: 30, lat: 40 - 89 })).km, 260);
  const stretched = streakPath(place, place, 4);
  assert.equal(stretched.km, down.km);
  assert.ok(Math.abs(height(stretched.start) - 185) < 1e-6);
});
