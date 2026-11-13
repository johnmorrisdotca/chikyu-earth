---
title: "A beam from a satellite to the ground"
section: how-to
order: 22
description: "Draw a soft beam of light from the chosen satellite down to the ground below it in the space view: a cone ending in a lit footprint, true to the satellite's height, with optional spot cells inside it, in a ride as well."
---

`<chikyu-space>` can draw a beam of light from the chosen satellite down to the ground below it. It is off until you ask for it. The chosen satellite is the one marked with `selectSatellite` (or a press on it), or the one you are riding.

```html
<chikyu-space look="space" beam beam-cells="19" style="width: 420px"></chikyu-space>
```

```ts no-run
import type { ChikyuSpace } from "@johnmorrisdotca/chikyu-earth/space/element";

const space = document.querySelector<ChikyuSpace>("chikyu-space")!;
space.selectSatellite({ group: "stations", index: 0 });
space.beam = true;
console.log(space.stats.beam.radiusKm);
```

| Attribute | Property | Means |
|---|---|---|
| `beam` | `beam` | The beam for the chosen satellite. Absent (or `beam="off"`), none. A bare attribute or `beam="selected"` is on. |
| `beam-elevation` | `beamElevation` | The least elevation, in degrees, from which the satellite counts as seen: 25 when left out, from 0 to 80. |
| `beam-cells` | `beamCells` | How many spot cells are drawn inside the footprint: none when left out, up to 91. |
| `beam-cell-size` | `beamCellSize` | A cell's radius on the ground in kilometres, at most what fits: 0 (the fit) when left out. |
| `beam-color` | `beamColor` | The beam's colour, any CSS colour: a pale blue when left out. |
| `beam-strength` | `beamStrength` | How strong the beam is, from 0 to 1: 0.6 when left out. |

## What is drawn

- **The cone.** A soft, translucent cone from the satellite to the ground, brighter at the satellite and fading towards the ground, added to the picture (it lights the night side and the day side alike). The limb of the Earth cuts it off, as it cuts everything behind the Earth.
- **The footprint.** A lit ring on the surface with a faint fill. It is the circle from which the satellite stands above the elevation you set (25 degrees unless you say), worked from its height at the moment shown: the angle at the Earth's centre is `acos(R cos(e) / (R + h)) - e`. That is the real size: about 750 km in radius for the ISS, 940 km for a Starlink satellite, 6,350 km for a geostationary one. `footprintAngle` and `footprintKm` give the same numbers on their own.
- **The cells.** With `beam-cells` the footprint holds that many spot cells, a hexagonal pack of rings, each with a thin shaft of light from the satellite. They are **an illustration**: the cells of a satellite that serves the ground in cells, drawn to fit inside the footprint. They are not the beam plan of any operator, and their count and size are only what your page asks for.

## In a ride

In Ride along and Ride above the beam is the one of the satellite you are riding. From the satellite you look down the cone, and the footprint lies on the ground below. Near the camera the cone fades out, so it does not blind.

## What the page can read

`stats.beam` says whether the beam was drawn at the last draw (`shown`), the satellite's height (`heightKm`), the footprint's radius along the ground (`radiusKm`) and its angle at the Earth's centre (`angleDegrees`), the elevation worked for, the cells drawn (`cells`) and a cell's radius in kilometres (`cellRadiusKm`), how many times its geometry was made (`builds`), and whether it could not be made (`failed`; the element sends `chikyu-beam-unavailable` too, when the three.js handed over has no `AdditiveBlending`).

## The budget

The beam is part of the draw that moves the satellite: nothing is drawn at rest, and nothing is drawn when the clock is held. Its shapes are made once (again only when the number of cells changes) and worked out on the graphics card from a few numbers, so a step of the clock changes numbers and rebuilds nothing. There is no shimmer: a reader who asked for reduced motion sees the same still beam.
