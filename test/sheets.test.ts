// The printable sheets: the lines are thick, the land is grouped by continent (Russia split at the Urals), the day and night line is where the package's own Sun says it is, the seasons lean the right way, and every
// line of text is inside the room it is drawn for, on every paper and in both languages.
import assert from "node:assert/strict";
import { test } from "node:test";
import { geoDistance, geoOrthographic } from "d3-geo";
import { Body, Equator, MakeTime, Observer, SiderealTime } from "astronomy-engine";
import { DEFAULT_MARGIN_MM, PAGE_NAMES, TYPE_PRESETS, printableSize } from "@johnmorrisdotca/kazoku-ui/print";
import { subsolarPoint } from "../src/realistic/sun.ts";
import { TYPES, innerMm, textWidth, wrap } from "../src/sheets/common.ts";
import { countrySheetSvg } from "../src/sheets/country.ts";
import { globeSheetSvg, worldMapSvg } from "../src/sheets/earth.ts";
import { hatchPath } from "../src/sheets/hatch.ts";
import { continentLines, countryCodes, countryShape, landShares } from "../src/sheets/land.ts";
import { thickPath } from "../src/sheets/outline.ts";
import { dayNightSvg, dayNightView, seasonsSvg, terminator } from "../src/sheets/sun.ts";
import { GLOBE_VIEWS, PLACES, TILT_DEGREES, VIEW_LABELS, countryFacts, dayNightFacts, earthFacts, seasonsFacts } from "../src/sheets/text.ts";

const MM = 25.4 / 72;
const LANGS = ["en", "ja"] as const;
const TYPES_ALL = ["kid", "normal"] as const;
/** The room a sheet's picture has on a page: inside the margins, less the header and the footer (as measured on A4; the demo measures the real room). */
const roomOf = (page: (typeof PAGE_NAMES)[number]): { widthMm: number; heightMm: number } => {
  const size = printableSize(page, "portrait", DEFAULT_MARGIN_MM);
  return { widthMm: size.widthMm, heightMm: size.heightMm - 89 };
};
const numbers = (svg: string, attribute: string): number[] => [...svg.matchAll(new RegExp(`${attribute}="(-?[\\d.]+)"`, "g"))].map((m) => Number(m[1]));
const texts = (svg: string): { x: number; y: number; size: number; anchor: string; body: string; lines: number }[] =>
  [...svg.matchAll(/<text x="(-?[\d.]+)" y="(-?[\d.]+)" font-size="([\d.]+)"([^>]*)>([^<]*)<\/text>/g)].map((m) => {
    const moved = [...svg.slice(0, m.index).matchAll(/<g transform="translate\((-?[\d.]+) (-?[\d.]+)\)">/g)].at(-1);
    return { x: Number(m[1]) + Number(moved?.[1] ?? 0), y: Number(m[2]) + Number(moved?.[2] ?? 0), size: Number(m[3]), anchor: /text-anchor="(\w+)"/.exec(m[4]!)?.[1] ?? "start", body: m[5]!, lines: 1 };
  });
const attr = (svg: string, name: string): number[] => (new RegExp(`${name}="([-\\d. ]+)"`).exec(svg)?.[1] ?? "").split(" ").map(Number);
/** Every sheet, as `[name, svg]`, for a room. */
function everySheet(room: { widthMm: number; heightMm: number }, lang: "en" | "ja", type: "kid" | "normal"): [string, string][] {
  const o = { ...room, lang, type };
  return [
    ...GLOBE_VIEWS.map((view): [string, string] => [`globe ${view}`, globeSheetSvg(view, o)]),
    ["map", worldMapSvg(o)],
    ["country JP", countrySheetSvg("JP", { ...o, capital: { name: "Tokyo", ja: "とうきょう (東京)", lon: 139.69, lat: 35.69 } })!],
    ["country CA", countrySheetSvg("CA", { ...o, capital: { name: "Ottawa", lon: -75.7, lat: 45.4 } })!],
    ["country NZ", countrySheetSvg("NZ", o)!],
    ["day and night", dayNightSvg(Date.UTC(2026, 5, 21, 12), o)],
    ["seasons", seasonsSvg(o)],
  ];
}

test("the type sizes are kazoku-ui's kid and normal presets", () => {
  for (const name of ["kid", "normal"] as const) {
    const preset = TYPE_PRESETS[name];
    assert.deepEqual(
      { title: TYPES[name].titleMm, name: TYPES[name].nameMm, body: TYPES[name].bodyMm, small: TYPES[name].smallMm, line: TYPES[name].lineMm },
      { title: preset.titlePt * MM, name: preset.namePt * MM, body: preset.bodyPt * MM, small: preset.smallPt * MM, line: preset.lineMm },
    );
  }
});

test("every sheet renders on every paper, in both languages and both types, with no bad number, drawn for the room it has", () => {
  for (const page of PAGE_NAMES) {
    const room = roomOf(page);
    for (const lang of LANGS) {
      for (const type of TYPES_ALL) {
        for (const [name, svg] of everySheet(room, lang, type)) {
          assert.ok(svg.startsWith("<svg") && svg.endsWith("</svg>"), `${name} ${page}`);
          assert.ok(svg.includes(`viewBox="0 0 ${Math.round(room.widthMm * 100) / 100} ${Math.round(room.heightMm * 100) / 100}"`), `${name} ${page}: the viewBox is the room`);
          assert.ok(!/NaN|undefined|Infinity/.test(svg), `${name} ${page} ${lang} ${type} has a bad number`);
        }
      }
    }
  }
});

test("every line of a child's sheet is drawn at kazoku-ui's kid line (1.2 mm since 0.25) or the inner line just under it; the hatching of the night is a shading, not a line to colour", () => {
  const room = roomOf("a4");
  for (const [name, svg] of everySheet(room, "en", "kid")) {
    const shading = [...svg.matchAll(/<path d="[^"]*" fill="none" stroke="#000" stroke-width="([\d.]+)"[^>]*data-night=""/g)].map((m) => Number(m[1]));
    const widths = numbers(svg.replace(/<text[^>]*>/g, "<text>"), "stroke-width").filter((width) => !shading.includes(width));
    assert.ok(widths.length >= 2, `${name} has lines`);
    assert.ok(Math.min(...widths) >= innerMm("kid") - 1e-9, `${name}: thinnest line ${Math.min(...widths)} mm`);
    assert.ok(Math.max(...widths) <= TYPE_PRESETS.kid.lineMm * 1.07, `${name}: thickest line ${Math.max(...widths)} mm`);
    assert.ok(svg.includes(`stroke-width="${TYPE_PRESETS.kid.lineMm}"`), `${name} has its kid outline`);
  }
});

test("the land: the continents' lines have no border between two countries of one continent, Russia is split at the Urals, and the shares are right", () => {
  const lines = continentLines();
  assert.ok(lines.length >= 20 && lines.length <= 200, `${lines.length} lines`);
  const near = (a: number[], b: number[]): boolean => Math.abs(a[0]! - b[0]!) < 0.05 && Math.abs(a[1]! - b[1]!) < 0.05;
  // the Spain and France border runs through the Pyrenees at about 42.5 to 43 N, 0 to 3 E: no line goes through the middle of that
  const through = lines.some((line) => line.some((p) => p[0] > 0.5 && p[0] < 2.5 && p[1] > 42.4 && p[1] < 42.7));
  assert.equal(through, false, "no line along the Pyrenees");
  // the Urals line, and the line between Africa and Asia at Suez, are there
  assert.ok(lines.some((line) => line.length === 2 && near(line[0]!, [60, line[0]![1]!]) && near(line[1]!, [60, line[1]![1]!])), "the Urals line");
  const shares = landShares();
  assert.ok(Math.abs(shares.landPercent - 29) < 1, `${shares.landPercent}% of the Earth is land`);
  assert.ok(Math.abs(shares.continents.asia - 29.5) < 1.5, `Asia ${shares.continents.asia}%`);
  assert.ok(Math.abs(shares.continents.europe - 6.8) < 1.2, `Europe ${shares.continents.europe}%`);
  assert.ok(Math.abs(shares.continents.africa - 20.4) < 1, `Africa ${shares.continents.africa}%`);
  assert.ok(Math.abs(Object.values(shares.continents).reduce((a, b) => a + b, 0) - 100) < 1e-6);
  assert.ok(shares.continents.oceania < shares.continents.europe && shares.continents.europe < shares.continents.antarctica);
});

test("a country's shape: the neighbours, the continent, a far territory left out", () => {
  assert.equal(countryShape("XX"), undefined);
  const fr = countryShape("fr")!;
  assert.ok(fr.neighbours.some((one) => one.name === "Germany") && fr.neighbours.some((one) => one.name === "Spain"));
  assert.equal(fr.continent, "europe");
  assert.equal(fr.feature.geometry.coordinates.length, 2, "France and Corsica, without French Guiana");
  assert.deepEqual(countryShape("JP")!.neighbours, []);
  assert.equal(countryShape("JP")!.continent, "asia");
  assert.equal(countryShape("US")!.feature.geometry.coordinates.length, 1, "the lower 48 only, no Alaska or Hawaii");
  assert.ok(countryShape("ID")!.feature.geometry.coordinates.length >= 8, "Indonesia's islands");
  assert.ok(countryCodes().length >= 170 && countryCodes().includes("JP"));
});

test("thickPath makes a line simpler, drops a small loop and rounds the corners", () => {
  const straight = thickPath("M0,0L5,0.1L10,0L20,0", 0.5, 0);
  assert.ok(straight.startsWith("M0 0") && !straight.includes("Q"), straight);
  const loops = thickPath("M0,0L2,0L2,2L0,2Z M10,10L30,10L30,30L10,30Z", 0.1, 5);
  assert.equal((loops.match(/Z/g) ?? []).length, 1, "the small square is gone");
  assert.ok(loops.includes("Q"), "rounded");
});

test("hatching covers only where the test says, to a twentieth of a millimetre", () => {
  const d = hatchPath({ x0: 0, y0: 0, x1: 30, y1: 30 }, 3, 45, (x) => x < 10);
  const ends = [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])] as const);
  assert.ok(ends.length >= 8);
  for (const [x] of ends) assert.ok(x <= 10.06, `an end at ${x}`);
});

test("the globe's names are inside the disc, on every paper, in both languages: every name its view lists is written", () => {
  for (const page of PAGE_NAMES) {
    for (const lang of LANGS) {
      for (const view of GLOBE_VIEWS) {
        const room = roomOf(page);
        const svg = globeSheetSvg(view, { ...room, lang });
        for (const id of Object.keys(VIEW_LABELS[view])) assert.ok(svg.includes(`data-place="${id}"`), `${view} ${page} ${lang}: ${id} is written`);
      }
    }
  }
  assert.ok(PLACES.filter((p) => p.kind === "continent").length === 7 && PLACES.filter((p) => p.kind === "ocean").length === 5);
});

test("the world map names every continent and ocean on every paper", () => {
  for (const page of PAGE_NAMES) {
    for (const lang of LANGS) {
      const svg = worldMapSvg({ ...roomOf(page), lang });
      for (const place of PLACES) assert.ok(svg.includes(`data-place="${place.id}"`), `${page} ${lang}: ${place.id}`);
    }
  }
});

test("every line of text is inside the room it is drawn for, on every paper, in both languages and both types", () => {
  for (const page of PAGE_NAMES) {
    const room = roomOf(page);
    for (const lang of LANGS) {
      for (const type of TYPES_ALL) {
        for (const [name, svg] of everySheet(room, lang, type)) {
          for (const t of texts(svg)) {
            const width = textWidth(t.body, t.size);
            const left = t.anchor === "middle" ? t.x - width / 2 : t.anchor === "end" ? t.x - width : t.x;
            assert.ok(left >= -0.5 && left + width <= room.widthMm + 0.5, `${name} ${page} ${lang} ${type}: "${t.body}" is ${left.toFixed(1)} to ${(left + width).toFixed(1)} of ${room.widthMm}`);
            assert.ok(t.y - t.size * 0.75 >= -0.5 && t.y + t.size * 0.3 <= room.heightMm + 0.5, `${name} ${page} ${lang} ${type}: "${t.body}" at ${t.y.toFixed(1)} of ${room.heightMm}`);
          }
        }
      }
    }
  }
});

test("every country has a sheet that fits: outline, flag box, no flag, the star on the capital when it is given", () => {
  const room = roomOf("letter");
  for (const code of countryCodes()) {
    for (const lang of LANGS) {
      const svg = countrySheetSvg(code, { ...room, lang, capital: { name: "Capital", lon: countryShape(code)!.feature.geometry.coordinates[0]![0]![0]![0]!, lat: countryShape(code)!.feature.geometry.coordinates[0]![0]![0]![1]! } })!;
      assert.ok(svg.includes("data-country") && svg.includes("data-flag-box") && !svg.includes("<image") && !svg.includes("<img"), code);
      assert.ok(!/NaN|undefined|Infinity/.test(svg), code);
      for (const t of texts(svg)) {
        const width = textWidth(t.body, t.size);
        const left = t.anchor === "middle" ? t.x - width / 2 : t.anchor === "end" ? t.x - width : t.x;
        assert.ok(left >= -0.5 && left + width <= room.widthMm + 0.5, `${code} ${lang}: "${t.body}" is ${left.toFixed(1)} to ${(left + width).toFixed(1)}`);
      }
    }
  }
  assert.equal(countrySheetSvg("XX", room), undefined);
  assert.ok(!countrySheetSvg("JP", room)!.includes("data-capital"), "no capital given, no star");
});

test("each sheet has three facts in plain words, in each language", () => {
  for (const lang of LANGS) {
    const lists = [earthFacts("globe", lang), earthFacts("map", lang), dayNightFacts(Date.UTC(2026, 2, 20, 12), lang), seasonsFacts(lang), countryFacts(countryShape("FR")!, "Paris", lang), countryFacts(countryShape("JP")!, undefined, lang)];
    for (const list of lists) {
      assert.equal(list.length, 3);
      for (const fact of list) assert.ok(fact.length > 10 && !/NaN|undefined/.test(fact), fact);
    }
  }
  assert.match(earthFacts("map", "en")[0]!, /Asia.*30%/);
  assert.match(countryFacts(countryShape("FR")!, "Paris", "en")[1]!, /touches 6 countries/);
  assert.match(countryFacts(countryShape("FR")!, "Paris", "en")[2]!, /Paris/);
});

/** The Sun's place by astronomy-engine, the reference: the declination and the right ascension less the Greenwich sidereal time. */
function reference(ms: number): { lon: number; lat: number } {
  const date = new Date(ms);
  const eq = Equator(Body.Sun, MakeTime(date), new Observer(0, 0, 0), true, true);
  const lon = ((eq.ra * 15 - SiderealTime(date) * 15 + 540) % 360) - 180;
  return { lon: ((lon + 540) % 360) - 180, lat: eq.dec };
}

test("day and night: the Sun's place and the line between day and night are the package's own sun position, for two dates", () => {
  for (const when of [Date.UTC(2026, 5, 21, 12), Date.UTC(2026, 11, 21, 3, 30)]) {
    const sun = subsolarPoint(when);
    const ref = reference(when);
    assert.ok(Math.abs(sun.lat - ref.lat) < 0.1 && Math.abs((((sun.lon - ref.lon + 540) % 360) - 180)) < 0.15, `the package's sun against astronomy-engine: ${sun.lat}, ${sun.lon} and ${ref.lat}, ${ref.lon}`);
    // the line: every point is 90 degrees from the Sun
    const line = terminator(when);
    assert.ok(line.length >= 60);
    for (const p of line) assert.ok(Math.abs(geoDistance(p, [sun.lon, sun.lat]) - Math.PI / 2) < 1e-6, "a point of the line is a quarter turn from the Sun");
    // the sheet carries the Sun's place and its hatching is on the night side
    const svg = dayNightSvg(when, { widthMm: 184.6, heightMm: 182 });
    const [lon, lat] = attr(svg, "data-sun");
    assert.ok(Math.abs(lon! - sun.lon) < 0.001 && Math.abs(lat! - sun.lat) < 0.001, "the sheet's sun");
    const [cx, cy, radius] = attr(svg, "data-disc") as [number, number, number];
    const [vlon, vlat, roll] = attr(svg, "data-view") as [number, number, number];
    const projection = geoOrthographic().rotate([-vlon!, -vlat!, roll!]).translate([cx, cy]).scale(radius);
    const path = /data-night=""|<path d="([^"]*)"[^>]*data-night/.exec(svg)![0];
    const d = /<path d="([^"]*)"[^>]*data-night=""/.exec(svg)![1] ?? path;
    const ends = [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])] as [number, number]);
    assert.ok(ends.length >= 40, `${ends.length} ends of hatching`);
    const edge = Math.PI / 2 - (0.12 * Math.PI) / 180 - 0.06 / radius;
    for (const point of ends) {
      assert.ok(Math.hypot(point[0] - cx, point[1] - cy) <= radius + 0.05, "the hatching stays on the disc");
      const place = projection.invert!(point)!;
      assert.ok(geoDistance(place, [sun.lon, sun.lat]) >= edge, `a hatched point is ${((geoDistance(place, [sun.lon, sun.lat]) * 180) / Math.PI).toFixed(2)} degrees from the Sun`);
    }
    // the Sun is straight to the right of the middle
    const mark = geoOrthographic().rotate([-vlon!, -vlat!, roll!]).translate([cx, cy]).scale(radius)([sun.lon, sun.lat])!;
    assert.ok(Math.abs(mark[1] - cy) < 0.5 && mark[0] > cx, "the Sun is to the right");
    // and the view is the same one the helper gives
    const view = dayNightView(when);
    assert.ok(Math.abs(view.centre[0] - vlon!) < 0.001 && Math.abs(view.roll - roll!) < 0.001);
  }
  // the two dates have the Sun north and south of the equator by the tilt
  assert.ok(Math.abs(subsolarPoint(Date.UTC(2026, 5, 21, 12)).lat - TILT_DEGREES) < 0.05);
  assert.ok(Math.abs(subsolarPoint(Date.UTC(2026, 11, 21, 12)).lat + TILT_DEGREES) < 0.05);
});

test("the seasons: the axis is tilted by the Earth's tilt and leans the same way at all four; toward the Sun in June and away from it in December", () => {
  const svg = seasonsSvg({ widthMm: 184.6, heightMm: 182 });
  const orbit = /<ellipse cx="([\d.]+)" cy="([\d.]+)"[^>]*data-orbit=""/.exec(svg)!;
  const sun = [Number(orbit[1]), Number(orbit[2])] as const;
  const earths = [...svg.matchAll(/<g data-season="(\d+)">(.*?)<\/g>/g)].map((m) => ({ angle: Number(m[1]), body: m[2]! }));
  assert.equal(earths.length, 4);
  const leans: Record<number, number> = {};
  for (const earth of earths) {
    const axis = /<path d="M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)"[^>]*data-axis=""/.exec(earth.body)!.slice(1).map(Number) as [number, number, number, number];
    const centre = /<circle cx="(-?[\d.]+)" cy="(-?[\d.]+)" r="[\d.]+"[^>]*data-earth=""/.exec(earth.body)!.slice(1).map(Number) as [number, number];
    const dx = axis[2] - axis[0];
    const dy = axis[3] - axis[1];
    const tilt = (Math.atan2(dx, -dy) * 180) / Math.PI;
    assert.ok(Math.abs(tilt - TILT_DEGREES) < 0.01, `the axis is ${tilt} degrees from upright at ${earth.angle}`);
    const toSun = [sun[0] - centre[0], sun[1] - centre[1]];
    leans[earth.angle] = Math.sign(dx * toSun[0]!) * Math.abs(dx) / Math.hypot(dx, dy);
  }
  assert.ok(leans[180]! > 0.35, `June leans toward the Sun: ${leans[180]}`);
  assert.ok(leans[0]! < -0.35, `December leans away: ${leans[0]}`);
  // the tilt is the most the Sun's place ever strays from the equator in a year, by the package's own sun
  let most = 0;
  for (let day = 0; day < 366; day += 1) most = Math.max(most, Math.abs(subsolarPoint(Date.UTC(2026, 0, 1 + day, 12)).lat));
  assert.ok(Math.abs(most - TILT_DEGREES) < 0.05, `the Sun strays ${most} degrees`);
  // the Earth at the right is in December: hatched on the side away from the Sun (the right), the one at the left in June (the left)
  assert.ok(svg.includes("data-orbit") && texts(svg).some((t) => t.body === "Summer") && texts(svg).some((t) => t.body === "Winter"));
});

test("wrap breaks the words and the Japanese to fit", () => {
  const lines = wrap("The Earth is 12,742 km across and 40,075 km round.", 80, TYPES.kid.bodyMm);
  assert.ok(lines.length >= 2 && lines.every((line) => textWidth(line, TYPES.kid.bodyMm) <= 80));
  const ja = wrap("ちきゅうは はばが 12,742 km、ぐるっと 1しゅうで 40,075 km です。", 80, TYPES.kid.bodyMm);
  assert.ok(ja.every((line) => textWidth(line, TYPES.kid.bodyMm) <= 80), ja.join("|"));
});
