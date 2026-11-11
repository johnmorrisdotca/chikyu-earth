---
title: "City names on the Earth"
section: how-to
order: 19
description: "Name cities on the realistic Earth and the space view from kuni's list of cities: the capitals first, the great cities and then the large ones as the Earth grows on the screen, the most populous first, in the page's language, never overlapping and none on the far side. Off unless asked for; kuni is loaded only then."
---

`<chikyu-earth-realistic>` and `<chikyu-space>` can name the cities on the Earth: a small dot where each city is and its name beside it. The cities are kuni's (`@johnmorrisdotca/kuni/cities`), an **optional peer** that is loaded only when `city-names` is set, a tier at a time as the Earth grows on the screen, so a page that never asks pays nothing and a page that asks for the globe at its smallest loads only the capitals.

```html
<chikyu-earth-realistic city-names lang="en" style="width: 420px"></chikyu-earth-realistic>
```

| Attribute | Means |
|---|---|
| `city-names` | Name cities; a bare attribute allows 24 names at once. |
| `city-names="40"` | Name up to 40 at once (1 to 80). Absent, none. |

The names are the most populous first, with a capital of a country counted for 2 million more people (so a small capital is not lost beside a great city), another seat of government for 1 million and the capital of a subdivision for 100,000. A name that would run over another, or off the picture, is left out; the next city is tried instead.

- **More as the Earth grows.** The tiers follow how large the Earth is on the screen (its radius in pixels): from 60 the capitals, from 170 the other cities of a million or more, from 420 the cities of 100,000 or more. Zoom in and each tier is loaded the first time it is needed, and more names find room; zoom out and the larger tiers stop being named. The smallest tier, cities of 15,000 or more, is not used: it is the largest download of kuni's lists and a name for each could not fit.
- **None on the far side.** A city is named only when it faces the viewer, and one that is crowded against the limb (less than about 7 degrees above the horizon) is left out. On the space view the test is the camera's own, so the Moon crossing in front of a city is the one thing that does not hide it.
- **Names never overlap.** Each tries the right of its dot, then the left, above and below, biggest city first, and a name with no free place is left out: the same rule as the names on the markers.
- **The page's language.** English, or Japanese on a page in Japanese (the element's `lang`, else the page's) where kuni has the name; a city with no Japanese name is named in English. kuni's Japanese name is the administrative one (for Tokyo, the name of the prefecture); where kuni gives a short form (`name.jaShort`) that is written instead.
- **The look.** The property `cityNamesStyle` takes any of `font`, `size` (pixels), `weight`, `colour`, `halo` (the outline round the text), `haloWidth`, `dot` (the dot's colour) and `dotSize` (its radius in pixels). They are also the CSS custom properties `--chikyu-city-font`, `--chikyu-city-size` and the rest, which a page may set on the element in CSS.
- **Nothing at rest.** The names are worked out when the picture is drawn (the view moved, the size changed, a setting or the language changed, a tier arrived) and not otherwise; only the layer is drawn again, never the picture. `stats.cityNames` has `on`, `max`, `radius` (the Earth's radius on the screen), `tiers` (the tiers loaded), `cities`, `names` and `renders`.
- **Not installed.** Without kuni (version 1.6.1 or later) `chikyu-city-names-unavailable` is sent with the reason, and no name is drawn.

The pure parts need no browser: `layoutCities`, `cityTiersFor`, `cityRank`, `cityNameText` and `readCityNames` in `@johnmorrisdotca/chikyu-earth/realistic` lay the names out for any view that can say where a place falls on the screen.
