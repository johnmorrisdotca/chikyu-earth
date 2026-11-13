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
- `view: "above"` (a satellite; a body is followed instead) puts the camera on the line from the Earth's centre through the satellite, `distanceKm` (3000 by default, divided by the zoom, so the zoom changes the height) above it, looking straight down at it with the way it is going at the top of the picture. The satellite stays in the middle of the picture while the clock moves it along its orbit and the Earth turns beneath. A drag turns the picture about the satellite (sideways) and tips the camera back or ahead of it (up and down, to at most 80 degrees either way, so the camera never looks along the horizon); with a satellite model set, the model is drawn there as in the follow view. The view glides from and to the others (it jumps for a reader who asked for reduced motion), draws as often as the picture moves and never more than 30 times a second, and draws nothing while paused or out of sight. `aboveAxes` of `/space` is the camera's place and top for a satellite's place and velocity.
- `look: "down"` (the default) looks at the Earth's centre. `look: "horizon"` tips the camera forward until the horizon is a little above the middle. A drag looks about from there, like a head on a pivot (a drag right turns the camera to its left and a drag up tips it towards the bottom of its picture, so the ground follows the pointer). In the `horizon` look the camera stays level: a sideways drag turns it all the way round the local vertical (the line from the Earth's centre through the satellite, 360 degrees) and an up or down drag only tips it, from straight down to 20 degrees above the horizon, with no roll; the zoom narrows the field of view. The element carries its own drag, pinch, wheel and keys, and while riding from a body it holds the zoom to 0.5 to 6 by itself (the range comes back when the ride stops; a `zoom-min` or `zoom-max` you set yourself is left alone).
- `viewpoint: "outside" | "inside"` says where the camera is. **`outside` is the default**: a ride shows the satellite. With `view: "from"` and `look: "horizon"` the camera is 25 km behind and above the satellite on its track, the satellite drawn at the bottom middle of the picture, part of it below the bottom edge, as if you rode on it and looked ahead over it, with the Earth and the horizon beyond; with `look: "down"` it is 25 km straight above, the satellite at the middle looking small against the ground, its solar panels turned the way the model has them. The look-around is the same as from the satellite (the camera turns where it is, so the satellite stays in the same place in the picture as you look round) and the zoom does not move it. The satellite is drawn from the page's model when it has one (`setSatellitePainter`), else from a small drawing of the package's own for its kind (a bus with two panels, a dish for a communications satellite, one long panel for a constellation's satellite, a row of modules for a station: boxes and cylinders, no copied artwork). Its true size is a few metres, so it is drawn far larger than that, about a fifth of the height of the picture across: **not to scale**, and the page says so under the picture, as the demo does. `inside` is the camera at the satellite, as a ride was before, with no drawing of the satellite. The same is the attribute `ride-viewpoint="inside"` and the property `rideViewpoint` (the default for the next `ride`; set while riding it moves the camera between the two in one eased glide, 1.2 seconds, a jump for a reader who asked for reduced motion, and keeps the ride and the clock). A body (the Moon, a planet) is always ridden from inside. In the `follow` and `above` views the camera is outside already: `outside` adds the package's drawing where the page has no model, `inside` leaves a dot as before.
- `modelSize: "distance" | "fixed"` says how big the satellite's model is drawn as a ride above it rises. **`distance` is the default**: the model keeps its size at the lowest height (17 per cent of the picture's height in radius, up to 150 km) and then shrinks as one over the height, and from 1,000 km is let down smoothly to nothing at 2,000 km, where the satellite is its ordinary mark again (the ring and name come back as the model gets no bigger than a ring, about 10 pixels in radius); from 6,000 km a satellite is a point and is drawn as one. The page's own model is told the smaller size through `update({ radiusPx })`. `fixed` keeps the same share of the picture at every height, as 0.46.1 did. The attribute is `ride-model-size`, the property `rideModelSize` (the default for the next `ride`; set while riding it changes the one ridden), and `stats.followModel` reports the radius (`radiusPx`) and its box. The ring and name of a chosen satellite stay off its model in both modes while the model is drawn, and come back at the hand-over (`distance`) or when the ride ends. The package's own drawings by kind (a bus with two framed panels, a dish for a communications satellite, one long panel for a constellation, modules for a station, a slim box with short panels for a cubesat such as FLOCK, DOVE or LEMUR) keep every part inside the model's disc, so nothing of them is drawn outside the box `stats.followModel` reports. While the model is drawn the package keeps its own names (places, cities, seas, countries, stars) clear of its box, and the element sends `chikyu-ride-model` with `detail: { box, radiusPx, x, y }` (CSS pixels from the element's top left; `box` is `null` when no model is drawn) whenever the box has moved by more than a pixel or has come or gone, so a page can keep its own labels clear of the model too; nothing is sent while it stands still.
- Another call to `ride` **switches smoothly**: the camera glides from where it was in a second and a bit (`smooth: false`, or a reader who asked for reduced motion, jumps). `ride(null)` stops.
- Time is the page's clock: `speed` plays it faster or slower, backwards too. A satellite you ride is placed exactly (one SGP4 call a frame), so it stays right at any speed, even where the group of satellites is hidden.
- `chikyu-ride` tells the page what changed; `chikyu-ride-lost` says the satellite could not be placed on this date (its elements are too old) and the ordinary camera is back. `element.riding` says what is ridden now.

The space view has no markers; the places of `attachMarkers` belong to the flat and the realistic globe.

## Follow a satellite as a model

`space.ride(ref, { view: "follow" })` already keeps a distance from a satellite and watches it, with the Earth turning and sliding beneath. With a model, the satellite is no longer a dot: **the package ships no model**, the page supplies them, and a followed satellite that the page has a model for is drawn as it, locked in the middle of the picture at a size that reads, pointed the way it really flies, lit by the real Sun. A satellite with no model stays a dot.

```ts no-run
import { setSatellitePainter } from "@johnmorrisdotca/chikyu-earth/space/element";
import type { SatellitePainter } from "@johnmorrisdotca/chikyu-earth/space";

const painter: SatellitePainter = {
  has: (norad) => norad === 25544, // the ISS
  make: async (three, norad) => {
    const group = new three.Group(); // your model, scaled to a radius of 1 about the origin
    return { object: group, light: (toSun) => undefined, dispose: () => undefined };
  },
};
setSatellitePainter(painter);

const space = document.querySelector("chikyu-space")!;
space.ride({ group: "stations", index: 0 }, { view: "follow" });
console.log(space.largeSatellites().map((one) => one.name), space.followNext()?.name);
```

- **The model's axes.** A model has a radius of 1 about its middle: its long axis along +x (the way the satellite flies), its top, the side that faces space, along +z, and its left along +y. The view turns it to the satellite's real direction of flight (`satelliteAxes`) and puts its middle on the satellite.
- **Its size.** Its radius on the screen is 17 per cent of the height of the view whatever distance the camera keeps (`MODEL_RADIUS_SHARE`, `modelRadius`), and never under its true size, so a camera that comes close sees it as big as it is.
- **The Sun.** `light(toSun)` is told at every draw the unit direction from the satellite to the Sun in the scene's axes (x to the vernal equinox, y north); the model's own turn is in `object.matrix` (set by the view, with `matrixAutoUpdate` off), so a model with one light takes the Sun's direction in its own axes from the matrix's columns. `update({ toSun, ms, radiusPx })` is told how many pixels across its radius is, for a picture that is worth fetching sharper.
- **Which satellites.** `has(noradId)` says by NORAD number (`25544` the ISS, `48274` Tiangong, `20580` Hubble) whether there is a model. `make` may answer at once or later (a promise); `null` is no model. A model made for a satellite that is no longer followed is let go.
- **The list and the hop.** `space.largeSatellites()` lists the satellites of the groups now set that have a model, with their names in the page's language; `space.followNext(step = 1)` follows the next (or, with `-1`, the previous), going round, and returns it. `stats.followModel` has the model's middle on the screen as of the last draw, `null` when none is drawn.
- **Above it too.** In the `above` view (`ride(ref, { view: "above" })`) the model is drawn the same way, at any height, 150 km included: in the middle of the picture, seen from straight above with its nose along the way it goes. With `tiles` set (see the tiles guide) the ground under it is laid with the finer map at the level that height needs.
- **Nothing at rest.** The model is part of the picture: with the clock held and the view still nothing is drawn, and the glide to the next satellite is the view's own, a second and a bit (a jump for a reader who prefers reduced motion).

The demo draws made-up stand-ins (`demo/station-models.ts`, boxes and cylinders in the shape of the ISS, Tiangong and Hubble) so the follow view can be seen; they are not pictures of the real ones. NASA's own ISS model is public domain, and a model a page's author made, or that carries a licence its page can pass on, is the page's to supply.

## Face a way again

While you are riding, `space.face("ahead" | "behind" | "left" | "right" | "down" | "up")` turns the camera there and keeps the zoom. Ahead is along the way it is going, behind is the opposite, left and right are across that way as you face ahead, down is straight at the Earth and up is straight away from it. In the above view, down looks straight down at the satellite and the Earth below it. The camera glides there in half a second, or at once for a reader who asked for less motion. `space.facing` is that way until the view is turned or tipped, and `chikyu-ride-face` is sent with `{ face }` (`null` when it is let go). Keys, while the element is focused: W ahead, S behind, A left, D right, R up, F down. The arrow keys stay with the view controls; a held key does not repeat, and a key typed in a field or in editable text is left to it. Following a planet or the Moon there is no way to face: `face()` returns `false` and nothing turns. The demo's Face row is these six, and the address keeps `face=ahead` (or behind, left, right, down, up).

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
