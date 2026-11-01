export { globe } from "./globe.ts";
export { COUNTRIES } from "./data/countries.ts";
export { cleanStyle, DEFAULT_STYLE, STYLE_NAMES, STYLES, type Style, type StyleName } from "./styles.ts";
export { centreRotation, DEGREES_PER_MS, rotationAt, SIDEREAL_DAY_MS, spinAt } from "./rotate.ts";
export type { CountryProps, GeoPoint, GlobeOptions, Rotation } from "./types.ts";

import { COUNTRIES } from "./data/countries.ts";
import type { CountryProps } from "./types.ts";

/** Every country the globe draws, with its kuni name and code. */
export const countryList = (): CountryProps[] => COUNTRIES.features.map((f) => f.properties);
