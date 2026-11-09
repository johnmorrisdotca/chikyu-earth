---
title: Printable sheets
section: how-to
order: 10
description: The globe and a world map to colour, a "my country" sheet, day and night for a date and time, and the seasons, on A4, US Letter, A3 or Tabloid, in English and Japanese, with thick lines and big type for children, and ready-made PDFs.
---

[日本語](ja/printable-sheets.md)

`/sheets` draws five printable things from the package's own outlines and its own sun, each as one SVG string measured in millimetres (a millimetre of the picture is a millimetre of the paper), so it needs no browser and no dependency:

- **The globe** (`globeSheetSvg`): one side of the Earth as a big disc, with the continents in thick outlines and the names of the continents and oceans written where they are. Three sides: `americas`, `europe-africa` and `asia-oceania`. The lines are the coasts of the continents only: there is no border between two countries of one continent, so a child colours a whole continent. Russia is cut at the Urals (the meridian 60 degrees east), so Siberia is in Asia.
- **A world map** (`worldMapSvg`): all the land on one flat map (Natural Earth projection), the seven continents and five oceans named.
- **My country** (`countrySheetSvg`): the country's outline as big as the room allows, its capital as a star with its name when you give it, a box to draw the flag in (the sheet carries no flag) and three facts: its continent, the countries it touches (counted on the land that is drawn, so French Guiana's neighbours are not France's here), and the capital.
- **Day and night** (`dayNightSvg`): the Earth with the Sun's light coming from the right, the lit half white and the dark half hatched, for the date and time you give. The place where the Sun is straight overhead is the package's own (`subsolarPoint`, the same one the realistic Earth lights itself by), and the line between day and night is the great circle 90 degrees from it (`terminator`).
- **The seasons** (`seasonsSvg`): the Earth at four points round the Sun (March, June, September, December, one way round), the axis tilted by 23.4 degrees and leaning the same way at all four, so in June the north leans toward the Sun and in December away from it. The dark half of each Earth is hatched.

```js
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
```

## The functions

| Function | Gives |
|---|---|
| `globeSheetSvg(view, options)`, `GLOBE_VIEWS` | the globe sheet and the three sides it is made for |
| `worldMapSvg(options)` | the world map |
| `countrySheetSvg(code, options)`, `countryShape(code)`, `countryCodes()` | the "my country" sheet (`undefined` for a code with no outline), the shape behind it (land, continent, neighbours) and the codes that have one |
| `dayNightSvg(ms, options)`, `terminator(ms)`, `dayNightView(ms)` | the day and night sheet, the line between day and night as longitude and latitude, and the turn of the globe on the sheet |
| `seasonsSvg(options)`, `TILT_DEGREES` | the seasons sheet and the tilt it draws |
| `continentLines()`, `landShares()` | the coasts of the continents as lines, and how much of the Earth is land and of the land each continent has (Asia 30%, Africa 20%, Europe 7%, from the outlines) |
| `earthFacts`, `dayNightFacts`, `seasonsFacts`, `countryFacts`, `TITLES`, `SAY`, `PLACES` | the words: each sheet's three facts and title, the brand and credits, and the continents and oceans with their Japanese names |
| `thickPath`, `hatchPath` | the two helpers behind the lines: a path made simpler for a thick line, and hatching cut to a shape |

`options` is `{ widthMm, heightMm, lang, type }`: the room, `en` or `ja`, and `kid` (3 mm outline, 2.5 mm lines inside, names 24 pt, facts 18 pt) or `normal` (thin lines, small type). A name is not written where it would not fit.

## The page around a picture

The pictures are the sheet's body. The header (the brand, the package and the title, and a "Name:" box) and the footer (credits, version, date and a QR code back to the demo) are [kazoku-ui's print part](https://github.com/johnmorrisdotca/kazoku-ui/blob/main/docs/guides/print.md), which this package does not depend on: the demo builds them. Lay the sheet out once out of sight to read the room the page's body really has, and give it to the function:

```ts no-run
import { buildSheet, printCss, printSheet } from "@johnmorrisdotca/kazoku-ui/print";
import { SAY, TITLES, globeSheetSvg } from "@johnmorrisdotca/chikyu-earth/sheets";

const layout = { page: "a4", type: "kid", language: "en" } as const;
const holder = document.createElement("div");
holder.style.cssText = "position:absolute;inset:0";
const sheet = buildSheet({ ...layout, brand: "Space Program X", packageName: SAY.en.pack, title: TITLES.globe("americas", "en"), credits: SAY.en.credits, pages: [holder] });

// lay it out out of sight once, to read the body's size
const style = document.createElement("style");
style.textContent = printCss(layout);
document.head.append(style);
sheet.style.cssText = "position:fixed;left:-10000px;visibility:hidden";
document.body.append(sheet);
const body = sheet.querySelector(".kazoku-body")!.getBoundingClientRect();
sheet.style.cssText = "";
holder.innerHTML = globeSheetSvg("americas", { widthMm: (body.width * 25.4) / 96, heightMm: (body.height * 25.4) / 96, lang: "en" });
document.body.append(sheet);
printSheet(sheet);
```

## Black and white

Every line is black on white, and the night half of the Earth is hatched with lines, not grey, so a home printer in black and white prints the sheets as they are. The hatching is plain geometry, not a pattern fill, so it prints the same in every browser.

## The place

The demo's picker takes each country's capital from `kuni` and a flag to check a drawing against from `hata`, in the demo only: this package depends on neither. The capital is passed in (`capital: { name, ja, lon, lat }`); without it the sheet asks the child to find the capital and draw a star on it. The flag is never on the sheet.

## Ready-made PDFs

The Pages build prints PDFs from the demo: the three sides of the globe, the world map, the seasons, day and night for the two equinoxes and the two solstices, and the "my country" sheet for twelve countries, on A4 and US Letter in English and Japanese. [The English list](https://johnmorrisdotca.github.io/chikyu-earth/pdf/) and [the Japanese list](https://johnmorrisdotca.github.io/chikyu-earth/pdf/ja.html).

## How it is checked

Without a browser: every sheet on all four papers (A4, US Letter, A3, Tabloid), in both languages and both types, with no bad number; every line at least 2.5 mm thick and the outline 3 mm; the land's shares against known values (29% land, Asia 30%, Europe 7%, Africa 20%); no line along a border between two countries of one continent; every line of text inside the room it is drawn for; every country with an outline has a sheet that fits; the day and night line against the package's own sun position, and that against astronomy-engine, for two dates (the hatching is read back from the sheet and every end is on the night side); and the seasons' axis against the Earth's tilt, leaning toward the Sun in June and away in December. In Chromium and WebKit the demo is played, and in Chromium each kind of sheet is printed to a PDF on all four papers and the PDF is read for its paper size and its page count (one page).
