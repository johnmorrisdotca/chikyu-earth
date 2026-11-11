---
title: Full screen, the camera in the stars and every satellite
section: how-to
order: 9
description: Fill the window with the realistic Earth, hold the camera in the stars so the Earth turns beneath it with the day and night line where the Sun puts it, and show every satellite group at once inside the frame budget.
---

`<chikyu-earth-realistic>` is the Earth from space. This guide is three things a page that wants it to fill the window needs: the full-screen mode, the choice of how the camera is held, and the satellites drawn on it. All three are optional and cost nothing until you use them. The demo's `fullscreen.html` is the whole of it in 150 lines (`demo/fullscreen.ts`).

## Full screen: `immersive`

```html
<style>
  chikyu-earth-realistic { position: fixed; inset: 0; width: 100%; height: 100%; }
  body { margin: 0; background: #04060c; }
</style>
<chikyu-earth-realistic immersive camera="space" texture-base="/textures/"></chikyu-earth-realistic>
```

- The element fills its box in any shape. The Earth fits the shorter side with its glow inside it, so the glow is never cut at Fit, on a wide desk or a narrow phone.
- A plain wheel zooms, and does not scroll the page. A drag anywhere on the element turns the view, and on a touch screen a one-finger drag turns it instead of scrolling. Ctrl or Command (or Alt) and the wheel, a pinch, the keys and the other hands are kazoku-ui's, as everywhere: the wheel's pan is the one hand `immersive` trades away.
- Without `immersive` nothing changes: the element is a square, a plain wheel at Fit scrolls the page, and a drag turns it inside its square.
- Put a `<kazoku-view-controls for="...">` on it for the bar, and apply the bar's `kazoku-viewchange` with `setView`, as the demo does. The wheel's zoom goes to whichever hands hold the view, so the bar's limits and readout agree.

The page keeps the family's other rules: the clock opens running from now (`speed="3600"`, an hour a second), a reader who prefers reduced motion gets a still view with Play ready, and the time the page shows is the device's own.

## The camera: `space` (the default), `ground` or `sun`

The `camera` attribute (and property) says how the camera is held. `center` is where it looks.

| `camera` | The camera is held | What you see |
|---|---|---|
| `space` (the default) | in the stars, looking at `center` as it is when the camera is set | the Earth turns beneath the camera as the clock runs, 360 degrees in 23 hours 56 minutes; the day and night line is where the Sun really is, and moves a degree a day |
| `ground` | over the place `center` names on the ground | the Earth keeps still; the clock moves the light and the night side across it |
| `sun` | on the Sun's side: `center` is the longitude and latitude from the place the Sun is overhead (`0,0` is straight at noon) | the day and night line stays where it is on the screen while the Earth turns beneath it |

The camera in the stars is set when the element opens, and again when `time` or `center` is set: a page that jumps to another date looks at `center` as it is at that date. A drag turns the view from where the camera is held; Centre puts it back.

```ts no-run
import "@johnmorrisdotca/chikyu-earth/realistic/element";
import type { ChikyuEarthRealistic } from "@johnmorrisdotca/chikyu-earth/realistic/element";

const earth = document.querySelector<ChikyuEarthRealistic>("chikyu-earth-realistic")!;
earth.setAttribute("center", "139.7,35.7");
earth.camera = "space";
earth.speed = 3600;
console.log(earth.camera);
```

`cameraCentre` and `greenwichSidereal` (from `@johnmorrisdotca/chikyu-earth/realistic`) are the pure sums behind it: the angle the Earth has turned against the stars at a moment, and the place the camera looks at.

The light reads the real Sun and the real moment in every mode: only the camera moves. The clouds are one snapshot, not a forecast, so they stay where the picture has them and turn with the Earth; `cloud-drift="1.5"` makes them slide east by that many degrees an hour, for life, and says nothing about the weather.

`<chikyu-space>` takes the same `camera` (it was always the ground before 0.24), and `earth-size` (the share of the shorter side the Earth's disc fills at Fit, 0.9 by default so the glow is never cut), `earth-x` and `earth-y` (where the Earth's centre is in the view, 0.5 and 0.5 in the middle). Both elements fill their box in any shape, so the demo's panel, Wide and the embed frame draw edge to edge, with no square inside.

## How the Earth looks

The realistic Earth is shaded from the NASA pictures the package already carries (Blue Marble, Black Marble, the cloud map, the water mask; see `NOTICE.md`), with no new data:

- **The air.** Light scattered once on its way through a shell 100 km thick, worked out for each pixel in the shader, on the realistic Earth and in the space view alike. Rayleigh scattering gives the blue haze that thickens towards the limb on the day side; Mie scattering gives the glow towards the Sun; the Sun's light has crossed a long, low path along the day and night line, so a reddened band lies there; and from the night side, looking towards the Sun, a thin lit ring shows round the dark Earth. None of it is drawn: it is what the sums give. The surface under it is dimmed by what the air takes out of the light. `air="full"` takes 12 samples along the ray and 4 towards the Sun at each; `air="light"`, the default on a small or slow device (4 cores or fewer, 4 GB of memory or less, or a touch screen with no mouse), takes 6 and 2. The samples are packed where the air is thick, so both are free of bands. It costs nothing at rest: nothing is drawn while the clock holds, and never more than 30 frames a second. **Drawn thicker so that it can be seen.** The real shell is 100 km thick on a globe 12,742 km across, which at whole-Earth zoom is a line a pixel or two wide, and thinner still on a phone. So the elements draw it 3 times thicker unless a page says otherwise: `air-thickness="3"` is the default, `air-thickness="1"` is the true thickness, and any number from 1 to 5 is allowed. Only the height changes: the same air is spread over the thicker shell, so it scatters the same light in the same colours, and the glow at the limb is three times as wide. While it is above 1 each element says so in a line under the picture, "The air is drawn 3 times its real thickness so it can be seen." (`air-label="off"` takes the line away, for a page that writes it itself, as the demo's full-screen page does). In the demo, True air thickness draws it as it is.
- **The terminator.** The Sun reddens as it gets low, with a warm band on the lit side and a blue hour beyond the line.
- **The ocean.** A clearer blue, with a hard glint under the Sun, a broad sheen round it, and the sky reflected at grazing angles; cloud hides the glint.
- **The clouds** throw a shadow on the ground, longer as the Sun gets low.
- **The night.** City lights are warm and softly spread, and cloud dims them.

`light="lit"` and `light="boost"` work as before.

## Every satellite group at once

The realistic Earth draws satellites as the space view does, with the same calls: make a group with `createSatellites` from the elements your page fetched (see the satellites guide for where they come from), and pass it to `setSatellites`.

```ts no-run
import { createSatellites } from "@johnmorrisdotca/chikyu-earth/satellites";
import type { ChikyuEarthRealistic } from "@johnmorrisdotca/chikyu-earth/realistic/element";

const earth = document.querySelector<ChikyuEarthRealistic>("chikyu-earth-realistic")!;
const sets = await fetch("elements/starlink.json").then((response) => response.json());
earth.setSatellites("starlink", createSatellites(sets), { color: "#7fd4ff", size: 2.5 });
earth.addEventListener("chikyu-satellite-click", (event) => {
  console.log((event as CustomEvent).detail.info?.name);
});
```

- **One draw call a group**, however many satellites it holds, so every group of the catalogue can be on at once (the demo's "All satellites": about 4,000 satellites in 14 groups).
- **The frame budget.** Never more than 30 draws a second (fewer on a small device or a low battery), SGP4 about once a second of the clock with the places between interpolated, nothing drawn while the clock holds or the element is out of sight, and one WebGL context for the page. The groups are hidden while the clock runs faster than `MAX_SATELLITE_SPEED`, when they would only blur. `element.stats.satellites` says how many were placed and how long a draw spent on them.
- **Behind the Earth.** A satellite behind the Earth is hidden by it, and cannot be pressed.
- `showSatellites(group, on)`, `satelliteGroups`, `selectSatellite(ref)` (a ring round it and its orbit), `selectedSatellite` and `satelliteInfo(ref)` are the space view's, and so is the event `chikyu-satellite-click`.
- Elements go stale, as the satellites guide says: the ones more than 14 days from the moment shown are dimmer.
- `three` must hand over `Points` (the demo's `three-subset.ts` lists the parts).

The demo's Satellites row is on the realistic look too, and the page `fullscreen.html?sats=all` shows every group on the full-screen dark view.
