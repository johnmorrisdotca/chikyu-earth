---
title: Zoom, pan and turn
section: how-to
order: 13
description: "Every live view in the package zooms, pans and turns by itself, with no bar and no wiring: the gestures, the zoom range of each element and why it stops where it does, and how to turn the hands off or add buttons."
---

A reader who drops `<chikyu-earth>`, `<chikyu-earth-realistic>` or `<chikyu-space>` on a page expects to be able to move the picture. They do, with nothing else on the page. Each element carries [kazoku-ui's view controls](https://github.com/johnmorrisdotca/kazoku-ui) itself (the shared `carryControls`), so the same hands work in a script tag, a framework, the code builder and an iframe.

## What the hands do

- **Drag.** At Fit a drag turns the globe or the view; once zoomed, it moves the picture. Two fingers pinch, move and twist. A double tap goes to 2 times and back.
- **The wheel.** At Fit the plain wheel scrolls the page, so the picture is never a trap. Ctrl (or Command, or Alt) and the wheel zoom about the pointer, as a pinch on a trackpad does; once zoomed, the plain wheel moves the picture.
- **Keys.** The element takes focus (it gets `tabindex="0"` unless you gave it one). The arrow keys turn, `+` and `-` zoom, `0` and Home put it back at Fit.
- **Nothing starts by itself.** There is no automatic turn unless the page starts one (`element.controller.play()`), so reduced motion has nothing to hold back.

```html
<chikyu-earth center="139.7,35.7" look="thick" size="320"></chikyu-earth>
<chikyu-earth-realistic center="139.7,35.7" texture-base="/textures/" controls="none"></chikyu-earth-realistic>
```

The first globe zooms and turns. The second has `controls="none"`, which takes the hands off (it is watched, so it can be changed at run time). `element.controller` is the controller behind the hands, for `set`, `fit`, `play` and `state`.

## The zoom range, and why each element stops where it does

Zoom draws no more pixels: the canvas is a fixed size, inside the renderer's cap of 4096 pixels a side and 6 million pixels, and zooming only scales what is drawn. So the floor is a tenth of Fit everywhere there is room round the picture (the whole subject small in the view), and the ceiling is where the picture's detail runs out.

| Element | Range | Why |
| --- | --- | --- |
| `<chikyu-earth>` (line, thick) | 0.1 to 20 times | The outlines are Natural Earth 1:110m and are redrawn at each zoom, so they stay sharp. At 20 times the view is about 640 km across, and a coast is a few straight segments of tens of kilometres: there is nothing finer to show. |
| `<chikyu-earth-realistic>` | 0.1 to 5 times | The package's own pictures are 4096 pixels across at most, sharp to about 3 times and still good to 5. |
| `<chikyu-earth-realistic tiles="...">` | 0.1 to 40 times, once the tile set is found | The finest tile level is 32768 pixels across, 8 times the widest picture (a set that stops at level 4, 16384 across, gives 20). If the tiles are not found it stays at 5. See [the tiles guide](earth-tiles.md). |
| `<chikyu-space>` | one millionth to 2.5 times | The zoom is the camera's distance, so the whole solar system takes a millionth of Fit and the planets and their distances are all in reach. Close in, 2.5 times is as far as the Earth's 4096 pixel picture and the bodies' textures stay sharp. |
| `<chikyu-space>` riding from a body | 0.5 to 40 times | The camera is at the body; zoom only narrows or widens its field a little. Wider than half is a fish-eye, and past 6 times the Earth's pictures blur (a ride from a satellite goes to 40 times, 1.5 degrees of the ground below it: `ride-zoom`). The range is back to the one above when the ride stops. |

All of them tilt to either pole (`tilt-max` 90). A page changes a range with `zoom-min` and `zoom-max` on the element (they win over the element's own, and over a range the element sets while it works), and `tilt-max` and `roll-max` the same way:

```html
<chikyu-earth zoom-min="1" zoom-max="5"></chikyu-earth>
```

## With a bar

A page that wants buttons, a slider, Auto-turn and the address adds `<kazoku-view-controls for="earth">` for the element. The bar takes the hands over while it is there (the element's own stand down, so a drag is never handled twice), reads the element's range, and the page applies the bar's events as before. Give the element an `id` and a `tabindex` so the keys have somewhere to go:

```html
<chikyu-earth id="earth" size="420" tabindex="0"></chikyu-earth>
<kazoku-view-controls for="earth" address grab-radius="fit" controls="advanced" tilt-max="90"></kazoku-view-controls>
```

```js no-run
const earth = document.querySelector("chikyu-earth");
document.querySelector("kazoku-view-controls").addEventListener("kazoku-viewchange", (event) => {
  earth.setView(event.detail, event.detail.final, event.detail.reason !== "auto");
});
```

## Needs kazoku-ui

The elements now import kazoku-ui's `view-controls`, so `@johnmorrisdotca/kazoku-ui` is a dependency of the package (it was an optional peer). The flat globe's script is a little bigger for it, about the controller's size.
