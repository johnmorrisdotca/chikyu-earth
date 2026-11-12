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
| `constellation-lines="0.16"` | Draw the 88 figures as lines at this strength, 0 to 1. A bare `constellation-lines` is 0.16. The figure the pointer is on (on one of its lines, or inside its outline), or that is clicked or tapped, is at full strength and shows its name. |
| `constellation-names` | Off unless set. Write the name of every figure in view at the middle of the part of it that is on the picture, quieter than the star names, in the page's language, and clear of the star names, the Earth, the Moon, the Sun, the places and satellites named, the places kept clear and each other. Needs hoshi-stars only; `constellation-lines` is not needed. |
| `constellation-culture="japanese"` | The sky culture of the figures: `iau` (the 88 constellations of the IAU, the default), `western`, `japanese` (the 88 by their Japanese names, then the traditional figures such as Subaru, the Pleiades) or `chinese` (the figures and the Twenty-Eight Mansions). The lines, the figure under the pointer, the picked one and its name all follow it. The value is exactly what the page sets: a Japanese page (`lang=ja`) keeps the IAU's figures unless it sets `japanese`. A value that is not a culture is `iau`, with one warning in the console. |
| `keep-clear=".hero h1"` | A CSS selector for the places of the page where the sky's names must not go (see Keep clear below). The property `keepClear` takes the same as a list. |

These are hoshi-stars' own attribute names and mean what hoshi's guide says. The property `skyStyle` is the look of the names, a partial hoshi-stars `LabelStyle` (the font, size, case, ring, leader and the rest); the default is hoshi's, in Michroma, which the element loads (from beside the label, like the name written on the Earth: `setBodyLabelFontUrl` says where) only when the page names no font of its own.

- **The sky is behind the Earth.** Nothing of the sky is drawn over the Earth, the Moon or the Sun, or over the Earth's air: a constellation line stops exactly at the edge (it is cut there, not hidden whole), and a star whose point, ring or name box touches a body has its name and ring left out, and the next star is named instead, so no name hangs on a body. The edge is worked out from the camera, as the ray through each pixel against the body's angular size, so it is right in a ride, where the Earth is a huge arc across the picture, and on the night side, where it does not depend on the brightness of the Earth below. The satellite's own orbit line belongs to the satellites, not the sky, and is not cut. Names never overlap: each tries the right of its star, then the left, above, below, and a name with no free place is left out.
- **Keep clear.** A page that lays its own text over the element tells it where the names must not go: the property `keepClear`, a list of rectangles in the element's CSS pixels (`{ x, y, width, height }`) or of elements of the page, or the attribute `keep-clear` with a CSS selector. A star name whose box touches one of them is left out, and so is a star whose point is in one (the next star is named instead); the picked constellation's name is moved clear of it. The lines are still drawn. The boxes are read when the list changes and when the page or one of the elements is resized or scrolled, never at each frame, so nothing is redrawn at rest; a page that moves its text without resizing it sets the property again.
- **Stacking.** The elements `<chikyu-earth>`, `<chikyu-earth-realistic>` and `<chikyu-space>` are each their own stacking context (`isolation: isolate`), so the names and lines inside never rise above content of the page that is above the element.
- **The page's language.** Names are the IAU spellings in English, or katakana on a Japanese page (the element's `lang`, else the page's); a constellation's name is Latin or Japanese the same way.
- **Hover.** A mouse resting on a figure (on one of its lines, or inside it) lights its lines, and its name fades in (about 150 ms, at once when the reader asks for reduced motion) at the middle of the part of the figure that is on the picture, kept inside the picture and off the Earth, clear of the star names. It fades out when the pointer leaves. `chikyu-constellation-hover` is sent as the hovered figure changes, with `detail` `{ abbreviation, id, name, english, japanese, kind, culture }` (`abbreviation` is the IAU's, `Ori`; `culture` is `iau` unless `constellation-culture` says another), and `null` when the pointer leaves. The hit test runs once a frame at most, when the pointer has moved, and the layer is drawn again only when the hovered figure changes.
- **Pick.** A click, or a tap with a finger, on a figure (its lines or the inside of it) picks it: its lines stay lit and its name stays, until another is picked or it is let go (a click or tap on empty sky or on the Earth, `Escape`, or the property set to `null`). While the element has the focus, `C` picks the next figure in view from the left and `Shift`+`C` the previous. `chikyu-constellation-pick` is sent at each pick of the reader's, with the same `detail`, and `null` when it is let go. The property `constellation` reads the picked figure's abbreviation, and sets one (`el.constellation = "Ori"`) without an event, so a page can show a card for it.
- **Read out.** A pick (a click, a tap, `C`) is announced by a visually hidden polite live region inside the element, with the figure's name in the page's language (`Orion selected`, `オリオン座を選択`); a hover is not, which would be too much to hear. The page's own card for the figure is the page's to announce.
- **Sky cultures.** Each culture's figures are brought in by a dynamic import of their own when the attribute asks for them, so a page that never sets `chinese` never downloads it; until a culture is here none is drawn, never the IAU's in its place. A figure of a culture is known by its `id` (the IAU's abbreviation for a constellation, `Ori`, else a short word: `subaru`, `hokkyokusei`), which is the `abbreviation` of the events and what the property `constellation` takes; the `detail` of the events has `abbreviation`, `id`, `name`, `english`, `japanese`, `kind` (`constellation`, `asterism` or `mansion`) and `culture`. On a Japanese page a traditional figure is named by its reading in kana. Changing the attribute lets a picked figure go.
- **Nothing at rest.** The names and lines are worked out when the picture is drawn (the camera moved, the size changed, a setting changed) and not otherwise. `stats.sky` has `on`, `loaded`, `names`, `figures`, `picked` (the hovered figure, else the picked one), `pick`, `hover`, `constellations` (the names written by `constellation-names`) and `renders`.
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
