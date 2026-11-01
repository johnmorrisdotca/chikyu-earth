import type { StyleName } from "./styles.ts";

/** What one country's outline carries: its English and Japanese name and its ISO alpha-2 code, all from kuni. */
export interface CountryProps {
  /** English name, from kuni (Natural Earth's own name where kuni has no entry). */
  name: string;
  /** Japanese name, from kuni, or null. */
  ja: string | null;
  /** ISO 3166-1 alpha-2 code, from kuni, or null where there is no code. */
  alpha2: string | null;
}

/** A point on the globe, in degrees. */
export interface GeoPoint {
  lon: number;
  lat: number;
}

/** How the globe is turned: [lambda, phi] in degrees, the pair d3-geo's `rotate` takes. */
export type Rotation = [lambda: number, phi: number];

/** What `globe()` may be asked. */
export interface GlobeOptions {
  /** Width and height of the square SVG, in pixels. Default 320. */
  size?: number;
  /** The turn, as [lambda, phi]. Default [0, 0]: the Greenwich meridian facing you, on the equator. */
  rotation?: Rotation;
  /** "line" (the default) or "thick". */
  style?: StyleName;
  /** Draw a light graticule under the countries. Default false. */
  graticule?: boolean;
}
