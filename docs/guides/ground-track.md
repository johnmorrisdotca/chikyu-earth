---
title: One satellite on a small flat map
section: how-to
order: 11
description: A small flat world map of one satellite, with its present point, the next orbit's ground track split at the date line, and the night side. The land is chizu's. No WebGL.
---

`<chikyu-track>` draws one satellite on a flat world map: the point under it now, its ground track for one orbit (the part just flown and the part still to come, in two tones, split where the track crosses the date line), and the night side at the time you give. The land and the sea are [chizu](https://github.com/johnmorrisdotca/chizu)'s world map. This package works out the latitudes and longitudes and hands them to chizu. There is no WebGL.

The numbers are their own entry point, with no map and no browser: `trackPicture` and `nightSide`.

## Install

```sh
npm install @johnmorrisdotca/chikyu-earth satellite.js
```

chizu is already a dependency of this package. `satellite.js` (MIT, version 6) is an optional peer, as for the passes. Only the element and `trackPicture` need it. `nightSide` does not.

## The numbers

```js
import { nightSide, trackPicture } from "@johnmorrisdotca/chikyu-earth/track";

const iss = {
  OBJECT_NAME: "ISS (ZARYA)",
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
const noon = Date.UTC(2026, 10, 3, 12);
const picture = trackPicture(iss, noon, 90);
const mark = picture.some((item) => item.kind === "mark");
const night = nightSide(noon).length > 3;
console.log(`${mark ? "mark" : "none"} ${night ? "night" : "day"}`);
```

`trackPicture` returns the night ring, then one line for each run of the track (a run ends at the date line), then the mark. A line's `part` is `past` or `coming`. Longitudes of the night ring run on, so a fill does not wrap the wrong way across the map. The window is `span` minutes centred on the moment; leave it out and the window is one orbit.

## The element

```html
<script type="module">
  import "@johnmorrisdotca/chikyu-earth/track/define";
  const track = document.querySelector("chikyu-track");
  track.satellite = iss;
</script>
<chikyu-track span="90" theme="dark"></chikyu-track>
```

Import `@johnmorrisdotca/chikyu-earth/track/define` to register the tag. `time` is `now` (the default) or an ISO date. A live clock is drawn every ten seconds, and only while the element is on screen and the tab is visible. `satellite` on the element is the catalogue number; the elements themselves go to the `satellite` property. `span` is the window in minutes. `theme` is `light` or `dark`.

The map is 240 pixels wide, land and sea only, with no country names. A page that never imports this entry does not load it.
