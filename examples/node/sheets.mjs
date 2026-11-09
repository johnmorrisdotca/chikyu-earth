import { countrySheetSvg, dayNightSvg, globeSheetSvg, seasonsSvg, terminator, worldMapSvg } from "@johnmorrisdotca/chikyu-earth/sheets";

// Every sheet is a string of SVG measured in millimetres, drawn for the room it will print in (the body of an A4 page is about 184.6 by 180 mm).
const room = { widthMm: 184.6, heightMm: 180, lang: "en" };
const sheets = {
  globe: globeSheetSvg("europe-africa", room),
  map: worldMapSvg(room),
  japan: countrySheetSvg("JP", { ...room, capital: { name: "Tokyo", lon: 139.69, lat: 35.69 } }),
  night: dayNightSvg(Date.UTC(2026, 5, 21, 12), room),
  seasons: seasonsSvg(room),
};
console.log(Object.keys(sheets).join(" "), Object.values(sheets).every((svg) => svg.startsWith("<svg")));

// The line between day and night at that moment: points 90 degrees from the place where the Sun is straight overhead.
console.log(terminator(Date.UTC(2026, 5, 21, 12), 6).map(([lon, lat]) => `${lon.toFixed(0)},${lat.toFixed(0)}`).join(" "));
