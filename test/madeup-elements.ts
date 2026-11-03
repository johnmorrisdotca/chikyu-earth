// Made-up element sets for tests: round orbits with the right period for each kind of group, spread round the Earth, named MADE-UP. Not real satellites and never fetched.
import { SATELLITE_GROUPS, type SatelliteGroupInfo } from "../src/satellites/catalogue.ts";
import type { Raw } from "../scripts/elements.ts";
import type { ElementSet } from "../src/satellites/types.ts";

const checksum = (line: string): number => [...line].reduce((sum, ch) => sum + (ch >= "0" && ch <= "9" ? Number(ch) : ch === "-" ? 1 : 0), 0) % 10;


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

/** A made-up TLE for a made-up satellite (the lines are laid out as the format says, with the right checksums). */
export function madeUpTle(set: ElementSet, name = true): string {
  const day = (Date.parse(`${set.EPOCH}Z`) - Date.UTC(2026, 0, 1)) / 86_400_000 + 1;
  const exp = (value: number): string => {
    if (value === 0) return " 00000-0";
    const e = Math.floor(Math.log10(Math.abs(value))) + 1;
    return `${value < 0 ? "-" : " "}${String(Math.round(Math.abs(value) / 10 ** e * 1e5)).padStart(5, "0")}${e < 0 ? "-" : "+"}${Math.abs(e)}`;
  };
  const l1 = `1 ${String(set.NORAD_CAT_ID).padStart(5, "0")}U 26001A   26${day.toFixed(8).padStart(12, "0")} ${set.MEAN_MOTION_DOT.toFixed(8).replace(/^0/, " ")} ${exp(set.MEAN_MOTION_DDOT)} ${exp(set.BSTAR)} 0  999`;
  const l2 = `2 ${String(set.NORAD_CAT_ID).padStart(5, "0")} ${set.INCLINATION.toFixed(4).padStart(8)} ${set.RA_OF_ASC_NODE.toFixed(4).padStart(8)} ${set.ECCENTRICITY.toFixed(7).slice(2)} ${set.ARG_OF_PERICENTER.toFixed(4).padStart(8)} ${set.MEAN_ANOMALY.toFixed(4).padStart(8)} ${set.MEAN_MOTION.toFixed(8).padStart(11)}12345`;
  const lines = [l1.padEnd(68).slice(0, 68), l2.padEnd(68).slice(0, 68)].map((line) => `${line}${checksum(line)}`);
  return [...(name ? [`0 ${set.OBJECT_NAME}`] : []), ...lines].join("\n");
}
