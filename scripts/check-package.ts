// Check the built package the way a consumer would: the entry files are there, and importing the built index draws a globe.
import { existsSync } from "node:fs";

for (const file of ["dist/index.js", "dist/index.d.ts", "dist/element.js", "dist/data/countries.js"]) {
  if (!existsSync(new URL(`../${file}`, import.meta.url))) throw new Error(`missing ${file}`);
}

const mod = await import(new URL("../dist/index.js", import.meta.url).href);
const svg = mod.globe({ rotation: [0, 0] });
if (typeof svg !== "string" || !svg.startsWith("<svg")) throw new Error("globe() did not return SVG");
const count = mod.countryList().length;
if (count < 150) throw new Error("country data missing");
console.log(`package ok: ${(svg.length / 1024).toFixed(0)} KB svg, ${count} countries`);
