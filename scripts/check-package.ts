// Check the built package the way a consumer would: the entry files are there, and importing the built index draws a globe.
import { existsSync, readdirSync, statSync } from "node:fs";

for (const file of ["dist/index.js", "dist/index.d.ts", "dist/meteors/index.js", "dist/meteors/index.d.ts", "dist/door/index.js", "dist/door/index.d.ts", "dist/element.js", "dist/countries.js", "dist/realistic/index.js", "dist/realistic/element.js", "dist/realistic/element.d.ts", "dist/markers/index.js", "dist/markers/layer.js", "dist/space/index.js", "dist/space/element.js", "dist/satellites/index.js", "dist/passes/index.js", "dist/passes/element.js"]) {
  if (!existsSync(new URL(`../${file}`, import.meta.url))) throw new Error(`missing ${file}`);
}

const mod = await import(new URL("../dist/index.js", import.meta.url).href);
const svg = mod.globe({ rotation: [0, 0] });
if (typeof svg !== "string" || !svg.startsWith("<svg")) throw new Error("globe() did not return SVG");
const count = mod.countryList().length;
if (count < 150) throw new Error("country data missing");
console.log(`package ok: ${(svg.length / 1024).toFixed(0)} KB svg, ${count} countries`);

// The realistic Earth: its pure parts import with no browser and no three.js, and the pictures are all there, inside their budget.
const realistic = await import(new URL("../dist/realistic/index.js", import.meta.url).href);
const sun = realistic.subsolarPoint(Date.UTC(2026, 5, 21, 12));
if (Math.abs(sun.lat - 23.44) > 0.1) throw new Error("subsolarPoint is off");
const textures = readdirSync(new URL("../dist/textures/", import.meta.url));
const wanted = Object.entries(realistic.TIERS).flatMap(([layer, widths]) => (widths as number[]).map((width) => `${layer}-${width}.webp`));
for (const name of wanted) if (!textures.includes(name)) throw new Error(`missing dist/textures/${name}`);
const bytes = textures.reduce((sum, name) => sum + statSync(new URL(`../dist/textures/${name}`, import.meta.url)).size, 0);
if (bytes > 2.5 * 1024 * 1024) throw new Error(`textures are ${(bytes / 1048576).toFixed(2)} MB, over the 2.5 MB budget`);
console.log(`realistic ok: ${textures.length} pictures, ${(bytes / 1048576).toFixed(2)} MB`);

const markers = await import(new URL("../dist/markers/index.js", import.meta.url).href);
const middle = markers.project(10, 20, { lon: 10, lat: 20, radius: 100, cx: 150, cy: 150 });
if (Math.abs(middle.x - 150) > 1e-6 || middle.z < 0.999) throw new Error("project is off");
console.log("markers ok");

const space = await import(new URL("../dist/space/index.js", import.meta.url).href);
const moon = space.frameAt(Date.UTC(2026, 10, 2, 12)).moon;
const au = Math.hypot(...moon);
if (au < 0.0023 || au > 0.0029) throw new Error("frameAt is off");
console.log("space ok");

const satellites = await import(new URL("../dist/satellites/index.js", import.meta.url).href);
const station = satellites.createSatellites([
  { OBJECT_NAME: "ISS (ZARYA)", EPOCH: "2026-11-02T10:25:21", MEAN_MOTION: 15.49150046, ECCENTRICITY: 0.0007139, INCLINATION: 51.6332, RA_OF_ASC_NODE: 335.9757, ARG_OF_PERICENTER: 339.3739, MEAN_ANOMALY: 20.6961, NORAD_CAT_ID: 25544, BSTAR: 0.00012, MEAN_MOTION_DOT: 0.0001, MEAN_MOTION_DDOT: 0 },
]);
const height = station.info(0, Date.UTC(2026, 10, 2, 12))?.altitudeKm ?? 0;
if (station.count !== 1 || height < 380 || height > 470) throw new Error(`createSatellites is off: ${height} km`);
const flights = satellites.missions();
if (flights.length !== 135 || satellites.missionOf("STS-31")?.hubble !== "deployment" || satellites.missionOf(51)?.name !== "STS-51") throw new Error("the missions are off");
console.log("satellites ok");

// the meteors: the table and the sums import with no browser and no dependency
const meteors = await import(new URL("../dist/meteors/index.js", import.meta.url).href);
const geminids = meteors.activeShowers(Date.UTC(2026, 11, 14, 8))[0];
if (meteors.METEOR_SHOWERS.length !== 37 || geminids?.shower.code !== "GEM" || !(geminids.zhr > 100) || meteors.streaksPerSecond(8) !== 2.5) throw new Error("the meteors are off");
console.log("meteors ok");

// the data door: sources, credits and the package's own data import with no browser and no dependency
const door = await import(new URL("../dist/door/index.js", import.meta.url).href);
const doorCredit = door.creditLine([door.ownCredit("chikyu-tiles", 3)], "en");
if (door.OWN_SOURCES.length !== 2 || !doorCredit.includes("NASA Earth Observatory") || !doorCredit.includes("Public domain") || door.earthTiles("/tiles/").need({ lonMin: -180, lonMax: -170, latMin: 80, latMax: 90, layer: "day" }, 8192).join() !== "day/3/0/0") throw new Error("the data door is off");
console.log("door ok");

const sheets = await import(new URL("../dist/sheets/index.js", import.meta.url).href);
const room = { widthMm: 184.6, heightMm: 170 };
if (!sheets.globeSheetSvg("americas", room).includes("North")) throw new Error("globeSheetSvg is off");
if (!sheets.worldMapSvg(room).includes("data-coast")) throw new Error("worldMapSvg is off");
if (!sheets.countrySheetSvg("JP", room).includes("data-flag-box")) throw new Error("countrySheetSvg is off");
if (Math.abs(Number(sheets.dayNightSvg(Date.UTC(2026, 5, 21, 12), room).match(/data-sun="[-\d.]+ ([-\d.]+)"/)[1]) - 23.44) > 0.1) throw new Error("dayNightSvg is off");
if (!sheets.seasonsSvg(room).includes("data-orbit")) throw new Error("seasonsSvg is off");
console.log("sheets ok");

const passes = await import(new URL("../dist/passes/index.js", import.meta.url).href);
const iss = { OBJECT_NAME: "ISS (ZARYA)", EPOCH: "2026-11-02T10:25:21", MEAN_MOTION: 15.49150046, ECCENTRICITY: 0.0007139, INCLINATION: 51.6332, RA_OF_ASC_NODE: 335.9757, ARG_OF_PERICENTER: 339.3739, MEAN_ANOMALY: 20.6961, NORAD_CAT_ID: 25544, BSTAR: 0.00012, MEAN_MOTION_DOT: 0.0001, MEAN_MOTION_DDOT: 0 };
const day = Date.UTC(2026, 10, 3);
const found = passes.findPasses(iss, { latitude: 51.5, longitude: -0.13 }, { from: day, to: day + 3 * 86_400_000 }, { all: true });
if (found.length < 8 || found.some((one: { highest: { altitude: number } }) => one.highest.altitude < 10) || passes.compassOf(180) !== "S") throw new Error("findPasses is off");
if (!passes.skySvg(found[0], passes.passPath(iss, { latitude: 51.5, longitude: -0.13 }, found[0])).includes("data-mark")) throw new Error("skySvg is off");
console.log("passes ok");
