// Draw the globe as one SVG string: an orthographic disc, the country outlines on it, and the rim. Pure: the same
// arguments always give the same markup, so it works on a server, in a test, or in the element.
import { geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import { COUNTRIES } from "./countries.ts";
import { routePoints, routeRuns } from "./route.ts";
import { cleanStyle, STYLES } from "./styles.ts";
import { projectionView } from "./view.ts";
import type { GlobeOptions, Rotation } from "./types.ts";

const SPHERE = { type: "Sphere" } as const;

/**
 * The globe as an SVG string, turned to `rotation` and drawn in `style`, `size` pixels square. It is pure: the same options always give the same markup, so it runs on a server, in a test or in a build step with no DOM.
 *
 * @param options - Size, turn, look and graticule; every one has a default, so `globe()` draws a 320-pixel globe facing the Greenwich meridian.
 * @returns One `<svg>` element as text, with the country outlines as paths.
 *
 * @example
 * ```ts
 * import { globe } from "@johnmorrisdotca/chikyu-earth";
 *
 * const svg = globe({ size: 240, rotation: [-139.7, -35.7], style: "line" });
 * console.log(svg.slice(0, 60));
 * console.log(svg.length > 10_000);
 * ```
 */
export function globe(options: GlobeOptions = {}): string {
  const size = options.size ?? 320;
  const style = STYLES[cleanStyle(options.style)];
  const view = options.view
    ? projectionView(options.centre ?? { lon: 0, lat: 0 }, size, options.view)
    : { rotation: (options.rotation ?? [0, 0]) as Rotation, scale: size / 2 - 1, translate: [size / 2, size / 2] as [number, number] };
  const projection = geoOrthographic()
    .rotate(view.rotation)
    .translate(view.translate)
    .scale(view.scale)
    .precision(0.5);
  const path = geoPath(projection);
  const horizon = path(SPHERE) ?? "";

  const parts: string[] = [];
  parts.push(`<path d="${horizon}" fill="${style.ocean}"/>`);
  if (options.graticule) {
    const d = path(geoGraticule10());
    if (d) parts.push(`<path d="${d}" fill="none" stroke="${style.line}" stroke-width="${style.graticule}" stroke-opacity="0.35"/>`);
  }
  for (const feature of COUNTRIES.features) {
    const d = path(feature);
    if (d) parts.push(`<path d="${d}" fill="${style.land}" stroke="${style.line}" stroke-width="${style.outline}" stroke-linejoin="round"/>`);
  }
  if (options.route) {
    const runs = routeRuns(routePoints(options.route.from, options.route.to));
    const d = path({ type: "MultiLineString", coordinates: runs.map((run) => run.map((place) => [place.lon, place.lat])) });
    if (d) parts.push(`<path d="${d}" fill="none" stroke="#7df9ff" stroke-width="1.5" stroke-linejoin="round"/>`);
  }
  parts.push(`<path d="${horizon}" fill="none" stroke="${style.line}" stroke-width="${style.horizon}"/>`);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" ` +
    `role="img" aria-label="The Earth, a globe of country outlines" stroke-linecap="round">${parts.join("")}</svg>`
  );
}
