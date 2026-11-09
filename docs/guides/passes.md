---
title: When can I see the ISS? Satellite passes over a place
section: how-to
order: 9
description: Work out when the ISS, Tiangong, Hubble or any satellite crosses the sky over a place, which way to look, how bright it is and whether it can be seen, with the sky dome that draws it, a ready-made element, and how well it matches Skyfield.
---

`findPasses` works out the next passes of a satellite over a place: when it comes up, when it is highest and when it goes down, which way it is each time, how bright it looks, and whether anyone can see it, which needs the satellite lit by the Sun while the watcher's sky is dark. It is the same SGP4 as `createSatellites`, a pure function with no DOM and no clock, and it imports on a server. The package also has `skySvg` (the path across the sky, as an SVG string), `groundTrack` (the path on the Earth, for a globe) and the element `<chikyu-passes>` that lists the passes and draws the dome.

## Install

```sh
npm install @johnmorrisdotca/chikyu-earth satellite.js
```

`satellite.js` (MIT, version 6) is an optional peer, as for the satellites. The package fetches no orbit data of its own: your page passes them in (see [Satellites on the globe](satellites.md) for where to get them and the rules).

## One call

```js
import { findPasses } from "@johnmorrisdotca/chikyu-earth/passes";

// When the ISS crosses the sky over London, from one downloaded element set: the same answer on a server as in a page.
const iss = {
  OBJECT_NAME: "ISS (ZARYA)",
  OBJECT_ID: "1998-067A",
  EPOCH: "2026-11-02T10:25:21.580320",
  MEAN_MOTION: 15.49150046,
  ECCENTRICITY: 0.0007139,
  INCLINATION: 51.6332,
  RA_OF_ASC_NODE: 335.9757,
  ARG_OF_PERICENTER: 339.3739,
  MEAN_ANOMALY: 20.6961,
  NORAD_CAT_ID: 25544,
  BSTAR: 0.00012,
  MEAN_MOTION_DOT: 0.0001,
  MEAN_MOTION_DDOT: 0,
};
const day = Date.UTC(2026, 10, 3);
const [pass] = findPasses(iss, { latitude: 51.5074, longitude: -0.1278 }, { from: day, to: day + 3 * 86_400_000 }, { all: true });
console.log(`${pass.name}: highest ${Math.round(pass.highest.altitude)} degrees in the ${pass.highest.compass}, ${pass.reason}`);
```

`findPasses(sets, observer, window, options)` takes one element set or several, a place (`latitude`, `longitude`, `heightM`), the span of time (`from` and `to`, in milliseconds since the Unix epoch) and options. A pass is listed when its highest point is in the span. By default only the passes that can be seen are listed; `all: true` lists them all and says why a pass cannot be seen.

## What a pass holds

- `start`, `highest` and `end`: each has the moment in UTC (`ms`), the direction (`azimuth` in degrees from north, and the compass word `compass`, one of sixteen: `SSE`), the height above the horizon (`altitude`, degrees) and the distance. The pass is the time above `minAltitude`, 10 degrees by default: lower than that there are trees, buildings and haze, and sky-watchers' tables use 10 too. Set `minAltitude: 0` for the passes from the horizon. The heights are geometric: no refraction is added.
- `visible`: the part that can be seen, with its own `start`, `highest` and `end`, or `undefined` when none can. It begins when the satellite is lit, the sky is dark enough, it is bright enough and it is above the lowest altitude, and ends when one of them stops. The ISS often goes into the Earth's shadow part-way through a pass, so the visible part ends before the pass does.
- `reason`: `visible`, `daylight` (the sky is too bright for all of the pass), `shadow` (the sky is dark but the satellite is in the Earth's shadow for all of it) or `faint` (it is lit and the sky is dark, but it is too faint).
- `sky` and `sunAltitude`: how dark the watcher's sky is, from the Sun's altitude: `day`, `civil` twilight (the Sun is up to 6 degrees below the horizon), `nautical` (6 to 12), `astronomical` (12 to 18) and `night`. A pass counts as visible in civil twilight or darker by default, and the pass says which it was; `sky: "nautical"` asks for a darker sky, as some sky-watchers' tables do. The Sun is the package's own low-precision one, good to about 0.02 degree; sunset is at -0.833 degrees.
- `sunlit`: the satellite is in sunlight for at least part of the pass. The shadow is the Earth's, as a cylinder of its equatorial radius.
- `magnitude`: the brightest it is, over the visible part (or, when none is visible, over the part that is lit). Smaller is brighter: the brightest star, Sirius, is about -1.5 and Venus at its best is about -4.6. It is worked out from the satellite's standard magnitude (its brightness from 1000 km with half of it lit), the distance and the angle between the Sun and the watcher at the satellite, treating the satellite as a sphere that reflects light evenly. For the ISS, Tianhe and Hubble the package works the standard magnitude out itself from a rough cross-section (`ESTIMATED_CROSS_SECTIONS`: about 2,000, 200 and 70 square metres, from the sizes the space agencies publish) and an assumed albedo of 0.2 (`standardMagnitude`, from the Sun's magnitude of -26.74), which gives -0.8, 2.3 and 2.9 (`STANDARD_MAGNITUDES`). That is a model, not a measurement: a real satellite is not a sphere (the station is mostly solar panels, which can flash), so the brightness is good to a magnitude or two. Give better figures, from your own observations or a table you may use, with `magnitudes: { 25544: -1.8 }`. A satellite with no known standard magnitude has no `magnitude` and is never counted as too faint. A satellite fainter than `limitingMagnitude` (4 by default) counts as not visible.
- `elementEpochMs`, `elementAgeDays` and `stale`: how old the orbit data are at the pass.

`satelliteAt(set, observer, ms)` gives the same facts for one moment, `passPath` gives the track across the sky for a pass and `groundTrack` the places straight under the satellite.

## Passes depend on fresh orbit data

A pass is only as good as its elements. SGP4's error grows by a few kilometres a day, and each time the station is reboosted (every month or two) it moves by far more than that at once, after which elements from before the reboost are wrong. So every pass says how old its elements are (`elementAgeDays`), `stale` is true after two weeks (`DEFAULT_DIM_AFTER_DAYS`), and a pass more than 30 days from its elements (`maxAgeDays`) is left out. The demo shows the day its orbit data were downloaded beside the list. Download new elements at least every few days for the ISS, and read the source's own rules.

## How well it matches

The same element sets, downloaded from CelesTrak on 9 November 2026, were run through Skyfield, which shares no code with this package or with satellite.js, and the numbers are kept in `test/recorded/` with their source and date:

- **Skyfield** 1.55 with the Python `sgp4` package and NASA's DE421 (made by `scripts/passes-reference.py`): 249 passes of the ISS, Tianhe and Hubble over London, Sydney, Quito and Tokyo for ten days. Every rise, highest point and set is within 1 second of Skyfield's (the worst was 0.3 second), and the number of passes is the same. At the moments Skyfield names, the direction is within 0.06 degree (not asked straight overhead, where a tiny move turns it a long way), the height within 0.005 degree, the distance within 50 metres and the Sun's altitude within 0.005 degree. Of 747 moments, one differs on sunlight: it is within seconds of the Earth's shadow, which Skyfield models as a cone and this package as a cylinder.
- **By hand**, the results were also compared on 9 November 2026 with the published predictions of a popular sky-watching site (none of its data is in this package): all 249 passes above 10 degrees were found, their times within 2 seconds (the site keeps whole seconds) and their directions the same compass words. The brightness has no such check: it is the model above.

The times are UTC from SGP4 with the Earth turning by Greenwich mean sidereal time; the small difference between UTC and the Earth's real turn (under a second) is not applied, which is a few hundred metres at most.

## In a page: the element

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Passes of the ISS over Tokyo</title>
  </head>
  <body>
    <script type="module" src="https://cdn.jsdelivr.net/npm/@johnmorrisdotca/chikyu-earth/passes/element/+esm"></script>
    <!-- Your page chooses where the orbit data come from (its own file, or a source whose terms it has read); this address is an example. -->
    <chikyu-passes latitude="35.69" longitude="139.69" days="5" time-zone="Asia/Tokyo" elements-src="https://example.org/elements.json"></chikyu-passes>
  </body>
</html>
```

`<chikyu-passes>` lists the passes (the visible ones, or `show="all"`), and draws the sky dome and the facts of the one pressed, in English or Japanese (`lang`). It takes `latitude`, `longitude`, `height`, `days` (1 to 14), `sky`, `satellite` (a NORAD number, to list one of several sets), `from` (the first moment; the time the page first needed it by default, read once) and `min-altitude`. The orbit data come from the `elements` property or from `elements-src`, an address read once when the element comes into the page, with the politeness rules of `fetchElements` (nothing is asked again within two hours, and a source that failed is left alone); the element never polls. Times are in the browser's time zone, in the zone `time-zone` names (`Asia/Tokyo`), or at the `utc-offset` you give, and UTC is always shown beside them. It sends `chikyu-pass-select` with the pass when one is pressed, so a page can draw its own picture (the demo draws the ground track on a globe). A `<div slot="ground">` inside the element is shown beside the dome.

The demo's page, [Passes over me](https://johnmorrisdotca.github.io/chikyu-earth/passes.html), has a map, a search, a "My location" button (the browser is asked only when it is pressed, never on load), and the code for every way a page is made: a script tag, an ES module, React, Vue, Angular, Svelte and an iframe of `passes-embed.html`.

## The budget

Nothing runs on a timer. A list is worked out when something it shows changes: ten days of the ISS take a few tens of milliseconds, and three satellites a little more. The element reads the clock once, and fetches at most once when it is added to a page.
