---
title: "A name on the Earth"
section: how-to
order: 17
description: "Write the Earth's name on the globe so it turns with it, the surface showing through the letters, in the family's plain attribute names. Off unless a page asks."
---

`<chikyu-earth-realistic>` and `<chikyu-space>` can write the Earth's name on the globe itself, as a film puts a large title over the thing it names: the letters lie on the surface and turn with the Earth, and the surface shows through them. It is the family's shared label (`@johnmorrisdotca/kazoku-ui/body-label`, the same one wakusei-planets draws on its bodies), so the look is the same across the family: **Michroma, painted, at half strength, the name once, turning with the Earth, on the equator**.

```html
<chikyu-earth-realistic body-label center="139.69,35.68" camera="ground" style="width: 420px"></chikyu-earth-realistic>
<chikyu-earth-realistic body-label="etched" body-label-strength="0.8" body-label-repeat="both" lang="ja" style="width: 420px"></chikyu-earth-realistic>
```

## The attributes

| Attribute | Value |
|---|---|
| `body-label` | `painted`, `etched`, `outline` or `burned`: the look. Present with another value or none, `painted`. Absent: no name. |
| `body-label-strength` | 0 to 1 (0.5) |
| `body-label-repeat` | `once`, `both` (two, on opposite sides, so one is always in view) or `around` |
| `body-label-latitude` | degrees: 0 is the equator, 55 a band near a pole |
| `body-label-facing` | present: the name keeps facing the reader while the Earth turns under it |
| `body-label-font` | a CSS font family the page has loaded; Michroma, fetched once, when left out |
| `body-label-fallback-font` | the family for letters the font has none of, such as Japanese |

The property is `bodyLabel`: an object with the same options (`{ look, strength, repeat, latitude, facing, font, fallbackFont }`) or `null`, and setting it writes the attributes. The text is the Earth's own name in capitals, `EARTH`, or `地球` on a Japanese page (the element's `lang`, else the page's).

- **Off unless asked for.** Nothing of the label is fetched or made until `body-label` is first set: the family's label is loaded then, and Michroma (64 kB, SIL Open Font License) only when no font of the page's own is named.
- **Hidden while small.** There is no name while the Earth is drawn under 24 pixels in radius, and none while a ride along a body hides the Earth.
- **Nothing at rest.** The name is part of the picture; it costs a draw only when it is switched on, changed, hidden or shown, or turned to face the reader.
- **A three.js handed over** with `setThreeLoader` must include `CanvasTexture`, `SphereGeometry`, `MeshLambertMaterial`, `SRGBColorSpace`, `NormalBlending` and `AdditiveBlending`; without them `chikyu-body-label-unavailable` is sent and the name is not drawn. `stats.bodyLabel` has `on`, `text`, `made` and `showing`.

## The settings by themselves

The attributes' meaning is pure, and can be used on its own:

```js
import { BODY_LABEL_ATTRIBUTES, bodyLabelText, readBodyLabel } from "@johnmorrisdotca/chikyu-earth/realistic";

// The family's plain attributes: absent, no name; present, the family's own default (painted, half strength, once, on the equator).
const none = readBodyLabel(() => null);
const plain = readBodyLabel((name) => (name === "body-label" ? "" : null));
console.log(none, JSON.stringify(plain));

// A page's own choices, and the name in its language.
const mine = { "body-label": "etched", "body-label-strength": "0.8", "body-label-repeat": "both", "body-label-latitude": "55" };
console.log(JSON.stringify(readBodyLabel((name) => mine[name] ?? null)));
console.log(bodyLabelText("en"), bodyLabelText("ja"), BODY_LABEL_ATTRIBUTES.length);
```
