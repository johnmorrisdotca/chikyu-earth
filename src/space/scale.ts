// The two scales the space view can show. The true one is the Earth's radius for a unit and the real distances in it; the compressed one keeps every
// direction but squeezes the distances so that the Moon, the Sun and Neptune fit one view. Pure.
import { AU_IN_EARTH_RADII, type Vec3 } from "./ephemeris.ts";

export type ScaleMode = "compressed" | "true";

const MOON_AU = 0.00257;
/** The Moon's distance in a compressed view, in Earth radii (the true one is about 60). */
export const MOON_COMPRESSED = 10;
/** The Sun's distance from the Earth in a compressed view, in Earth radii (the true one is about 23,500). One astronomical unit is this long there. */
export const SUN_COMPRESSED = 44;

const length = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);
const scaled = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k];

/** A place in astronomical units from the Earth's centre, at true distance, in Earth radii. */
export const truePosition = (v: Vec3): Vec3 => scaled(v, AU_IN_EARTH_RADII);

/** The same direction at a compressed distance from the Earth: the Moon is 10 Earth radii away, and a body k times further than the Moon is k^0.25 times as far here. */
export function compress(v: Vec3): Vec3 {
  const l = length(v);
  return l === 0 ? [0, 0, 0] : scaled(v, (MOON_COMPRESSED * (l / MOON_AU) ** 0.25) / l);
}

/** The Moon, from the Earth's centre. */
export const placeMoon = (mode: ScaleMode, geo: Vec3): Vec3 => (mode === "true" ? truePosition(geo) : compress(geo));

/** The Sun, from the Earth's centre: in a compressed view always 44 Earth radii away, in its real direction. */
export function placeSun(mode: ScaleMode, geo: Vec3): Vec3 {
  if (mode === "true") return truePosition(geo);
  const l = length(geo);
  return l === 0 ? [0, 0, 0] : scaled(geo, SUN_COMPRESSED / l);
}

/**
 * A place `helio` astronomical units from the Sun (a planet, or a point on its orbit), round the Sun at `sun`. True: as it is. Compressed: the same direction from
 * the Sun, at 44 Earth radii times its distance in astronomical units to the power 0.45, so the Earth's own orbit is the 44 and Neptune's is about 200 (30 times as far, really).
 */
export function placeAround(mode: ScaleMode, sun: Vec3, helio: Vec3): Vec3 {
  if (mode === "true") return [sun[0] + helio[0] * AU_IN_EARTH_RADII, sun[1] + helio[1] * AU_IN_EARTH_RADII, sun[2] + helio[2] * AU_IN_EARTH_RADII];
  const l = length(helio);
  if (l === 0) return sun;
  const d = (SUN_COMPRESSED * l ** 0.45) / l;
  return [sun[0] + helio[0] * d, sun[1] + helio[1] * d, sun[2] + helio[2] * d];
}

/** Radii in Earth radii: the real ones, and ones large enough to see in a compressed view. */
export const RADIUS: Record<string, { true: number; compressed: number }> = {
  Sun: { true: 109.1, compressed: 5 },
  Earth: { true: 1, compressed: 1 },
  Moon: { true: 0.2727, compressed: 0.9 },
  Mercury: { true: 0.383, compressed: 0.5 },
  Venus: { true: 0.949, compressed: 0.8 },
  Mars: { true: 0.532, compressed: 0.6 },
  Jupiter: { true: 10.97, compressed: 1.8 },
  Saturn: { true: 9.14, compressed: 1.6 },
  Uranus: { true: 3.98, compressed: 1.0 },
  Neptune: { true: 3.86, compressed: 1.0 },
};
