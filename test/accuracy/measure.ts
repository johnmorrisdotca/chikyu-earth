// How far the package is from the published reference values in references.ts: the Sun's overhead point, the line between day and night, and SGP4.
import { createSatellites, type ElementSet } from "../../src/satellites/index.ts";
import { subsolarPoint } from "../../src/realistic/sun.ts";
import { terminator } from "../../src/sheets/sun.ts";
import { SGP4, SUN, type Sgp4Case } from "./references.ts";

const RAD = Math.PI / 180;
/** The Earth radius the package uses for its positions, km (src/satellites/track.ts). */
const EARTH_RADIUS_KM = 6371;

/** The angle between two places on a sphere, degrees. */
export const angleBetween = (a: { lon: number; lat: number }, b: { lon: number; lat: number }): number => {
  const [la, lb] = [a.lat * RAD, b.lat * RAD];
  const cos = Math.sin(la) * Math.sin(lb) + Math.cos(la) * Math.cos(lb) * Math.cos((a.lon - b.lon) * RAD);
  return Math.acos(Math.min(1, Math.max(-1, cos))) / RAD;
};
const wrap180 = (d: number): number => ((((d + 180) % 360) + 360) % 360) - 180;

export interface SunError {
  utc: string;
  /** The package's longitude and latitude of the overhead Sun, and Horizons'. */
  lon: number;
  lat: number;
  refLon: number;
  refLat: number;
  /** Differences in degrees: longitude (signed, package less reference), latitude (signed) and the angle between the two places. */
  dLon: number;
  dLat: number;
  angle: number;
  /** The most the package's day/night line lies from the line 90 degrees from the reference Sun, in degrees (over 360 points). */
  terminator: number;
}

/** Each date's error in the Sun's overhead point and in the day/night line. */
export function measureSun(): SunError[] {
  return SUN.map((ref) => {
    const ms = Date.parse(ref.utc);
    const mine = subsolarPoint(ms);
    const refLon = wrap180(ref.raDeg - ref.siderealHours * 15);
    const reference = { lon: refLon, lat: ref.decDeg };
    // The line is every point 90 degrees from the Sun: the error of a point is how far from 90 degrees it is from the reference Sun.
    let worst = 0;
    for (const [lon, lat] of terminator(ms, 360)) worst = Math.max(worst, Math.abs(angleBetween({ lon, lat }, reference) - 90));
    return { utc: ref.utc, lon: mine.lon, lat: mine.lat, refLon, refLat: ref.decDeg, dLon: wrap180(mine.lon - refLon), dLat: mine.lat - ref.decDeg, angle: angleBetween(mine, reference), terminator: worst };
  });
}

/** The check digit of a two-line element line: digits summed, a minus sign counting 1, modulo 10. */
export const checksum = (line: string): number => {
  let sum = 0;
  for (const c of line.slice(0, 68)) sum += c >= "0" && c <= "9" ? Number(c) : c === "-" ? 1 : 0;
  return sum % 10;
};

/** The element set (the JSON that CelesTrak serves) that two lines of an old-style element set say. */
export function elementSetOf(c: Sgp4Case): { set: ElementSet; epochMs: number } {
  const { line1, line2 } = c;
  const year = Number(line1.slice(18, 20));
  const day = Number(line1.slice(20, 32));
  const epochMs = Math.round(Date.UTC(year < 57 ? 2000 + year : 1900 + year, 0, 1) + (day - 1) * 86_400_000);
  const implied = (text: string): number => {
    const t = text.trim();
    const m = /^([+-]?)(\d+)([+-]\d)$/.exec(t.replace(/^([+-]?)(\d+)([+-]\d)$/, "$1$2$3"))!;
    return Number(`${m[1]}0.${m[2]}e${m[3]}`);
  };
  const set: ElementSet = {
    OBJECT_NAME: c.name,
    EPOCH: new Date(epochMs).toISOString(),
    MEAN_MOTION: Number(line2.slice(52, 63)),
    ECCENTRICITY: Number(`0.${line2.slice(26, 33)}`),
    INCLINATION: Number(line2.slice(8, 16)),
    RA_OF_ASC_NODE: Number(line2.slice(17, 25)),
    ARG_OF_PERICENTER: Number(line2.slice(34, 42)),
    MEAN_ANOMALY: Number(line2.slice(43, 51)),
    NORAD_CAT_ID: Number(line1.slice(2, 7)),
    BSTAR: implied(line1.slice(53, 61)),
    MEAN_MOTION_DOT: Number(line1.slice(33, 43)),
    MEAN_MOTION_DDOT: implied(line1.slice(44, 52)),
    EPHEMERIS_TYPE: 0,
    CLASSIFICATION_TYPE: "U",
  };
  return { set, epochMs };
}

export interface SatelliteError {
  name: string;
  rows: number;
  /** The worst distance between the package's place and the published one, km, and the minutes since epoch where it happened. */
  worstKm: number;
  worstAtMinutes: number;
  /** The same on the first row (the epoch itself). */
  atEpochKm: number;
}

/** Each case's worst distance, through the package's own `createSatellites` path (the same call a page makes). */
export function measureSgp4(): SatelliteError[] {
  return SGP4.map((c) => {
    const { set, epochMs } = elementSetOf(c);
    const group = createSatellites([set], { maxAgeDays: 100_000 });
    if (group.count !== 1) throw new Error(`${c.name}: not started (${JSON.stringify(group.refused)})`);
    const out = new Float64Array(6);
    let worstKm = 0;
    let worstAtMinutes = 0;
    let atEpochKm = 0;
    for (const row of c.rows) {
      if (!group.exact(0, epochMs + row.minutes * 60_000, out)) throw new Error(`${c.name}: no place at ${row.minutes} min`);
      // the package's axes are TEME x, z, -y in Earth radii: back to TEME km
      const mine = [out[0]! * EARTH_RADIUS_KM, -out[2]! * EARTH_RADIUS_KM, out[1]! * EARTH_RADIUS_KM] as const;
      const km = Math.hypot(mine[0] - row.r[0], mine[1] - row.r[1], mine[2] - row.r[2]);
      if (row.minutes === 0) atEpochKm = km;
      if (km > worstKm) [worstKm, worstAtMinutes] = [km, row.minutes];
    }
    return { name: c.name, rows: c.rows.length, worstKm, worstAtMinutes, atEpochKm };
  });
}
