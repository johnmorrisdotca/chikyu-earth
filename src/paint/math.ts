// Pure geometry for a satellite's painted ground track: the point under it, the date line, and the circle where it stands 10° up.
import { greenwichSidereal } from "../realistic/sun.ts";

const RAD = Math.PI / 180;
/** Mean Earth radius, kilometres, the same unit the satellite positions use. */
export const PAINT_EARTH_KM = 6371;
/** The painted texture: equirectangular, north at the first row, longitude −180 at the first column. */
export const PAINT_W = 1024;
export const PAINT_H = 512;

export interface LonLat {
  lon: number;
  lat: number;
}

/** Earth-central angle, in radians, where a satellite `heightKm` up is at least `elevationDeg` above the horizon (10 when left out). 0 when it never is. */
export function coverageAngleRad(heightKm: number, elevationDeg = 10): number {
  const r = PAINT_EARTH_KM + heightKm;
  if (!(r > PAINT_EARTH_KM)) return 0;
  const elevation = elevationDeg * RAD;
  const cosAlpha = (PAINT_EARTH_KM / r) * Math.cos(elevation);
  if (!(cosAlpha < 1)) return 0;
  const alpha = Math.acos(Math.max(-1, cosAlpha));
  return Math.max(0, alpha - elevation);
}

/** A unit vector for a longitude and latitude, in the Earth's own axes (+z at longitude 0, +x east, +y north). */
const unitOf = (point: LonLat): [number, number, number] => {
  const lon = point.lon * RAD;
  const lat = point.lat * RAD;
  const c = Math.cos(lat);
  return [c * Math.sin(lon), Math.sin(lat), c * Math.cos(lon)];
};

const fromUnit = (x: number, y: number, z: number): LonLat => {
  const length = Math.hypot(x, y, z) || 1;
  return { lon: Math.atan2(x, z) / RAD, lat: Math.asin(Math.max(-1, Math.min(1, y / length))) / RAD };
};

/** The ground under a satellite. `x, y, z` are what `Satellites.exact` writes (Earth radii, x to the vernal equinox, y north). `ms` turns the Earth under that place. */
export function groundUnder(x: number, y: number, z: number, ms: number): LonLat & { heightKm: number } {
  const theta = greenwichSidereal(ms) * RAD;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const temeX = x;
  const temeY = -z;
  const temeZ = y;
  const east = -temeX * sin + temeY * cos;
  const north = temeZ;
  const prime = temeX * cos + temeY * sin;
  const ground = fromUnit(east, north, prime);
  return { ...ground, heightKm: (Math.hypot(x, y, z) - 1) * PAINT_EARTH_KM };
}

/** Points from `a` to `b` along the great circle, about `stepDeg` apart, including both ends. A fast clock stays a continuous line, and a pole or the date line is many short steps. */
export function trackSteps(a: LonLat, b: LonLat, stepDeg: number): LonLat[] {
  const u = unitOf(a);
  const v = unitOf(b);
  const dot = Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]));
  const angle = Math.acos(dot);
  const step = Math.max(0.25, stepDeg) * RAD;
  if (!(angle > step)) return [a, b];
  const count = Math.ceil(angle / step);
  const sin = Math.sin(angle) || 1;
  const out: LonLat[] = [];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    const left = Math.sin((1 - t) * angle) / sin;
    const right = Math.sin(t * angle) / sin;
    out.push(fromUnit(u[0] * left + v[0] * right, u[1] * left + v[1] * right, u[2] * left + v[2] * right));
  }
  return out;
}

/** One segment, or two when the short way from `a` to `b` crosses the date line, so an equirectangular line does not cross the whole map. Longitude is degrees, −180 to 180. */
export function splitDateLine(a: LonLat, b: LonLat): [LonLat, LonLat][] {
  let delta = b.lon - a.lon;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  const end = a.lon + delta;
  if (end <= 180 && end >= -180) return [[a, { lon: end, lat: b.lat }]];
  const edge = end > 180 ? 180 : -180;
  const span = end - a.lon;
  const t = span === 0 ? 0 : (edge - a.lon) / span;
  const lat = a.lat + (b.lat - a.lat) * t;
  const other = edge === 180 ? -180 : 180;
  const rest = end > 180 ? end - 360 : end + 360;
  return [
    [a, { lon: edge, lat }],
    [{ lon: other, lat }, { lon: rest, lat: b.lat }],
  ];
}

/** Where a longitude and latitude fall on the painted texture, column and row. */
export function paintPixel(lon: number, lat: number): { x: number; y: number } {
  const u = lon / 360 + 0.5;
  const v = 0.5 - lat / 180;
  const x = Math.max(0, Math.min(PAINT_W - 1, Math.floor(u * PAINT_W)));
  const y = Math.max(0, Math.min(PAINT_H - 1, Math.floor(v * PAINT_H)));
  return { x, y };
}
