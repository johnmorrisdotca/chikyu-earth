// The distance and the route between two places. Pure: no DOM. The great circle is the same unit-vector angle as `trackSteps`
// (src/paint/math.ts). The distance a page should quote is the geodesic on WGS84, Vincenty's inverse formula (Survey Review, 1975).
// A segment that crosses the date line is split with `splitDateLine` from that same file, so a flat drawing does not cross the whole map.
import type { GeoPoint } from "./types.ts";
import { splitDateLine, trackSteps } from "./paint/math.ts";

/**
 * WGS84 equatorial radius, metres (NIMA TR8350.2).
 *
 * @example
 * ```ts
 * import { WGS84_A_M } from "@johnmorrisdotca/chikyu-earth";
 *
 * console.log(WGS84_A_M);
 * ```
 */
export const WGS84_A_M = 6_378_137;
/**
 * WGS84 flattening (NIMA TR8350.2).
 *
 * @example
 * ```ts
 * import { WGS84_F } from "@johnmorrisdotca/chikyu-earth";
 *
 * console.log(WGS84_F.toFixed(12));
 * ```
 */
export const WGS84_F = 1 / 298.257223563;
/**
 * Mean Earth radius, kilometres, the same sphere the city distances use.
 *
 * @example
 * ```ts
 * import { MEAN_RADIUS_KM } from "@johnmorrisdotca/chikyu-earth";
 *
 * console.log(MEAN_RADIUS_KM);
 * ```
 */
export const MEAN_RADIUS_KM = 6371.0088;
/**
 * The speed a flight-time estimate assumes, in kilometres an hour: a jet's cruise, with no wind, climb or holding.
 *
 * @example
 * ```ts
 * import { FLIGHT_SPEED_KM_H } from "@johnmorrisdotca/chikyu-earth";
 *
 * console.log(FLIGHT_SPEED_KM_H);
 * ```
 */
export const FLIGHT_SPEED_KM_H = 900;

const RAD = Math.PI / 180;
const B_M = WGS84_A_M * (1 - WGS84_F);

/**
 * The distance and the bearings between two places.
 *
 * @example
 * ```ts
 * import type { RouteLeg } from "@johnmorrisdotca/chikyu-earth";
 *
 * const none: RouteLeg | null = null;
 * console.log(none);
 * ```
 */
export interface RouteLeg {
  /** Geodesic distance on WGS84, kilometres. The great-circle distance when the geodesic did not converge. */
  kilometres: number;
  /** Great-circle distance on a sphere of {@link MEAN_RADIUS_KM}, kilometres. */
  greatCircleKm: number;
  /** Degrees clockwise from north, 0 to 360, at the start. */
  initialBearing: number;
  /** Degrees clockwise from north, 0 to 360, at the end. */
  finalBearing: number;
  /** Hours at {@link FLIGHT_SPEED_KM_H}. */
  flightHours: number;
  /** The point halfway along the geodesic (or the great circle, when the geodesic did not converge). */
  midpoint: GeoPoint;
  /** False when Vincenty's formula did not converge (nearly antipodal): the distance is then the great circle. */
  exact: boolean;
}

const isPlace = (place: GeoPoint): boolean => Number.isFinite(place.lon) && Number.isFinite(place.lat) && Math.abs(place.lat) <= 90 && Math.abs(place.lon) <= 180;

const wrap360 = (degrees: number): number => ((degrees % 360) + 360) % 360;
const wrap180 = (degrees: number): number => {
  const wrapped = ((((degrees + 180) % 360) + 360) % 360) - 180;
  return wrapped === 0 ? 0 : wrapped;
};
const unit = (place: GeoPoint): [number, number, number] => {
  const lat = place.lat * RAD;
  const lon = place.lon * RAD;
  const c = Math.cos(lat);
  return [c * Math.sin(lon), Math.sin(lat), c * Math.cos(lon)];
};

/**
 * The great-circle distance, kilometres, on a sphere of {@link MEAN_RADIUS_KM}. The same angle `trackSteps` uses between two unit vectors.
 *
 * @param from - The start, degrees.
 * @param to - The end, degrees.
 * @returns The distance, or null when a place is not on the Earth.
 *
 * @example
 * ```ts
 * import { greatCircleKm } from "@johnmorrisdotca/chikyu-earth";
 *
 * console.log(greatCircleKm({ lon: 0, lat: 0 }, { lon: 0, lat: 0 }));
 * ```
 */
export function greatCircleKm(from: GeoPoint, to: GeoPoint): number | null {
  if (!isPlace(from) || !isPlace(to)) return null;
  const u = unit(from);
  const v = unit(to);
  const dot = Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]));
  const cross = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
  return (MEAN_RADIUS_KM * Math.atan2(cross, dot));
}

interface Solved {
  metres: number;
  initial: number;
  final: number;
}

/** Vincenty's inverse: metres and the two bearings, or null when it does not converge. */
function vincentyInverse(from: GeoPoint, to: GeoPoint): Solved | null {
  const u1 = Math.atan((1 - WGS84_F) * Math.tan(from.lat * RAD));
  const u2 = Math.atan((1 - WGS84_F) * Math.tan(to.lat * RAD));
  const sinU1 = Math.sin(u1);
  const cosU1 = Math.cos(u1);
  const sinU2 = Math.sin(u2);
  const cosU2 = Math.cos(u2);
  const L = Math.atan2(Math.sin((to.lon - from.lon) * RAD), Math.cos((to.lon - from.lon) * RAD));
  let lambda = L;
  let sinSigma = 0;
  let cosSigma = 1;
  let sigma = 0;
  let cos2SigmaM = 0;
  let cosSqAlpha = 1;
  for (let i = 0; i < 100; i += 1) {
    const sinLambda = Math.sin(lambda);
    const cosLambda = Math.cos(lambda);
    sinSigma = Math.hypot(cosU2 * sinLambda, cosU1 * sinU2 - sinU1 * cosU2 * cosLambda);
    if (sinSigma === 0) return { metres: 0, initial: 0, final: 0 };
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cosSqAlpha === 0 ? 0 : cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha;
    const C = (WGS84_F / 16) * cosSqAlpha * (4 + WGS84_F * (4 - 3 * cosSqAlpha));
    const next = L + (1 - C) * WGS84_F * sinAlpha * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
    if (Math.abs(next - lambda) < 1e-12) {
      lambda = next;
      const uSq = (cosSqAlpha * (WGS84_A_M * WGS84_A_M - B_M * B_M)) / (B_M * B_M);
      const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
      const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
      const delta =
        B *
        sinSigma *
        (cos2SigmaM +
          (B / 4) * (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) - (B / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
      const metres = B_M * A * (sigma - delta);
      const initial = Math.atan2(cosU2 * Math.sin(lambda), cosU1 * sinU2 - sinU1 * cosU2 * Math.cos(lambda));
      const final = Math.atan2(cosU1 * Math.sin(lambda), -sinU1 * cosU2 + cosU1 * sinU2 * Math.cos(lambda));
      return { metres, initial: wrap360(initial / RAD), final: wrap360(final / RAD) };
    }
    lambda = next;
  }
  return null;
}

/** Vincenty's direct: the place `metres` from `from` on the bearing `bearingDeg`. */
function vincentyDirect(from: GeoPoint, bearingDeg: number, metres: number): GeoPoint {
  if (metres === 0) return { lon: from.lon, lat: from.lat };
  const alpha1 = bearingDeg * RAD;
  const tanU1 = (1 - WGS84_F) * Math.tan(from.lat * RAD);
  const cosU1 = 1 / Math.hypot(1, tanU1);
  const sinU1 = tanU1 * cosU1;
  const sigma1 = Math.atan2(tanU1, Math.cos(alpha1));
  const sinAlpha = cosU1 * Math.sin(alpha1);
  const cosSqAlpha = 1 - sinAlpha * sinAlpha;
  const uSq = (cosSqAlpha * (WGS84_A_M * WGS84_A_M - B_M * B_M)) / (B_M * B_M);
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  let sigma = metres / (B_M * A);
  let cos2SigmaM = 0;
  for (let i = 0; i < 100; i += 1) {
    cos2SigmaM = Math.cos(2 * sigma1 + sigma);
    const sinSigma = Math.sin(sigma);
    const cosSigma = Math.cos(sigma);
    const delta =
      B *
      sinSigma *
      (cos2SigmaM +
        (B / 4) * (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) - (B / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
    const next = metres / (B_M * A) + delta;
    if (Math.abs(next - sigma) < 1e-12) {
      sigma = next;
      break;
    }
    sigma = next;
  }
  const sinSigma = Math.sin(sigma);
  const cosSigma = Math.cos(sigma);
  const lat = Math.atan2(sinU1 * cosSigma + cosU1 * sinSigma * Math.cos(alpha1), (1 - WGS84_F) * Math.hypot(sinAlpha, sinU1 * sinSigma - cosU1 * cosSigma * Math.cos(alpha1)));
  const lambda = Math.atan2(sinSigma * Math.sin(alpha1), cosU1 * cosSigma - sinU1 * sinSigma * Math.cos(alpha1));
  const C = (WGS84_F / 16) * cosSqAlpha * (4 + WGS84_F * (4 - 3 * cosSqAlpha));
  const L = lambda - (1 - C) * WGS84_F * sinAlpha * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
  return { lon: wrap180(from.lon + L / RAD), lat: lat / RAD };
}

/** The place `angle` radians along the great circle that leaves `from` on `bearingDeg`, on a sphere. */
const sphereDirect = (from: GeoPoint, bearingDeg: number, angle: number): GeoPoint => {
  const lat1 = from.lat * RAD;
  const bearing = bearingDeg * RAD;
  const lat = Math.asin(Math.max(-1, Math.min(1, Math.sin(lat1) * Math.cos(angle) + Math.cos(lat1) * Math.sin(angle) * Math.cos(bearing))));
  const lon = from.lon * RAD + Math.atan2(Math.sin(bearing) * Math.sin(angle) * Math.cos(lat1), Math.cos(angle) - Math.sin(lat1) * Math.sin(lat));
  return { lon: wrap180(lon / RAD), lat: lat / RAD };
};

const sphericalBearings = (from: GeoPoint, to: GeoPoint): { initial: number; final: number } => {
  const y1 = Math.sin((to.lon - from.lon) * RAD) * Math.cos(to.lat * RAD);
  const x1 = Math.cos(from.lat * RAD) * Math.sin(to.lat * RAD) - Math.sin(from.lat * RAD) * Math.cos(to.lat * RAD) * Math.cos((to.lon - from.lon) * RAD);
  const y2 = Math.sin((from.lon - to.lon) * RAD) * Math.cos(from.lat * RAD);
  const x2 = Math.cos(to.lat * RAD) * Math.sin(from.lat * RAD) - Math.sin(to.lat * RAD) * Math.cos(from.lat * RAD) * Math.cos((from.lon - to.lon) * RAD);
  return { initial: wrap360(Math.atan2(y1, x1) / RAD), final: wrap360((Math.atan2(y2, x2) / RAD + 180) % 360) };
};

/**
 * Distance, bearings, midpoint and a flight-time estimate between two places. The distance quoted is the WGS84 geodesic.
 * The flight time is that distance at {@link FLIGHT_SPEED_KM_H}, an estimate with no wind.
 *
 * @param from - The start, degrees.
 * @param to - The end, degrees.
 * @returns The leg, or null when a place is not on the Earth.
 *
 * @example
 * ```ts
 * import { routeLeg } from "@johnmorrisdotca/chikyu-earth";
 *
 * const leg = routeLeg({ lon: 0, lat: 0 }, { lon: 1, lat: 0 });
 * console.log(leg?.kilometres.toFixed(3), leg?.initialBearing);
 * ```
 */
export function routeLeg(from: GeoPoint, to: GeoPoint): RouteLeg | null {
  const sphere = greatCircleKm(from, to);
  if (sphere === null) return null;
  const solved = vincentyInverse(from, to);
  const exact = solved !== null;
  const kilometres = exact ? solved.metres / 1000 : sphere;
  const bearings = exact ? { initial: solved.initial, final: solved.final } : sphericalBearings(from, to);
  const midpoint = exact ? vincentyDirect(from, bearings.initial, solved.metres / 2) : trackSteps(from, to, Math.max(sphere / MEAN_RADIUS_KM / RAD / 2, 0.01))[1] ?? from;
  return { kilometres, greatCircleKm: sphere, initialBearing: bearings.initial, finalBearing: bearings.final, flightHours: kilometres / FLIGHT_SPEED_KM_H, midpoint, exact };
}

/**
 * Points along the geodesic from `from` to `to`, including both ends. `count` is how many (2 when they are the same place, 64 when left out).
 * When the geodesic does not converge, the points are the great circle (`trackSteps`).
 *
 * @param from - The start.
 * @param to - The end.
 * @param count - How many points, at least 2.
 * @returns The points, or an empty list when a place is not on the Earth.
 *
 * @example
 * ```ts
 * import { routePoints } from "@johnmorrisdotca/chikyu-earth";
 *
 * console.log(routePoints({ lon: 0, lat: 0 }, { lon: 1, lat: 0 }, 3).length);
 * ```
 */
export function routePoints(from: GeoPoint, to: GeoPoint, count = 64): GeoPoint[] {
  const leg = routeLeg(from, to);
  if (!leg) return [];
  const n = Math.max(2, Math.floor(count));
  if (leg.kilometres === 0) return [from, to];
  if (!leg.exact) {
    // nearly opposite places: the great circle, by the spherical direct problem from the initial bearing, so there are exactly `n` points, evenly spaced
    const angle = leg.greatCircleKm / MEAN_RADIUS_KM;
    return Array.from({ length: n }, (_, i) => (i === 0 ? { lon: from.lon, lat: from.lat } : i === n - 1 ? { lon: to.lon, lat: to.lat } : sphereDirect(from, leg.initialBearing, (angle * i) / (n - 1))));
  }
  const out: GeoPoint[] = [];
  for (let i = 0; i < n; i += 1) out.push(i === n - 1 ? { lon: to.lon, lat: to.lat } : vincentyDirect(from, leg.initialBearing, (leg.kilometres * 1000 * i) / (n - 1)));
  return out;
}

/**
 * The runs of a route after it is split at the date line, so a flat map draws two pieces instead of a line across the world.
 * A run that does not cross is one piece. Uses `splitDateLine`.
 *
 * @param points - Points in order along the route, including the ends.
 * @returns One list of points per piece.
 *
 * @example
 * ```ts
 * import { routeRuns } from "@johnmorrisdotca/chikyu-earth";
 *
 * console.log(routeRuns([{ lon: 179, lat: 0 }, { lon: -179, lat: 0 }]).length);
 * ```
 */
export function routeRuns(points: readonly GeoPoint[]): GeoPoint[][] {
  if (points.length === 0) return [];
  const runs: GeoPoint[][] = [[{ lon: points[0]!.lon, lat: points[0]!.lat }]];
  for (let i = 1; i < points.length; i += 1) {
    const next = points[i]!;
    const parts = splitDateLine(points[i - 1]!, next);
    const run = runs[runs.length - 1]!;
    if (parts.length === 1) run.push({ lon: next.lon, lat: next.lat });
    else {
      run.push(parts[0]![1]!);
      runs.push([parts[1]![0]!, { lon: next.lon, lat: next.lat }]);
    }
  }
  return runs;
}

/**
 * Read the `route` attribute: `lon,lat,lon,lat`. Anything else is no route.
 *
 * @param value - The attribute's text, or null.
 * @returns The two places, or null.
 *
 * @example
 * ```ts
 * import { readRoute } from "@johnmorrisdotca/chikyu-earth";
 *
 * console.log(readRoute("139.69,35.69,-0.13,51.51")?.from.lat);
 * console.log(readRoute("no"));
 * ```
 */
export function readRoute(value: string | null | undefined): { from: GeoPoint; to: GeoPoint } | null {
  if (!value) return null;
  const parts = value.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const route = { from: { lon: parts[0]!, lat: parts[1]! }, to: { lon: parts[2]!, lat: parts[3]! } };
  if (!isPlace(route.from) || !isPlace(route.to)) return null;
  return route;
}

/**
 * The `route` attribute for two places, four decimals.
 *
 * @param route - The two places.
 * @returns `lon,lat,lon,lat`.
 *
 * @example
 * ```ts
 * import { routeText } from "@johnmorrisdotca/chikyu-earth";
 *
 * console.log(routeText({ from: { lon: 1, lat: 2 }, to: { lon: 3, lat: 4 } }));
 * ```
 */
export function routeText(route: { from: GeoPoint; to: GeoPoint }): string {
  const four = (n: number): string => String(Math.round(n * 10_000) / 10_000);
  return `${four(route.from.lon)},${four(route.from.lat)},${four(route.to.lon)},${four(route.to.lat)}`;
}
