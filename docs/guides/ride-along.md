---
title: Riding along with a satellite or a planet
section: how-to
order: 9
description: Put the camera on the ISS, a Starlink satellite, the Moon or a planet and look at the Earth from there, with the Earth turning and sliding beneath as it goes, under a budget that keeps it light.
---

`<chikyu-space>` can ride along: the camera sits at a moving body, at its real place for the moment shown, and looks at the Earth. From the ISS the Earth goes by beneath you and you are round it about every 93 minutes; from the Moon it is a ball ten Earth radii away (sixty in the true scale) that turns once a day. It needs the space view and, for a satellite, a group of satellites (see [Satellites on the globe](satellites.md)).

## Ride one

The page:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Riding along with the ISS</title>
  </head>
  <body>
    <chikyu-space time="2026-11-02T12:00Z" speed="60" texture-base="/textures/" style="width: 420px"></chikyu-space>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

And its script. `ride` takes a body's name (`"Moon"`, `"Mars"`, ...) or a satellite `{ group, index }` and some options:

```ts no-run
import "@johnmorrisdotca/chikyu-earth/space/element";
import { createSatellites, type ElementSet } from "@johnmorrisdotca/chikyu-earth/satellites";

// One downloaded element set of the ISS (see the satellites guide for where to get them).
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
space.setSatellites("stations", createSatellites([iss]));
// The camera sits at the ISS, tipped towards the horizon, and the Earth goes by beneath it a minute a second.
space.ride({ group: "stations", index: 0 }, { view: "from", look: "horizon" });
space.addEventListener("chikyu-ride-lost", () => console.log("the elements are too old for this date"));
```

- `view: "from"` (the default) puts the camera at the body looking at the Earth, with the way it is going at the top of the picture. `view: "follow"` keeps it a fixed distance behind and looks at the body instead (`distanceKm`, 3000 for a satellite; for a planet it is the distance the zoom says, as in the "Look at" row of the demo).
- `look: "down"` (the default) looks at the Earth's centre. `look: "horizon"` tips the camera forward until the horizon is a little above the middle. A drag looks about from there, like a head on a pivot (a drag right turns the camera to its left and a drag up tips it towards the bottom of its picture, so the ground follows the pointer); the shared controls' zoom narrows the field of view (set `zoom-min="0.5" zoom-max="6"` on `<kazoku-view-controls>` while riding).
- Another call to `ride` **switches smoothly**: the camera glides from where it was in a second and a bit (`smooth: false`, or a reader who asked for reduced motion, jumps). `ride(null)` stops.
- Time is the page's clock: `speed` plays it faster or slower, backwards too. A satellite you ride is placed exactly (one SGP4 call a frame), so it stays right at any speed, even where the group of satellites is hidden.
- `chikyu-ride` tells the page what changed; `chikyu-ride-lost` says the satellite could not be placed on this date (its elements are too old) and the ordinary camera is back. `element.riding` says what is ridden now.

The space view has no markers; the places of `attachMarkers` belong to the flat and the realistic globe.

## The camera, as numbers

The maths of where the camera looks is a pure function that needs no browser, `ridePose`. Here it is for a camera 420 km up going along -z, tipped towards the horizon:

```js
import { ridePose } from "@johnmorrisdotca/chikyu-earth/space";

// Where a camera riding along with the ISS looks: 420 km up over the +x axis, going along -z, tipped towards the horizon.
const pose = ridePose({ position: [1.066, 0, 0], velocity: [0, 0, -7.66], look: "horizon", yaw: 0, tilt: 0, zoom: 1 });
console.log(`The horizon is ${pose.earthRadiusDegrees.toFixed(0)} degrees from straight down; the camera looks ${pose.forward.map((n) => n.toFixed(2)).join(", ")}.`);
```

## The budget

A ride animates continuously, so each line is tested (`e2e/ride.gl.ts`):

- The draws follow the picture: as often as it moves a pixel, 1 to 30 times a second, never more. At rest (paused, or after a glide) nothing is drawn and no frame is asked for.
- A reader who asked for reduced motion gets one step a second and a jump instead of a glide.
- Nothing is drawn out of sight or in a hidden tab, however fast the clock runs.
- The glide lasts about 1.2 seconds, and its frames are held to the same cap.
- One WebGL context, no new buffers or textures from riding, everything freed when the ride stops or the element goes, a lost context comes back with the ride.

The numbers are in [docs/ride-along.md](https://github.com/johnmorrisdotca/chikyu-earth/blob/main/docs/ride-along.md).
