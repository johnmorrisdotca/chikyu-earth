import type { StyleName } from "./styles.ts";

/**
 * What one country's outline carries: its English and Japanese name and its ISO alpha-2 code, all from kuni.
 *
 * @example
 * ```ts
 * import { countryList, type CountryProps } from "@johnmorrisdotca/chikyu-earth";
 *
 * const first: CountryProps | undefined = countryList()[0];
 * console.log(first?.name, first?.alpha2);
 * ```
 */
export interface CountryProps {
  /** English name, from kuni (Natural Earth's own name where kuni has no entry). */
  name: string;
  /** Japanese name, from kuni, or null. */
  ja: string | null;
  /** ISO 3166-1 alpha-2 code, from kuni, or null where there is no code. */
  alpha2: string | null;
}

/**
 * What a shared view controller tells the globe: its turn (`yaw`, degrees), tip (`tilt`, degrees), zoom (1 is Fit) and pan (`panX` and `panY`, CSS pixels).
 *
 * @example
 * ```ts
 * import { HOME_VIEW, type GlobeView } from "@johnmorrisdotca/chikyu-earth";
 *
 * const turned: GlobeView = { ...HOME_VIEW, yaw: 30 };
 * console.log(turned);
 * ```
 */
export interface GlobeView {
  yaw: number;
  tilt: number;
  zoom: number;
  panX: number;
  panY: number;
}

/**
 * A point on the globe, in degrees: `lon` from -180 to 180 (east is positive), `lat` from -90 to 90 (north is positive).
 *
 * @example
 * ```ts
 * import type { GeoPoint } from "@johnmorrisdotca/chikyu-earth";
 *
 * const tokyo: GeoPoint = { lon: 139.7, lat: 35.7 };
 * console.log(tokyo);
 * ```
 */
export interface GeoPoint {
  lon: number;
  lat: number;
}

/**
 * How the globe is turned: [lambda, phi] in degrees, the pair d3-geo's `rotate` takes.
 *
 * @example
 * ```ts
 * import { globe, type Rotation } from "@johnmorrisdotca/chikyu-earth";
 *
 * const rotation: Rotation = [-10, -30];
 * console.log(globe({ rotation, size: 100 }).length > 1000);
 * ```
 */
export type Rotation = [lambda: number, phi: number];

/**
 * What `globe()` may be asked.
 *
 * @example
 * ```ts
 * import { globe, type GlobeOptions } from "@johnmorrisdotca/chikyu-earth";
 *
 * const options: GlobeOptions = { size: 200, style: "thick", graticule: true, centre: { lon: 10, lat: 30 } };
 * console.log(globe(options).startsWith("<svg"));
 * ```
 */
export interface GlobeOptions {
  /** Width and height of the square SVG, in pixels. Default 320. */
  size?: number;
  /** The turn, as [lambda, phi]. Default [0, 0]: the Greenwich meridian facing you, on the equator. */
  rotation?: Rotation;
  /** A home centre and shared view state. When `view` is given it takes precedence over `rotation`. */
  centre?: GeoPoint;
  view?: GlobeView;
  /** "line" (the default) or "thick". */
  style?: StyleName;
  /** Draw a light graticule under the countries. Default false. */
  graticule?: boolean;
  /** A route between two places, drawn over the countries. Absent, none. */
  route?: { from: GeoPoint; to: GeoPoint } | null;
}
