---
title: "A satellite's history, and the Observe view"
section: how-to
order: 24
description: "Launch and decay dates, a series of element sets that place a satellite at any past moment, a shaded prediction after the newest set with its uncertainty stated, the mean height at each set for a chart, and the Observe view: outside the satellite with its trail over its last orbits."
---

One satellite has many element sets over its life. `createSatelliteHistory(sets, options)` in `@johnmorrisdotca/chikyu-earth/satellites` takes them all, with the launch and decay dates, and places the satellite at any moment from the set **nearest that moment** (SGP4, by satellite.js, an optional peer). **Chikyu fetches nothing:** your page brings the sets (see [Satellites on the globe](satellites.md) for where to get them and the rules of the sources). It imports on a server.

## Where it stands at a moment

```js
import { altitudeSeries, createSatelliteHistory } from "@johnmorrisdotca/chikyu-earth/satellites";

// One satellite's history on a server: two element sets a week apart (your page brings them; chikyu fetches nothing), its launch and decay, and where it stands on four dates.
const set = (epoch, meanMotion, meanAnomaly) => ({
  OBJECT_NAME: "ISS (ZARYA)",
  OBJECT_ID: "1998-067A",
  EPOCH: epoch,
  MEAN_MOTION: meanMotion,
  ECCENTRICITY: 0.0007139,
  INCLINATION: 51.6332,
  RA_OF_ASC_NODE: 335.9757,
  ARG_OF_PERICENTER: 339.3739,
  MEAN_ANOMALY: meanAnomaly,
  NORAD_CAT_ID: 25544,
  BSTAR: 0.00012,
  MEAN_MOTION_DOT: 0.0001,
  MEAN_MOTION_DDOT: 0,
});
const sets = [set("2026-11-02T10:25:21.580320", 15.49150046, 20.6961), set("2026-11-09T10:25:21.580320", 15.50, 200)];
const history = createSatelliteHistory(sets, { launch: "1998-11-20", decay: "2031-01-01" });
for (const day of ["1998-01-01", "2026-11-05", "2026-11-20", "2031-06-01"]) {
  const now = history.describe(Date.parse(`${day}T12:00:00Z`));
  console.log(`${day}: ${now.status}${now.uncertaintyKm > 0 ? `, within ${Math.round(now.uncertaintyKm)} km` : ""}`);
}
console.log(altitudeSeries(sets).map((point) => `${new Date(point.epochMs).toISOString().slice(0, 10)} ${Math.round(point.altitudeKm)} km`).join(", "));
```

`history.describe(ms)` says, with no SGP4 call, which of six states the moment is in:

| `status` | the moment is | the satellite is |
| --- | --- | --- |
| `before-launch` | before its launch | not drawn |
| `backcast` | after the launch, before the oldest set | placed from the oldest set, carried back |
| `tracked` | between the oldest and the newest set | placed from the nearest set |
| `predicted` | after the newest set | placed from it, **drawn shaded** |
| `decayed` | after its decay date | not drawn: `decayedMs` says when it came down |
| `unplaceable` | any moment SGP4 cannot place (no usable set, or it fell below the air) | not drawn |

The launch and decay come from `options.launch` and `options.decay` (a date such as `2026-11-02`, a date and time, or milliseconds), else from `LAUNCH_DATE` and `DECAY_DATE` of the sets, else (the launch only) the start of the launch year in `OBJECT_ID`; `launchExact` says whether the launch was a given date. A bare decay date is the end of that day. Sets SGP4 cannot start from are left out and listed in `history.refused`; the rest are sorted by epoch.

`history.exact(ms, out)` gives the place and velocity (Earth radii and km/s, in the space view's axes) into `out` and returns the status. `history.trailInto(ms, orbits, out)` and `history.trail(ms, orbits, points)` give the satellite's own path over its last `orbits` orbits, each point from the set nearest its own moment.

## How far to trust a place

Every placed moment carries `uncertaintyKm`, the stated uncertainty of the place for its distance in days from the nearest set: `baseKm + kmPerDay * d + kmPerDaySquared * d * d`, 1 km, 3 km a day and 1.5 km a day squared by default (`DEFAULT_UNCERTAINTY`, `predictionUncertaintyKm(days, model)`; the `uncertainty` option changes it). It grows the further a moment is from a set, before or after, and is the **same figure** whichever way. It was set from what was measured against NASA/JPL Horizons: the ISS placed from the one recorded set of 2 November 2026 was 25, 59, 108 and 168 km from Horizons' ISS at 5.6, 7.6, 9.6 and 11.6 days (right ascension, declination and range from the Earth's centre; each limit holds with a margin of 1.4 to 2.5). That is a low orbit with much drag, so the figure is a ceiling for a higher one, not a forecast; a satellite that was reboosted or manoeuvred is off by more, which no element set can say before it happens.

## The space view

`setSatelliteHistory(id, history)` on `<chikyu-space>` takes what `createSatelliteHistory` made (the element does not import satellite.js itself) and sets the satellite as the group `history:<id>`, one satellite at index 0. It is placed at any moment the clock shows from the set nearest it, left out before its launch and after it has come down, and **drawn shaded after its newest set** (the same shading as an estimate, with `estimated` true in `info`, `placeSatellite` and the events). `satelliteHistory(id)` gives the history back, for `describe(ms)`: the page says "launched", "predicted, within 40 km" or "came down on 2024-03-02". `setSatelliteHistory(id, null)` takes it away.

## The Observe view

`observe(id, options)` puts the camera **outside the satellite** (the follow view, 3000 km back by default, with the page's model if it set one), the Earth turning and sliding beneath, and draws the satellite's **trail over its last `orbits` orbits** (0.25 to 20, 3 when left out) behind it as one line. The trail is the satellite's own path, placed by the same SGP4, from the set nearest each of its moments, so it runs back at any clock speed and is shorter where the satellite was not yet launched. It is drawn from the points of the past kept on a grid of 96 to an orbit, so a frame costs one SGP4 call and the points that have come into the window, never the whole trail; it is built only when the clock moves, and **nothing is drawn at rest or out of sight**. `observe(null)` stops, and so does any other `ride`. `element.observing` says what is shown. A satellite of any group can be observed (`observe({ group, index })`, or its NORAD number); a history is not needed. The same example in a page:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>The Observe view: outside a satellite, with its trail</title>
  </head>
  <body>
    <chikyu-space time="2026-11-02T20:00Z" speed="0" texture-base="/textures/" style="width: 420px"></chikyu-space>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

```ts no-run
import "@johnmorrisdotca/chikyu-earth/space/element";
import { createSatelliteHistory, type ElementSet } from "@johnmorrisdotca/chikyu-earth/satellites";

// The ISS's element sets (see the satellites guide for where to get them: your page brings them, chikyu fetches nothing).
const sets: ElementSet[] = [
  {
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
    LAUNCH_DATE: "1998-11-20",
  },
];

const space = document.querySelector("chikyu-space")!;
// The history places it from the set nearest each moment, not before its launch, shaded (a prediction) after its newest set.
const history = createSatelliteHistory(sets);
space.setSatelliteHistory(25544, history);
// Observe: the camera outside the satellite, the Earth turning beneath, and its path over its last 3 orbits behind it.
space.observe(25544, { orbits: 3 });
const now = history.describe(Date.parse("2026-11-02T20:00:00Z"));
console.log(now.status, `within ${Math.round(now.uncertaintyKm)} km`); // predicted within 2 km
```

## The mean height at each set

`altitudeSeries(sets)` gives one point `{ epochMs, altitudeKm, noradId }` for each usable set, oldest first: the height averaged over one revolution about the set's epoch (SGP4 at 24 moments), above the mean Earth radius of 6371 km. A station's reboosts and a satellite's slow fall show as steps and a slope in a chart; the example above prints one. A page builds the chart itself.

## What is not here

A series of element sets is not a measured track: before the oldest set, after the newest, and between two sets far apart, SGP4 carries a model forward or back, and `uncertaintyKm` says how far to trust it. The package gives no place for a satellite after it has decayed, and fetches nothing.
