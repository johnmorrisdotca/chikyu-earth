---
title: Satellites on a flat map of the world
section: how-to
order: 10
description: Show a group of satellites on a flat world map with the element <chikyu-flat>, coloured by group or by orbital plane, with day and night, footprints, a ground track, a clock like the 3D view's, and the facts of a group worked out from its elements alone.
---

`<chikyu-flat>` draws satellites on a flat map of the world, at the places SGP4 puts them for the time shown, and keeps up with the clock: they travel across the map, as they do on the 3D view. It is a canvas (no element for each dot), so the whole of Starlink, eleven thousand dots, moves smoothly. The package also exports, with no browser and no dependency, `groupFacts` (how many, how high, how steep, how quick, how many orbital planes) and `clusterPlanes`, so a build step can write "GPS: 6 planes, 20,200 km, 55 degrees, 11 h 58 min" into a page before any script runs.

## Install

```sh
npm install @johnmorrisdotca/chikyu-earth satellite.js
```

`satellite.js` (MIT, version 6) is an optional peer, as for the satellites; only the element needs it, not the facts. The package fetches no orbit data of its own: your page passes them in (see [Satellites on the globe](satellites.md) for where to get them and the rules).

## The facts of a group

```js
import { clusterPlanes, groupFacts } from "@johnmorrisdotca/chikyu-earth/flat";

// Six GPS satellites from one downloaded list, two in each of three planes: the same facts on a server as in a page, from the elements alone.
const gps = (RA_OF_ASC_NODE) => ({ MEAN_MOTION: 2.00563, ECCENTRICITY: 0.0102, INCLINATION: 55.1, RA_OF_ASC_NODE });
const sets = [gps(24), gps(26), gps(144), gps(146), gps(264), gps(266)];
const facts = groupFacts(sets);
const planes = clusterPlanes(sets).planes.map((plane) => `${plane.id}:${plane.count}`).join(" ");
console.log(`${facts.count} satellites, ${Math.round(facts.meanAltitudeKm)} km up, ${Math.round(facts.meanInclinationDeg)} degrees, ${facts.planeCount} planes (${planes})`);
```

`groupFacts(sets)` gives `count`, `meanAltitudeKm`, the lowest and highest points (`minAltitudeKm`, `maxAltitudeKm`), `meanInclinationDeg` (with its range), `periodMinutes`, `speedKmS`, `planeCount`, `planes` and `newestEpochMs`. Heights are above the mean Earth radius of 6,371 km, as the satellites' own readout gives them. `clusterPlanes(sets)` puts the satellites into orbital planes by the right ascension of their ascending node: it sorts the nodes round the circle and cuts it at every gap wider than 10 degrees (`gapDeg`). GPS comes out as 6 planes, Galileo and GLONASS as 3, Iridium as 6 and OneWeb as 12. A cluster smaller than a quarter of the biggest (`minShare`), or of fewer than 2 satellites, is a spare or a stray and is left in `other` (Galileo's two satellites that were put in the wrong orbit); an orbit within 5 degrees of the equator (`minInclination`) has no node worth the name, so the geostationary belt has no planes. The planes are lettered `A`, `B`, `C` going east from 0 degrees. **When the nodes fall into one blob, as Starlink's do, `clustered` is false: there is no plane to show, and a page should not claim one.**

## The element

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GPS satellites on a flat map</title>
  </head>
  <body>
    <script type="module" src="https://cdn.jsdelivr.net/npm/@johnmorrisdotca/chikyu-earth/flat/define/+esm"></script>
    <!-- Your page chooses where the orbit data come from (its own file, or a source whose terms it has read); this address is an example. -->
    <chikyu-flat group="gps" colour-by="plane" center="0" home-lon="139.69" home-lat="35.69" elements-src="https://example.org/gps.json"></chikyu-flat>
  </body>
</html>
```

Import `@johnmorrisdotca/chikyu-earth/flat/define` (or the `/+esm` address from a CDN) to register the tag; `@johnmorrisdotca/chikyu-earth/flat` is the pure parts and imports on a server. Give it orbital elements with `setGroup(id, sets)` for each group, with the `elements` property for one, or with `elements-src` (an address, read once, politely). The ids of `SATELLITE_GROUPS` (`gps`, `starlink`) are known by name in English and Japanese and by colour; any other name takes a `style` of `{ colour, label, labelJa }`.

```js no-run
import "@johnmorrisdotca/chikyu-earth/flat/define";

const flat = document.querySelector("chikyu-flat");
flat.setGroup("gps", gpsElements); // your page's own element sets
flat.setGroup("galileo", galileoElements);
flat.setGroup("mine", mySets, { colour: "#ffffff", label: "My satellites", labelJa: "私の衛星" });
flat.addEventListener("chikyu-flat-pick", (event) => console.log(event.detail.name, event.detail.plane));
```

### The map and its centre

The map is plate carree (longitude and latitude to equal widths) with the country outlines, a graticule and the night side drawn from the real Sun. `center` is the longitude in the middle, 0 (Greenwich) by default; any value works, and the map wraps cleanly at the date line. The built-in **Greenwich** button goes back to 0. Give the reader's saved place with `home-lon` and `home-lat` and the map shows a marker there and a **My place** button that centres on it. **The element never asks the browser for a place**: your page reads the one the reader saved and sets the two attributes. A box taller than 2 to 1 (a phone) is filled, and the map wraps round its sides. Zoom with the + and − buttons, Control or Command and the wheel (a trackpad pinch), two fingers, or the + and − keys; drag to pan.

### What is shown

| Attribute | What it does |
|---|---|
| `group` | Which groups to show: `all` (the default), one id, or several with commas. |
| `off` | Groups that start off when `group` names none, such as `starlink`: they are loaded and one tap on their chip turns them on. |
| `colour-by` | `group` (the default) or `plane`. By plane, each plane of a group has its own colour (twelve, in order). |
| `plane` | A plane letter (`A`): show only that plane of the one group on show. |
| `footprint` | Draw the coverage circle of the chosen satellite, or of every one shown when there are 80 or fewer. `footprint-elevation` is the lowest angle above the horizon the circle is drawn for (25, as the 3D beam). |
| `track` | Draw the ground track of the chosen satellite: one orbit, dashed behind it and solid ahead, **amber where the satellite is in sunlight and blue where it is in the Earth's shadow**, with a key. It follows the clock. |
| `selected` | The NORAD number of the chosen satellite. |
| `airports` | Mark the world's airports: the large and medium airports with scheduled service (3,245, from OurAirports, public domain), the greater ones when the whole world is in sight, more as the map is zoomed in, and from zoom 4 their IATA codes. Off by default; the rows (about 200 kB) are loaded only when it is on. A pointer or a tap names one (`Tokyo Haneda International Airport (HND), Japan`) and a tap sends `chikyu-flat-airport` (`{ iata, name, country, lon, lat, tier, text, via }`). The key names them. |
| `shade` | `off` for no night side. |
| `look` | `map` (the default: the drawn map of countries) or `photo`: NASA's picture of the Earth, see below. |
| `borders` | `off` for no country lines over the photo. Pale, thin lines by default. |
| `texture-base` | Where the pictures are served from, as on `<chikyu-earth-realistic>`; the package's own `textures/` folder beside the code by default. |
| `max-texture` | The widest picture to hold, 4096 at most (2048 on a device that reports 2 GB of memory or less). |
| `dot-size` | The dot's width in pixels. |
| `controls` | `none`, or any of `centre zoom footprint track chips key airports`: the built-in buttons, filter chips and key, and an Airports button (`airports`, which is not among the defaults: a page that has not asked for it gets no new button). All the others by default. A page that draws its own controls sets `none` and drives the attributes. |
| `lang` | `en` or `ja`; the page's language by default. |

The filter chips are the legend too: group chips (with the number of satellites; each one a toggle) when two or more groups are loaded, plane chips (`All`, `A`, `B`... with their counts) when one group is on show and coloured by plane. A tap on a chip sends `chikyu-flat-filter` with `{ groups, plane }`, so a page can load a group the reader asked for. The property `planes` lists the planes of every loaded group (`group`, `id`, `count`, `raanDeg`, `colour`) and `chikyu-flat-planes` is sent when they change. `facts(id)` is `groupFacts` of a loaded group, and `groups` lists what is loaded.

### The clock

`time`, `speed` and `paused` work as on `<chikyu-space>` and can be set as attributes or properties:

- `time` is `now` or an ISO date; with none the map is live. Set the property to a number of milliseconds (or a `Date`) to jump: the dots are placed at once.
- `speed` is 1 for real time, 0 to hold, 86400 for a day a second, negative to run backwards.
- `paused` holds the clock and keeps the speed; nothing is drawn while it is held.
- `chikyu-timechange` carries `{ time, running, paused }`, at most four times a second.

While time runs the map draws a frame whenever a satellite would move half a pixel, up to every frame (60 a second), and at least once a second; a reader who asked for reduced motion gets one a second. Up to 60 times real time every dot is placed by SGP4 (one batch for the group a second, interpolated between). Faster, SGP4 cannot run for every frame, so each dot is turned along its orbit from a place SGP4 gave a moment ago (a slice of the group re-run every frame) and drawn as a **streak** that ends at it, a trail rather than a flicker; `trails="off"` draws plain dots. The chosen satellite is always placed by SGP4 to the frame. Nothing is drawn at rest, out of sight or in a hidden tab: a held clock, a scrolled-away page and a hidden tab ask for no frame at all, and the map draws once when it comes back. An element sets no timer when the clock is held.

### Choosing a satellite

A pointer going over a dot, a tap or click on it, or the keyboard sends `chikyu-flat-pick` with `{ id, index, group, name, plane, altitudeKm, sunlit, bearingDeg, ascending, via }`; `via` is `hover`, `tap` or `key`, and a tap on nothing sends `id: null` and clears the choice. The canvas takes keyboard focus: the arrow keys move from one dot to the next, from the left of the map to the right, Page Up and Page Down jump ten, Enter chooses, Escape clears. The name of the dot is read out in a live region and written beside it. `pick(id)` chooses one from code, without the event. `placeOf(id)` says where a satellite is on the screen. `stateOf(id)` and `selectedState` say where it is over the ground, which way it goes and whether the Sun lights it: `{ lat, lon, heightKm, bearingDeg, ascending, sunlit }`, placed exactly by SGP4 for the moment shown; it is what the pick carries.

### The key and the marks that name themselves

Under the map is a key (the `key` control) that names every mark the map draws now, each beside a small picture of it, in English or Japanese: **the Sun overhead** (the yellow dot, the point on the Earth where the Sun stands straight up; shown while the night side is), **My place** (the white diamond, when `home-lon` and `home-lat` are given), **a satellite** (and whether its colour means its group or its orbital plane), **a faint satellite** (its orbit data is old, so its place is an estimate; only while there is one), **the satellite you chose** (its ring), **the footprint** (the area that can see the satellite; while it is on), the **ground track in sunlight and in the Earth's shadow** (while it is on) and **the night side** (in the photo look, "darker, with city lights"). What is not drawn is not in the key. It is a row of words under the map, never over it; it is open on a map 600 px wide or more and shut on a narrower one (a phone) until the **Key** button is pressed, and the property `keyOpen` sets it from code. While it is open it carries the track's two colours, so the key over the map steps aside. `controls="centre zoom"` (without `key`) leaves it out.

The two marks painted into the map's own picture name themselves:

- **The Sun's dot** says "The Sun is overhead here: over the Atlantic Ocean, 23°S 15°W" (in Japanese, `ここは太陽が真上にある場所です`), and **My place** says "My place: Japan, 36°N 140°E". The place is the country the point is in (Natural Earth's outlines, as drawn) or else the nearest ocean, sea, gulf or bay; the point is in whole degrees.
- **Pointed at, pressed or reached with the keyboard.** A mouse over the mark shows the name beside it; a tap or click keeps it there (a finger cannot hover) until a tap elsewhere or Escape, and reads it aloud. Tab goes from the map to the Sun's dot, then to My place (each is a button over the mark that takes no pointer, so a drag that starts on a mark still pans the map); Enter presses it.
- **`chikyu-flat-mark`** is sent on a press: `{ mark: "sun" | "home", name, text, lon, lat, place, via }`, `via` being `tap` or `key`. `place` is the name of what the point is over, or null. A page can use it, say, to centre the map there.

The marks stay readable over the photo look: the Sun's dot has a dark edge and a pale ring, the diamond a dark edge.

### Sunlit and in the shadow

The ground track is drawn in two colours: **amber where the satellite is in sunlight, blue where it is in the Earth's shadow**, over a dark edge so it reads on a dark sea and a light one. The part behind the satellite is dashed and the part ahead solid, as before, and a key under the map names the two colours while the track is on. Amber and blue differ in lightness as well as in hue, so a reader who cannot tell red from green can read them. The shadow is the Earth's cylinder of shadow, not the cone (see [Riding along](ride-along.md) for what that means and how it is tested): a satellite is lit or it is not, with no penumbra. A page that wants other colours sets `--chikyu-flat-track-sun` and `--chikyu-flat-track-shadow`. `groundTrack(set, from, to)` of `/passes` gives every point of a track a `sunlit` too, for a page that draws its own.

### The photo look

`look="photo"` lays NASA's picture of the Earth (Blue Marble) on the map instead of the drawn countries; `look="map"`, or no attribute, is the drawn map as before, so a page that does not ask for the photo changes in nothing. The property `look` does the same, and `controls="centre look"` adds a **Map / Photo** pair of buttons to the map's own row (not among the defaults: a page that has not asked for it sees no new button). `lookState` says how it stands: `map`, `loading` (the drawn map shows while the picture comes), `photo` or `failed` (the picture could not be fetched: the drawn map stays). `chikyu-flat-look` carries `{ look, state }` when either changes.

```js no-run
const flat = document.querySelector("chikyu-flat");
flat.setAttribute("look", "photo"); // back to the drawn map: flat.setAttribute("look", "map")
flat.setAttribute("texture-base", "/textures/"); // where you serve the package's textures/ folder from
```

- **The same pictures as the 3D Earth.** The day and night pictures are the files `<chikyu-earth-realistic>` loads (`textures/day-*.webp` and `night-*.webp`: NASA Earth Observatory's Blue Marble and Black Marble, public domain; `NOTICE.md` has the terms), so a page that has one has the other. Their credit is one small line at the map's bottom edge while the photo is on: the whole line on a map 600 px wide or more, and `Earth: NASA` on a narrower one (a phone), where a tap shows the whole line. The key carries the whole line too.
- **Lined up with the map.** The picture is the map's own projection (plate carree, longitude -180 at its left edge): it follows the centre, the zoom and the wrap round the date line to the pixel, and the satellites, footprints, ground track and the Sun's and your place's marks lie on it where they lie on the drawn map. The satellites have a dark rim and the footprint a dark edge, so they read on cloud and desert.
- **Day and night.** Where the map shows night the day picture is darkened, and the night picture's city lights come on across the terminator, from the Sun 15 degrees up the sky to 7 degrees below the horizon, for the moment the clock shows. `shade="off"` shows the day picture everywhere.
- **Cost.** The pictures are fetched only when the look is `photo`, one size of each at a time (1024, 2048 or, for the day, 4096 pixels across: the smallest with a pixel for each one the world is across at the zoom), a larger one at once and a smaller one after the zoom has stayed out for 4 seconds; they are freed when the look goes back to `map` or the element leaves the page. The canvases keep to 6 million pixels and 4096 a side. The map is drawn only when the view or the Sun's place (half a degree) changes, and not at all at rest, out of sight or with the clock held; a reader who asked for reduced motion gets a frame a second at most while time runs.

### Style

The sea, land, outline and night colours are the custom properties `--chikyu-flat-sea`, `--chikyu-flat-land`, `--chikyu-flat-line` and `--chikyu-flat-night`; the track's two colours are `--chikyu-flat-track-sun` and `--chikyu-flat-track-shadow`. `--chikyu-flat-key-inset` (0) keeps that much room at the left of the key, for a card that lies over the map's left side; `--chikyu-flat-aspect` (2 / 1) and `--chikyu-flat-aspect-narrow` (4 / 3, under 600 px wide) set the shape of the map, and `--chikyu-flat-radius` its corners. Give the element a height and the map fills it.

## Cost

Everything runs in the browser from the elements you hand over: no request, no server, no timer when the clock is held. The two canvases stay within 6 million pixels and 4096 on a side whatever the screen. On the Mac this was built on, 11,000 Starlink satellites and the other groups together (12,000 dots) took about 6 to 9 ms a frame at 600 times real time and 60 frames a second, in streaks, in a browser drawing on the CPU.
