// Check the built package the way a consumer would: the entry files are there, and importing the built index draws a globe.
import { existsSync, readdirSync, statSync } from "node:fs";

for (const file of ["dist/index.js", "dist/index.d.ts", "dist/element.js", "dist/countries.js", "dist/realistic/index.js", "dist/realistic/element.js", "dist/realistic/element.d.ts", "dist/markers/index.js", "dist/markers/layer.js"]) {
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
