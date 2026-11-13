---
title: "Distance and the route between two places"
section: how-to
order: 20
description: "The great-circle distance and the more accurate distance on the Earth's real shape, the bearings, a flight-time estimate, and the line drawn on the globe."
---

`<chikyu-earth>`, `<chikyu-earth-realistic>` and `<chikyu-space>` can draw the route between two places. The line is off until you set it.

```html
<chikyu-earth route="139.6917,35.6895,-0.1275,51.5072"></chikyu-earth>
```

| Attribute | Property | Means |
|---|---|---|
| `route` | `route` | `lon,lat,lon,lat` for the two places. Absent, or the property `null`, draws nothing. Setting the property writes the attribute. |

- **Two distances.** `routeInfo.kilometres` is the geodesic on WGS84 (Vincenty's formula): the accurate distance on the Earth's real shape. `routeInfo.greatCircleKm` is the great circle on a sphere of radius 6371.0088 km, the same sphere the city distances use. For Tokyo to London the two differ by about 24 km.
- **Bearings.** `initialBearing` and `finalBearing` are degrees clockwise from north, at the start and at the end.
- **A flight time.** `flightHours` is the geodesic distance at 900 km/h (`FLIGHT_SPEED_KM_H`): a jet's cruise, with no wind, climb or holding. It is an estimate.
- **The line.** On the line globe it is a path over the countries, split at the date line so it does not cross the whole map. On the realistic Earth and in the space view it is one line of segments that turns with the Earth, the same kind of line as the grid. It is drawn only when a route is set. Nothing is drawn again at rest.
- **No flat map.** This package's flat drawing is the line globe, which is a view straight down on the sphere, not a flat world map. The date-line split is in `routeRuns`, for a page that draws the route on a flat map of its own.

The same sums are pure, with no page:

```js no-run
import { routeLeg, routePoints } from "@johnmorrisdotca/chikyu-earth";

const tokyo = { lon: 139.6917, lat: 35.6895 };
const london = { lon: -0.1275, lat: 51.5072 };
const leg = routeLeg(tokyo, london);
console.log(leg.kilometres.toFixed(0), leg.flightHours.toFixed(1));
console.log(routePoints(tokyo, london, 8).length);
```
