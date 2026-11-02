---
title: Satellites on the globe
section: how-to
order: 8
description: Show the ISS, the space stations or thousands of Starlink satellites on the space view from orbital elements your page supplies, with the rules for getting them and the budget that keeps it light.
---

`<chikyu-space>` can draw satellites at the places SGP4 puts them for the date and time shown, with their orbits, and tell a reader about the one they press. It is optional and costs nothing unless you import it.

**The package fetches nothing and ships no orbital data.** Your page gets the orbital elements and passes them in. That keeps every question about who may be asked for data, how often, and what to credit, on the page that asks.

## Install

```sh
npm install @johnmorrisdotca/chikyu-earth three @johnmorrisdotca/kazoku-ui astronomy-engine satellite.js
```

`three`, `@johnmorrisdotca/kazoku-ui`, `astronomy-engine` and `satellite.js` ([MIT](https://github.com/shashwatak/satellite-js); use version 6, which is plain JavaScript of 10 KB gzipped) are optional peers: only the space view and `/satellites` use them.

## Getting orbital elements

The format is the "GP" JSON that [CelesTrak](https://celestrak.org) serves, one object for each satellite (`ElementSet` has the fields that are read). Read CelesTrak's [usage policy](https://celestrak.org/usage-policy.php) before you fetch, and credit it on your page. In short, on 2 November 2026:

- The data change every two hours at most. Ask for a list once for each update, not once for each visitor: fetch on a schedule or on your server, keep the answer, and serve your copy.
- Stop on any answer that is not 200. More than 50 errors in two hours puts your address in CelesTrak's firewall.
- A group such as Starlink is a subset of the full list: fetch one of them, not both.
- [Space-Track](https://www.space-track.org) serves the same elements to approved accounts, but its user agreement does not let an account holder pass the data on, so it does not suit a page for other people.

Elements go stale: SGP4's error grows by a few kilometres a day. A satellite whose elements are more than 14 days from the moment shown (`maxAgeDays`) is left out, and `info(index, ms).ageDays` tells you how old they are. The demo uses one snapshot of CelesTrak's lists from 2 November 2026 (every fifth Starlink satellite and all the stations), credited on its page, and shows the age of the elements.

## Show them

The page, with the space view:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Satellites on the Earth from space</title>
  </head>
  <body>
    <chikyu-space center="-100,40" time="2026-11-02T12:00Z" speed="0" texture-base="/textures/" style="width: 420px"></chikyu-space>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

And its script. `createSatellites` starts SGP4 for each element set and lists any it could not use in `refused`; `setSatellites` puts the group on the view:

```ts no-run
import "@johnmorrisdotca/chikyu-earth/space/element";
import { createSatellites, type ElementSet } from "@johnmorrisdotca/chikyu-earth/satellites";

// Your page gets the elements (CelesTrak's JSON, within its usage policy) and passes them in; this is one downloaded element set.
const iss: ElementSet = {
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

const space = document.querySelector("chikyu-space")!;
space.setSatellites("stations", createSatellites([iss]), { color: "#ffd54f", size: 6, orbits: true });
space.addEventListener("chikyu-satellite-click", (event) => console.log((event as CustomEvent).detail.info?.name));
```

A group is **one draw call** however many satellites it holds. Name each group (`"stations"`, `"starlink"`): `showSatellites(name, false)` hides one, `setSatellites(name, null)` takes it away and frees what it held. `orbits: true` draws every orbit of a group of 40 or fewer.

## Choosing one

A press on a satellite (not a drag that turns the view, and not one behind the Earth) fires `chikyu-satellite-click` with `{ group, index, info }`; `info` has its name, NORAD number, the age of its elements, its height, speed and period. `selectSatellite({ group, index })` marks one from code (a ring, its orbit and its name beside it), and `satelliteInfo(ref)` tells you about it. A page with a search box or a list of names uses those two, so a keyboard reader can choose too.

## On a server

The same positions need no browser. Here is the ISS's height and speed from one element set:

```js
import { createSatellites } from "@johnmorrisdotca/chikyu-earth/satellites";

// SGP4 on a server: the same positions the space view draws, no browser needed.
const group = createSatellites([
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
  },
]);
const info = group.info(0, Date.UTC(2026, 10, 2, 12));
console.log(`${info.name}: ${Math.round(info.altitudeKm)} km up, ${info.speedKmS.toFixed(2)} km/s`);
```

## The budget

The same rules as the rest of the space view, each tested at 6,000 satellites:

- Nothing at rest: paused, nothing is drawn, no frame is asked for, SGP4 does not run.
- SGP4 about once a second, whatever the frame rate: the whole group at two moments a step apart (the step is the clock's speed in seconds, from 1 to 60), and arithmetic between.
- At most 30 frames a second, and one a second at real time, or when the reader asked for reduced motion.
- Above 60 times real time the groups are hidden and SGP4 does not run: the two moments would be too far apart to interpolate. A chosen satellite is still placed exactly.
- Nothing is drawn out of sight or in a hidden tab, one WebGL context, everything freed when a group or the element is taken away, and a lost context comes back with the satellites.

The numbers and the tests are in [docs/satellites.md](https://github.com/johnmorrisdotca/chikyu-earth/blob/main/docs/satellites.md).
