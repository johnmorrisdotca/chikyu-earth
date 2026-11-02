import { countryList, globe } from "@johnmorrisdotca/chikyu-earth";

// A server draws the same SVG a browser does: pure, no DOM, no browser globals.
const svg = globe({ size: 240, rotation: [-139.7, -35.7], style: "thick" });
const page = `<!doctype html><title>The Earth</title>${svg}`;
console.log(page.length, countryList().length);
