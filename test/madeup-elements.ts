// Made-up element sets for tests: round orbits with the right period for each kind of group, spread round the Earth, named MADE-UP. Not real satellites and never fetched.
import { SATELLITE_GROUPS, type SatelliteGroupInfo } from "../src/satellites/catalogue.ts";
import type { Raw } from "../scripts/elements.ts";

const REVS_A_DAY: Record<string, number> = { geostationary: 1.0027, gps: 2.0057, glonass: 2.131, galileo: 1.7, beidou: 1.86, oneweb: 13.1, iridium: 14.3, starlink: 15.06, "earth-observation": 14.6, weather: 14.2, science: 15.3, stations: 15.5, famous: 14, amateur: 15 };

/** `count` made-up satellites for a group, numbered from `first`, with elements as of `epoch` (like `2026-11-03T12:00:00`). */
export function madeUp(group: SatelliteGroupInfo | string, count: number, epoch: string, first = 900_000): Raw[] {
  const id = typeof group === "string" ? group : group.id;
  return Array.from({ length: count }, (_, i) => ({
    OBJECT_NAME: `MADE-UP ${id.toUpperCase()} ${i + 1}`,
    OBJECT_ID: `2026-${String(i + 1).padStart(3, "0")}A`,
    EPOCH: epoch,
    MEAN_MOTION: REVS_A_DAY[id] ?? 14,
    ECCENTRICITY: 0.0002,
    INCLINATION: id === "geostationary" ? 0.05 : 53 + i,
    RA_OF_ASC_NODE: (i * 360) / count,
    ARG_OF_PERICENTER: 90,
    MEAN_ANOMALY: (i * 137.5) % 360,
    NORAD_CAT_ID: first + SATELLITE_GROUPS.findIndex((one) => one.id === id) * 1000 + i,
    BSTAR: 0.0001,
    MEAN_MOTION_DOT: 0.00001,
    MEAN_MOTION_DDOT: 0,
  }));
}
