---
title: "Names on the stars and faint constellation lines"
section: how-to
order: 18
description: "Name the brightest stars and draw the 88 constellations as very faint lines over the sky of the space view or the realistic Earth, with the figure under the pointer at full strength, names that never overlap and stars behind the Earth left out. Off unless asked for; hoshi-stars is loaded only then."
---

`<chikyu-space>` and `<chikyu-earth-realistic>` can lay the names of the brightest stars, and the constellations as very faint lines, over the sky the page draws behind them. It is hoshi-stars' sky labels (`@johnmorrisdotca/hoshi-stars/sky-labels`), an **optional peer** that is loaded only when one of the attributes below is set, so a page that never asks pays nothing. Most of the sky stays free of names and lines: both are off until asked for.

```html
<chikyu-space star-names="12" constellation-lines="0.16" lang="en" style="width: 420px"></chikyu-space>
```

| Attribute | Means |
|---|---|
| `star-names="12"` | Name the 12 brightest stars that are in view and not covered. A bare `star-names` is 10. At most 335, every star that has a name. |
| `star-names-magnitude="1.5"` | Name only stars at least that bright (Sirius is -1.46). With `star-names` too, both limits hold. |
| `constellation-lines="0.16"` | Draw the 88 figures as lines at this strength, 0 to 1. A bare `constellation-lines` is 0.16. The figure the pointer is on (one of its lines or one of its stars), or that is touched, is at full strength and shows its name. |

These are hoshi-stars' own attribute names and mean what hoshi's guide says. The property `skyStyle` is the look of the names, a partial hoshi-stars `LabelStyle` (the font, size, case, ring, leader and the rest); the default is hoshi's, in Michroma, which the element loads (from beside the label, like the name written on the Earth: `setBodyLabelFontUrl` says where) only when the page names no font of its own.

- **The sky is behind the Earth.** Nothing of the sky is drawn over the Earth, the Moon or the Sun, or over the Earth's air: a constellation line stops exactly at the edge (it is cut there, not hidden whole), and a star whose point, ring or name box touches a body has its name and ring left out, and the next star is named instead, so no name hangs on a body. The edge is worked out from the camera, as the ray through each pixel against the body's angular size, so it is right in a ride, where the Earth is a huge arc across the picture, and on the night side, where it does not depend on the brightness of the Earth below. The satellite's own orbit line belongs to the satellites, not the sky, and is not cut. Names never overlap: each tries the right of its star, then the left, above, below, and a name with no free place is left out.
- **Stacking.** The elements `<chikyu-earth>`, `<chikyu-earth-realistic>` and `<chikyu-space>` are each their own stacking context (`isolation: isolate`), so the names and lines inside never rise above content of the page that is above the element.
- **The page's language.** Names are the IAU spellings in English, or katakana on a Japanese page (the element's `lang`, else the page's); a constellation's name is Latin or Japanese the same way.
- **Pointer and touch.** A mouse lights the figure it rests on and lets go when it leaves; a finger lights what it touches and the choice stays until the next touch. Only the layer is drawn again, never the picture.
- **Nothing at rest.** The names and lines are worked out when the picture is drawn (the camera moved, the size changed, a setting changed) and not otherwise. `stats.sky` has `on`, `loaded`, `names`, `figures`, `picked` and `renders`.
- **Where the sky is.** `<chikyu-space>` has no stars of its own: it lays the names where the stars of the page's own sky are, using the picture's camera, so a page that draws its stars behind the view in the family's axes (x to the vernal equinox, y north) finds the names on them. On `<chikyu-earth-realistic>`, whose camera looks straight at the Earth, the sky is the directions seen along the picture's own axes, shown across the box.
- **How many you see.** `star-names="12"` is a most, not a count. The space view opens with the Earth filling 90% of the picture, so only its corners show sky: about two named stars are in view on average, and none in one view out of ten. A smaller Earth (the `earth-size` attribute) or a view turned to a richer part of the sky leaves room for all twelve. On `<chikyu-earth-realistic>`, which shows half the sky across the box, there are always many.
- **Not installed.** Without hoshi-stars (version 0.30 or later) `chikyu-sky-unavailable` is sent with the reason, and nothing is drawn.

## A page without hoshi-stars

hoshi-stars is an optional peer, so a page that has not installed it still type-checks. The look of the names, `skyStyle`, is this package's own type, `SkyLabelStyle`, the same shape as hoshi-stars' `LabelStyle`. Without hoshi-stars `chikyu-sky-unavailable` is sent with the reason, no name is drawn and the picture is as it was.

```ts no-run
import "@johnmorrisdotca/chikyu-earth/space/element";
import type { ChikyuSpace } from "@johnmorrisdotca/chikyu-earth/space/element";
import type { SkyLabelStyle } from "@johnmorrisdotca/chikyu-earth/realistic";

// A page without hoshi-stars installed still type-checks: the look of the names is chikyu-earth's own type.
const space = document.querySelector<ChikyuSpace>("chikyu-space")!;
const look: Partial<SkyLabelStyle> = { size: 12, colour: "#ffe9b0", ring: 0 };
space.skyStyle = look;
space.setAttribute("star-names", "12");

// With no hoshi-stars the element says so and draws no names; the picture is as it was.
space.addEventListener("chikyu-sky-unavailable", (event) => console.log((event as CustomEvent<{ reason: string }>).detail.reason));
```
