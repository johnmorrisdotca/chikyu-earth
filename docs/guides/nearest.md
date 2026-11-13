---
title: "Satellites nearest a place"
section: how-to
order: 21
description: "Which satellites are nearest a place on the ground, a direction in the sky, or another satellite, and when two of them next pass close."
---

`nearest` and `within` in `@johnmorrisdotca/chikyu-earth/satellites` answer from the positions SGP4 already gives (`exact`). One call places each satellite once. It does not run again by itself, and nothing is drawn until a page asks.

```js no-run
import { nearest, within } from "@johnmorrisdotca/chikyu-earth/satellites";

const date = Date.now();
const near = nearest(stations, { place: { lon: -0.13, lat: 51.51 } }, { date, by: "space", count: 5 });
console.log(near[0].name, near[0].distance.kilometres.toFixed(0));
const overhead = nearest(stations, { place: { lon: -0.13, lat: 51.51 } }, { date, by: "sky", count: 3 });
console.log(overhead[0].angle.toFixed(1));
```

| | Default | Means |
|---|---|---|
| `by` | `"space"` | `"space"` returns kilometres. `"sky"` returns the angle in degrees. |
| `count` | 5 (`NEAREST_COUNT`) | How many, nearest first. |
| `within` | no limit | Drop anything further: kilometres, or degrees when `by` is `"sky"`. |
| `date` | required | The moment, milliseconds since the Unix epoch. |

- **A place.** `{ place: { lon, lat } }` and `by: "space"` is the slant range. A satellite straight overhead is its height away. `by: "sky"` is the angle from straight up.
- **A direction.** `{ azimuth, elevation, observer }` and `by: "sky"` is the angle from that direction. Azimuth is degrees clockwise from north.
- **Another satellite.** `{ satellite: index }` and `by: "space"` is the distance between them. `by: "sky"` is the angle at `observer`, or at the ground under the target when no observer is given.
- **How sure.** `distance.uncertaintyKm` is 1 km at the elements' epoch and 1 km more for each day they have aged. It is a rough figure of this package, not a published error.
- **How close they come.** `closeApproach(group, a, b, from, to)` samples every 60 seconds (or the step you give, at least 1 second). Two placements a sample. The uncertainty is how much further the samples on either side were.
- **What it costs.** One placement per satellite per call. Measured for one satellite (the ISS, elements of 2026-11-09): 0.15 ms. A catalogue of a few thousand is on the order of a second. Do not call it on a timer.
- **On the globe.** `ringSatellites` on `<chikyu-space>` rings and names the ones you pass, with the same rings as a labelled group. The list is kept. One that is outside the picture is ringed on the first later draw that shows it, and nothing is drawn at rest just to wait for it. `placeSatellite` says which edge it lies beyond (`edge`) and whether it is behind the camera (`behind`), so a page can mark the edge itself. The demo lists the five nearest when you pick a satellite and rings them.
