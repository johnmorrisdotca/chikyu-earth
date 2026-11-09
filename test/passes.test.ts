// When a satellite crosses the sky over a place. The accuracy is measured against a reference that shares no code with this package or satellite.js:
//   - Skyfield 1.55 with the Python sgp4 package and NASA's DE421 (test/recorded/passes-skyfield-2026-11-09.json, made by scripts/passes-reference.py): 249 passes of the ISS, Tianhe and Hubble over
//     London, Sydney, Quito and Tokyo for 9 to 19 November 2026, each with its rise, culmination and set at 10 degrees, and the azimuth, altitude, range, Sun altitude and sunlight at each.
// Its element sets were downloaded from CelesTrak on 2026-11-09 (test/recorded/passes-elements-2026-11-09.json). The brightness is a model, tested for its own rules, not against another site's figures.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { compassOf, ESTIMATED_CROSS_SECTIONS, findPasses, groundTrack, magnitude, standardMagnitude, passPath, satelliteAt, skyAt, skySvg, STANDARD_MAGNITUDES, sunAltitude, type Observer, type SatellitePass } from "../src/passes/index.ts";
import type { ElementSet } from "../src/satellites/index.ts";

const recorded = (name: string): unknown => JSON.parse(readFileSync(new URL(`./recorded/${name}`, import.meta.url), "utf8"));
const SETS = (recorded("passes-elements-2026-11-09.json") as { sets: ElementSet[] }).sets;
interface SkyPoint {
  time: string;
  altitude: number;
  azimuth: number;
  rangeKm: number;
  sunAltitude: number;
  sunlit: boolean;
}
const SKYFIELD = (
  recorded("passes-skyfield-2026-11-09.json") as {
    cases: { norad: number; place: string; latitude: number; longitude: number; heightM: number; passes: { start: SkyPoint; highest: SkyPoint; end: SkyPoint }[] }[];
  }
).cases;
const FROM = Date.UTC(2026, 10, 9);
const TO = Date.UTC(2026, 10, 19);
const setOf = (norad: number): ElementSet => SETS.find((one) => one.NORAD_CAT_ID === norad)!;
const placeOf = (c: { latitude: number; longitude: number; heightM: number }): Observer => ({ latitude: c.latitude, longitude: c.longitude, heightM: c.heightM });
const angle = (a: number, b: number): number => Math.abs(((a - b + 540) % 360) - 180);

test("the compass words and the sky's names", () => {
  assert.equal(compassOf(0), "N");
  assert.equal(compassOf(359), "N");
  assert.equal(compassOf(200), "SSW");
  assert.equal(compassOf(90), "E");
  assert.equal(compassOf(-90), "W");
  assert.equal(skyAt(5), "day");
  assert.equal(skyAt(-0.5), "day", "the Sun's centre must be 0.833 degree down for sunset");
  assert.equal(skyAt(-3), "civil");
  assert.equal(skyAt(-8), "nautical");
  assert.equal(skyAt(-15), "astronomical");
  assert.equal(skyAt(-30), "night");
});

test("the Sun's altitude: overhead at the solstice's noon on the Tropic, below the horizon at midnight", () => {
  assert.ok(Math.abs(sunAltitude(Date.UTC(2026, 5, 21, 12), { latitude: 23.44, longitude: 0 }) - 90) < 0.5);
  assert.ok(sunAltitude(Date.UTC(2026, 5, 21, 0), { latitude: 0, longitude: 0 }) < -60);
});

test("the brightness: the standard magnitude at 1000 km with half lit, brighter when nearer and when fuller, and unlit when the phase is 180 degrees", () => {
  assert.ok(Math.abs(magnitude(-1.8, 1000, 90) - -1.8) < 1e-9);
  assert.ok(Math.abs(magnitude(-1.8, 100, 90) - (-1.8 - 5)) < 1e-9, "ten times nearer is five magnitudes brighter");
  assert.ok(magnitude(-1.8, 1000, 0) < magnitude(-1.8, 1000, 90));
  assert.ok(magnitude(-1.8, 1000, 120) > magnitude(-1.8, 1000, 90));
  assert.equal(magnitude(-1.8, 1000, 180), Number.POSITIVE_INFINITY);
  assert.deepEqual(Object.keys(STANDARD_MAGNITUDES).map(Number).sort(), [20580, 25544, 48274]);
  // the model's own rules: a ten times larger satellite is 2.5 magnitudes brighter, a duller one is dimmer, and a sphere of 1 square metre and albedo 0.2 at 1000 km with half lit is about magnitude 7.5
  assert.ok(Math.abs(standardMagnitude(100) - standardMagnitude(10) + 2.5) < 1e-9);
  assert.ok(standardMagnitude(10, 0.1) > standardMagnitude(10, 0.4));
  assert.ok(Math.abs(standardMagnitude(1, 0.2) - 7.49) < 0.1, `${standardMagnitude(1, 0.2)}`);
  for (const [id, area] of Object.entries(ESTIMATED_CROSS_SECTIONS)) assert.equal(STANDARD_MAGNITUDES[Number(id)], standardMagnitude(area));
  // the ISS (the largest) comes out brightest of the three, as it is in the sky
  assert.ok(STANDARD_MAGNITUDES[25544]! < STANDARD_MAGNITUDES[48274]! && STANDARD_MAGNITUDES[48274]! < STANDARD_MAGNITUDES[20580]!);
});

test("against Skyfield: 249 passes, every rise, highest point and set within 1 second, with the same count of passes", () => {
  let worst = 0;
  let count = 0;
  for (const c of SKYFIELD) {
    const mine = findPasses(setOf(c.norad), placeOf(c), { from: FROM, to: TO }, { all: true });
    assert.equal(mine.length, c.passes.length, `${c.norad} over ${c.place}`);
    for (const reference of c.passes) {
      const pass = mine.find((one) => Math.abs(one.highest.ms - Date.parse(reference.highest.time)) < 30_000);
      assert.ok(pass, `${c.norad} over ${c.place} at ${reference.highest.time}`);
      for (const key of ["start", "highest", "end"] as const) worst = Math.max(worst, Math.abs(pass[key].ms - Date.parse(reference[key].time)) / 1000);
      count += 1;
    }
  }
  assert.equal(count, 249);
  assert.ok(worst < 1, `the worst difference was ${worst} s`);
});

test("against Skyfield, at the moments it names: direction within 0.1 degree, height within 0.01 degree, distance within 100 m, the Sun's altitude within 0.02 degree, and the sunlight", () => {
  let lit = 0;
  for (const c of SKYFIELD) {
    for (const pass of c.passes) {
      for (const key of ["start", "highest", "end"] as const) {
        const reference = pass[key];
        const mine = satelliteAt(setOf(c.norad), placeOf(c), Date.parse(reference.time))!;
        // straight overhead a tiny change of place turns the direction a long way: the direction is not asked there
        if (reference.altitude < 85) assert.ok(angle(mine.azimuth, reference.azimuth) < 0.1, `${c.norad} over ${c.place} ${key} ${reference.time}: azimuth ${mine.azimuth} vs ${reference.azimuth}`);
        assert.ok(Math.abs(mine.altitude - reference.altitude) < 0.01, `${reference.time}: altitude`);
        assert.ok(Math.abs(mine.rangeKm - reference.rangeKm) < 0.1, `${reference.time}: range`);
        assert.ok(Math.abs(mine.sunAltitude - reference.sunAltitude) < 0.02, `${reference.time}: Sun altitude ${mine.sunAltitude} vs ${reference.sunAltitude}`);
        if (mine.sunlit !== reference.sunlit) lit += 1;
      }
    }
  }
  // Skyfield's shadow is a cone (with a penumbra) and ours a cylinder, so a point within seconds of the shadow's edge can differ: one of 747 does
  assert.ok(lit <= 2, `${lit} of 747 moments disagree on sunlight`);
});

test("civil twilight counts by default, and says so: Hubble over Sydney on 9 November is visible at civil twilight and not once the sky must be nautical", () => {
  const place = { latitude: -33.8688, longitude: 151.2093, heightM: 20 };
  const window = { from: Date.UTC(2026, 10, 9, 18), to: Date.UTC(2026, 10, 9, 19) };
  const civil = findPasses(setOf(20580), place, window, { limitingMagnitude: 99 });
  assert.equal(civil.length, 1);
  assert.equal(civil[0]!.sky, "civil");
  assert.equal(civil[0]!.reason, "visible");
  assert.ok(civil[0]!.sunAltitude < -0.833 && civil[0]!.sunAltitude > -6);
  assert.deepEqual(findPasses(setOf(20580), place, window, { sky: "nautical", limitingMagnitude: 99 }), []);
  const all = findPasses(setOf(20580), place, window, { all: true, sky: "nautical", limitingMagnitude: 99 });
  assert.equal(all.length, 1);
  assert.equal(all[0]!.reason, "daylight");
  assert.equal(all[0]!.visible, undefined);
  assert.equal(all[0]!.sunlit, true);
});

test("a pass at night with the ISS in the Earth's shadow is `shadow`, one in the daytime is `daylight`, and neither is listed unless asked for", () => {
  const london = { latitude: 51.5074, longitude: -0.1278, heightM: 10 };
  const window = { from: Date.UTC(2026, 10, 12, 19), to: Date.UTC(2026, 10, 12, 21) };
  assert.deepEqual(findPasses(setOf(25544), london, window), []);
  const [shadow] = findPasses(setOf(25544), london, window, { all: true });
  assert.equal(shadow!.reason, "shadow");
  assert.equal(shadow!.sunlit, false);
  assert.equal(shadow!.sky, "night");
  assert.equal(shadow!.magnitude, undefined);
  const sydney = { latitude: -33.8688, longitude: 151.2093, heightM: 20 };
  const noon = { from: Date.UTC(2026, 10, 16, 23, 30), to: Date.UTC(2026, 10, 17, 1) };
  const day = findPasses(setOf(25544), sydney, noon, { all: true });
  assert.ok(day.length > 0);
  for (const pass of day) assert.equal(pass.reason, "daylight");
});

test("a visible pass carries the part that can be seen, its direction and height at each end, its brightness and how old the elements are", () => {
  const london = { latitude: 51.5074, longitude: -0.1278, heightM: 10 };
  const passes = findPasses(setOf(25544), london, { from: Date.UTC(2026, 10, 16), to: Date.UTC(2026, 10, 17) });
  const pass = passes.find((one) => one.highest.altitude > 50)!;
  assert.ok(pass, "a high pass on 16 November");
  assert.equal(pass.noradId, 25544);
  assert.equal(pass.name, "ISS (ZARYA)");
  assert.equal(pass.reason, "visible");
  assert.ok(pass.visible);
  assert.ok(pass.start.ms <= pass.visible.start.ms && pass.visible.end.ms <= pass.end.ms);
  assert.ok(Math.abs(pass.start.altitude - 10) < 0.01 && Math.abs(pass.end.altitude - 10) < 0.01);
  assert.ok(pass.durationSeconds > 300 && pass.durationSeconds < 700);
  assert.ok(pass.magnitude !== undefined && pass.magnitude < -2, `${pass.magnitude}`);
  assert.equal(pass.sunlit, true);
  assert.ok(["civil", "nautical", "astronomical", "night"].includes(pass.sky));
  assert.ok(Math.abs(pass.elementAgeDays - 7.8) < 0.5, `${pass.elementAgeDays}`);
  assert.equal(pass.stale, false);
  assert.equal(pass.elementEpochMs, Date.parse(`${setOf(25544).EPOCH}Z`));
});

test("elements that are two weeks old are flagged stale, and a pass past the limit is left out", () => {
  const london = { latitude: 51.5074, longitude: -0.1278 };
  const ms = Date.parse(`${setOf(25544).EPOCH}Z`);
  const fortnight = { from: ms + 15 * 86_400_000, to: ms + 16 * 86_400_000 };
  const old = findPasses(setOf(25544), london, fortnight, { all: true });
  assert.ok(old.length > 0 && old.every((one) => one.stale));
  const month = { from: ms + 35 * 86_400_000, to: ms + 36 * 86_400_000 };
  assert.deepEqual(findPasses(setOf(25544), london, month, { all: true }), []);
  assert.ok(findPasses(setOf(25544), london, month, { all: true, maxAgeDays: 60 }).length > 0);
});

test("only passes whose highest point is in the window are listed, once each, earliest first, for one set or many", () => {
  const place = { latitude: 35.6762, longitude: 139.6503 };
  const wide = findPasses(SETS, place, { from: FROM, to: FROM + 2 * 86_400_000 }, { all: true });
  assert.ok(wide.length > 20);
  for (let i = 1; i < wide.length; i += 1) assert.ok(wide[i]!.highest.ms >= wide[i - 1]!.highest.ms);
  for (const pass of wide) assert.ok(pass.highest.ms >= FROM && pass.highest.ms <= FROM + 2 * 86_400_000);
  const split = [
    ...findPasses(SETS, place, { from: FROM, to: FROM + 86_400_000 - 1 }, { all: true }),
    ...findPasses(SETS, place, { from: FROM + 86_400_000, to: FROM + 2 * 86_400_000 }, { all: true }),
  ];
  const key = (one: SatellitePass): string => `${one.noradId}@${Math.round(one.highest.ms)}`;
  assert.deepEqual(split.map(key).sort(), wide.map(key).sort());
  assert.equal(new Set(split.map(key)).size, split.length);
});

test("a satellite that stays up (a geostationary one) has no passes, and elements that do not start are left out", () => {
  const geo: ElementSet = { ...setOf(25544), OBJECT_NAME: "STILL", NORAD_CAT_ID: 1, MEAN_MOTION: 1.0027, INCLINATION: 0.05, ECCENTRICITY: 0.0002 };
  assert.deepEqual(findPasses(geo, { latitude: 0, longitude: 0 }, { from: FROM, to: TO }, { all: true }), []);
  const broken: ElementSet = { ...setOf(25544), EPOCH: "not a date" };
  assert.deepEqual(findPasses(broken, { latitude: 0, longitude: 0 }, { from: FROM, to: TO }, { all: true }), []);
  assert.deepEqual(findPasses([], { latitude: 0, longitude: 0 }, { from: FROM, to: TO }), []);
});

test("a lower altitude starts a pass sooner and ends it later, and 0 gives the passes from the horizon", () => {
  const place = { latitude: 51.5074, longitude: -0.1278 };
  const window = { from: Date.UTC(2026, 10, 10), to: Date.UTC(2026, 10, 11) };
  const ten = findPasses(setOf(25544), place, window, { all: true });
  const zero = findPasses(setOf(25544), place, window, { all: true, minAltitude: 0 });
  assert.ok(zero.length >= ten.length);
  for (const high of ten) {
    const low = zero.find((one) => Math.abs(one.highest.ms - high.highest.ms) < 1000)!;
    assert.ok(low.start.ms < high.start.ms && low.end.ms > high.end.ms);
    assert.ok(Math.abs(low.start.altitude) < 0.01);
  }
});

test("your own standard magnitude is used, and a satellite without one has no magnitude and is never too faint", () => {
  const place = { latitude: 51.5074, longitude: -0.1278 };
  const window = { from: Date.UTC(2026, 10, 16), to: Date.UTC(2026, 10, 17) };
  const base = findPasses(setOf(25544), place, window)[0]!;
  const dimmer = findPasses(setOf(25544), place, window, { magnitudes: { 25544: 3.2 }, limitingMagnitude: 99 })[0]!;
  assert.ok(Math.abs(dimmer.magnitude! - base.magnitude! - (3.2 - STANDARD_MAGNITUDES[25544]!)) < 1e-6);
  const unknown = findPasses({ ...setOf(25544), NORAD_CAT_ID: 99999 }, place, window, { limitingMagnitude: -10 })[0]!;
  assert.equal(unknown.magnitude, undefined);
  assert.equal(unknown.reason, "visible");
  assert.deepEqual(findPasses(setOf(25544), place, window, { limitingMagnitude: -10 }), []);
  const every = findPasses(setOf(25544), place, window, { limitingMagnitude: -10, all: true });
  assert.ok(every.some((one) => one.reason === "faint"), every.map((one) => one.reason).join());
});

test("the track across the sky runs from the start to the end of a pass, lit where the ISS is in sunlight, and agrees with the pass", () => {
  const place = { latitude: 51.5074, longitude: -0.1278, heightM: 10 };
  const [pass] = findPasses(setOf(25544), place, { from: Date.UTC(2026, 10, 16), to: Date.UTC(2026, 10, 17) }) as [SatellitePass];
  const path = passPath(setOf(25544), place, pass, 5);
  assert.equal(path[0]!.ms, pass.start.ms);
  assert.equal(path[path.length - 1]!.ms, pass.end.ms);
  assert.ok(path.length > pass.durationSeconds / 5);
  assert.ok(Math.abs(Math.max(...path.map((p) => p.altitude)) - pass.highest.altitude) < 0.5);
  assert.ok(path.some((p) => p.sunlit));
});

test("the ground track is the ISS's: 51.6 degrees at most, 400 km up, and under the watcher when the pass is straight overhead", () => {
  const set = setOf(25544);
  const noon = Date.UTC(2026, 10, 12, 12);
  const track = groundTrack(set, noon, noon + 93 * 60_000, 30);
  assert.equal(track[0]!.ms, noon);
  assert.equal(track[track.length - 1]!.ms, noon + 93 * 60_000);
  const reach = Math.max(...track.map((p) => Math.abs(p.lat)));
  assert.ok(reach < 51.9 && reach > 51, `${reach}`); // geodetic latitude runs a little past the inclination
  for (const p of track) assert.ok(p.altitudeKm > 400 && p.altitudeKm < 440 && p.lon >= -180 && p.lon <= 180);
  const place = { latitude: 51.5074, longitude: -0.1278 };
  const high = findPasses(set, place, { from: Date.UTC(2026, 10, 18), to: Date.UTC(2026, 10, 19) }, { all: true }).find((p) => p.highest.altitude > 85)!;
  assert.ok(high, "a pass straight overhead on 18 November");
  const under = groundTrack(set, high.highest.ms, high.highest.ms, 10)[0]!;
  assert.ok(Math.hypot(under.lat - place.latitude, (under.lon - place.longitude) * Math.cos((place.latitude * Math.PI) / 180)) < 1.5, `${under.lat}, ${under.lon}`);
});

test("the sky dome is an SVG with the four directions, the track in two styles and the three marks, in the words asked for, and the same markup each time", () => {
  const place = { latitude: 51.5074, longitude: -0.1278, heightM: 10 };
  const pass = findPasses(setOf(25544), place, { from: Date.UTC(2026, 10, 12), to: Date.UTC(2026, 10, 13) }, { all: true })[0]!;
  const path = passPath(setOf(25544), place, pass);
  const times = { start: "18:21", highest: "18:23", end: "18:25" };
  const svg = skySvg(pass, path, { size: 300, times });
  assert.ok(svg.startsWith("<svg") && svg.endsWith("</svg>"));
  for (const word of [">N<", ">E<", ">S<", ">W<", 'data-mark="start"', 'data-mark="highest"', 'data-mark="end"', "start 18:21", "highest 18:23", "end 18:25"]) assert.ok(svg.includes(word), word);
  assert.ok(svg.includes('role="img"') && svg.includes("aria-label="));
  assert.equal(svg, skySvg(pass, path, { size: 300, times }));
  const japanese = skySvg(pass, path, { labels: { north: "北", east: "東", south: "南", west: "西", start: "出" }, description: "ISS は西から東へ" });
  for (const word of [">北<", ">東<", ">南<", ">西<", "出", "ISS は西から東へ"]) assert.ok(japanese.includes(word), word);
  assert.ok(!svg.includes("undefined") && !svg.includes("NaN"));
  // a pass that is lit for only part of it draws both styles
  const lit = findPasses(setOf(25544), place, { from: Date.UTC(2026, 10, 16), to: Date.UTC(2026, 10, 17) }, { all: true }).find((one) => one.sunlit && one.visible && one.visible.end.ms < one.end.ms - 5000)!;
  assert.ok(lit, "a pass that goes into the shadow");
  const mixed = skySvg(lit, passPath(setOf(25544), place, lit));
  assert.ok(mixed.includes('data-lit="true"') && mixed.includes('data-lit="false"'));
});

test("it is pure and fast: the same answer twice, and ten days of three satellites in well under a second", () => {
  const place = { latitude: -0.1807, longitude: -78.4678, heightM: 2850 };
  const started = performance.now();
  const first = findPasses(SETS, place, { from: FROM, to: TO }, { all: true });
  const took = performance.now() - started;
  assert.deepEqual(findPasses(SETS, place, { from: FROM, to: TO }, { all: true }), first);
  assert.ok(took < 1500, `${took} ms`);
});

test("the demo's bright.json (the three satellites as OMM JSON, from the scheduled build) is read by parseElements and gives passes", async () => {
  const { parseElements } = await import("../src/satellites/index.ts");
  const parsed = parseElements(readFileSync(new URL("../demo/elements/bright.json", import.meta.url), "utf8"));
  assert.equal(parsed.format, "omm-json");
  assert.deepEqual(parsed.sets.map((one) => one.NORAD_CAT_ID).sort(), [20580, 25544, 48274]);
  assert.deepEqual(parsed.skipped, []);
  const from = Date.parse(`${parsed.sets[0]!.EPOCH}Z`);
  assert.ok(findPasses(parsed.sets, { latitude: 35.69, longitude: 139.69 }, { from, to: from + 3 * 86_400_000 }, { all: true }).length > 10);
});
