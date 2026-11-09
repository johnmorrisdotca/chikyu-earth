// The printable sheets of the Earth for children and everyone: the globe to colour, a world map, a "my country" sheet, day and night, and the seasons. Pure: each is a string of SVG measured in millimetres, to put inside kazoku-ui's print sheet (the demo does),
// so the page's header, footer and QR code are not made here and the sheets need no browser.
export { globeSheetSvg, worldMapSvg, type SheetOptions } from "./earth.ts";
export { countrySheetSvg, type Capital, type CountryOptions } from "./country.ts";
export { dayNightSvg, dayNightView, seasonsSvg, terminator } from "./sun.ts";
export { continentLines, countryCodes, countryShape, landShares, type CountryShape } from "./land.ts";
export { thickPath } from "./outline.ts";
export { hatchPath } from "./hatch.ts";
export { GLOBE_VIEWS, PLACES, SAY, TILT_DEGREES, TITLES, countryFacts, dayNightFacts, earthFacts, seasonsFacts, type GlobeView, type Place } from "./text.ts";
