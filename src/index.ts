export { globe } from "./globe.ts";
export { FLIGHT_SPEED_KM_H, MEAN_RADIUS_KM, WGS84_A_M, WGS84_F, greatCircleKm, readRoute, routeLeg, routePoints, routeRuns, routeText, type RouteLeg } from "./route.ts";
export { COUNTRIES } from "./countries.ts";
export { cleanStyle, DEFAULT_STYLE, STYLE_NAMES, STYLES, type Style, type StyleName } from "./styles.ts";
export { centreRotation, DEGREES_PER_MS, rotationAt, SIDEREAL_DAY_MS, spinAt } from "./rotate.ts";
export { globeBaseScale, HOME_VIEW, projectionView, type ProjectionView } from "./view.ts";
export type { CountryProps, GeoPoint, GlobeOptions, GlobeView, Rotation } from "./types.ts";

import { COUNTRIES } from "./countries.ts";
import type { CountryProps } from "./types.ts";

/**
 * Every country the globe draws, with its kuni name and code.
 *
 * @returns A list of English name, Japanese name (or `null`) and two-letter code (or `null` where a place has none).
 *
 * @example
 * ```ts
 * import { countryList } from "@johnmorrisdotca/chikyu-earth";
 *
 * console.log(countryList().find((country) => country.alpha2 === "JP"));
 * ```
 */
export const countryList = (): CountryProps[] => COUNTRIES.features.map((f) => f.properties);
