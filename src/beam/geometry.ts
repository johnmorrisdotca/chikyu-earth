// The beam from a satellite to the ground below it: the true size of the footprint, and the pattern of spot cells drawn inside it. Pure: numbers in, numbers out.
// The footprint is the circle on the ground from which the satellite stands above a stated elevation; the cells are an illustration, never an operator's beam plan.

const RAD = Math.PI / 180;

/** The Earth's mean radius in kilometres, as the space view measures: the same 6,371. */
const EARTH_KM = 6371;

/**
 * The elevation, in degrees, above which a satellite counts as seen from the ground: the footprint is the circle from which it stands at least this high.
 *
 * @example
 * ```ts
 * import { BEAM_ELEVATION } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(BEAM_ELEVATION);
 * ```
 */
export const BEAM_ELEVATION = 25;

/**
 * The angle at the Earth's centre between the point below a satellite and the edge of its footprint, in radians: the ground circle from which the satellite is above `elevation`.
 * It is `acos(R cos(e) / (R + h)) - e` for the Earth's radius R, the height h and the elevation e. A satellite on or under the ground, or an elevation of 90 degrees or more, has none.
 *
 * @param heightKm - The satellite's height above the ground, in kilometres.
 * @param elevation - The least elevation, in degrees. 25 when left out.
 * @returns The angle, in radians, from 0 up to a quarter of a turn.
 * @example
 * ```ts
 * import { footprintAngle } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log((footprintAngle(420) * 180) / Math.PI);
 * ```
 */
export function footprintAngle(heightKm: number, elevation = BEAM_ELEVATION): number {
  if (!(heightKm > 0) || !(elevation < 90)) return 0;
  const e = Math.max(0, elevation) * RAD;
  const cosine = (EARTH_KM * Math.cos(e)) / (EARTH_KM + heightKm);
  return Math.max(0, Math.acos(Math.min(1, cosine)) - e);
}

/**
 * The radius of a satellite's footprint along the ground, in kilometres: the Earth's radius times {@link footprintAngle}.
 *
 * @param heightKm - The satellite's height above the ground, in kilometres.
 * @param elevation - The least elevation, in degrees. 25 when left out.
 * @returns The radius in kilometres.
 * @example
 * ```ts
 * import { footprintKm } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(Math.round(footprintKm(550)));
 * ```
 */
export const footprintKm = (heightKm: number, elevation = BEAM_ELEVATION): number => EARTH_KM * footprintAngle(heightKm, elevation);

/**
 * The spot cells inside a footprint: where each one's middle is, and how large they are, in the footprint's own units (the footprint's radius is 1).
 *
 * @example
 * ```ts no-run
 * import type { BeamCells } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const none: BeamCells = { lattice: [], pitch: 0, radius: 0 };
 * console.log(none.lattice.length);
 * ```
 */
export interface BeamCells {
  /** Each cell's middle on the lattice, in units of the distance between neighbours (the hexagonal pack: one at the middle, then rings of six, twelve, eighteen). */
  lattice: number[][];
  /** The distance between neighbouring cells as a share of the footprint's radius. */
  pitch: number;
  /** A cell's radius as a share of the footprint's radius. */
  radius: number;
}

/** A cell's radius as a share of the distance between neighbours: a little under a half, so the rings of neighbours do not touch. */
const CELL_SHARE = 0.46;
/** How far out the outer edge of the outermost cell may reach, as a share of the footprint's radius. */
const FIT = 0.97;

/**
 * The spot cells of a footprint: `count` circles in a hexagonal pack (the middle one, then the nearest to it), drawn to fit inside the footprint, or at most `cellKm` in radius when that is smaller.
 * It is an illustration of a satellite that serves the ground in cells; it is not the pattern of any operator's beam plan.
 *
 * @param count - How many cells (0 for none; the most is 91, six rings).
 * @param radiusKm - The footprint's radius along the ground, in kilometres.
 * @param cellKm - A cell's radius in kilometres, when the page wants it smaller than the fit; 0 for the fit.
 * @returns The cells.
 * @example
 * ```ts
 * import { beamCells } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(beamCells(19, 2200, 0).lattice.length);
 * ```
 */
export function beamCells(count: number, radiusKm: number, cellKm = 0): BeamCells {
  const wanted = Math.max(0, Math.min(91, Math.floor(Number.isFinite(count) ? count : 0)));
  const lattice: number[][] = [];
  const reach = 6;
  for (let j = -reach; j <= reach; j += 1) for (let i = -reach; i <= reach; i += 1) lattice.push([i + j / 2, (j * Math.sqrt(3)) / 2]);
  lattice.sort((a, b) => Math.hypot(a[0]!, a[1]!) - Math.hypot(b[0]!, b[1]!) || Math.atan2(a[1]!, a[0]!) - Math.atan2(b[1]!, b[0]!));
  const taken = lattice.slice(0, wanted);
  const far = taken.reduce((most, point) => Math.max(most, Math.hypot(point[0]!, point[1]!)), 0);
  let pitch = FIT / (far + CELL_SHARE);
  let radius = CELL_SHARE * pitch;
  if (cellKm > 0 && radiusKm > 0 && cellKm / radiusKm < radius) {
    radius = cellKm / radiusKm;
    pitch = radius / CELL_SHARE;
  }
  return { lattice: taken, pitch, radius };
}

/**
 * The attributes the beam reads: `beam`, `beam-elevation`, `beam-cells`, `beam-cell-size`, `beam-color` and `beam-strength`.
 *
 * @example
 * ```ts
 * import { BEAM_ATTRIBUTES } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(BEAM_ATTRIBUTES.join(" "));
 * ```
 */
export const BEAM_ATTRIBUTES = ["beam", "beam-elevation", "beam-cells", "beam-cell-size", "beam-color", "beam-strength"] as const;

/**
 * What the attributes say: whether the beam is on, and its options.
 *
 * @example
 * ```ts no-run
 * import type { BeamOptions } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const options: BeamOptions = { on: true, elevation: 25, cells: 19, cellSize: 0, colour: "#8fd1ff", strength: 0.6 };
 * console.log(options.cells);
 * ```
 */
export interface BeamOptions {
  on: boolean;
  elevation: number;
  cells: number;
  cellSize: number;
  colour: string;
  strength: number;
}

/**
 * The beam's colour when the page names none: a pale blue that reads on the day side and the night side.
 *
 * @example
 * ```ts
 * import { BEAM_COLOUR } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(BEAM_COLOUR);
 * ```
 */
export const BEAM_COLOUR = "#8fd1ff";

const number = (value: string | null, fallback: number, least: number, most: number): number => {
  const read = value === null || value.trim() === "" ? Number.NaN : Number(value);
  return Number.isFinite(read) ? Math.min(most, Math.max(least, read)) : fallback;
};

/**
 * What the beam's attributes say. `beam` is off when it is missing, `off` or `false`; a bare attribute, `selected` or `on` switches it on for the chosen satellite. The strength is from 0 to 1 (0.6 when left out),
 * the elevation from 0 to 80 degrees (25), the cells from 0 to 91 (none) and the cell size in kilometres (0 for the fit).
 *
 * @param get - Reads an attribute by name, `null` when it is missing.
 * @returns The options.
 * @example
 * ```ts
 * import { readBeam } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const read = readBeam((name) => ({ beam: "selected", "beam-cells": "19" })[name] ?? null);
 * console.log(read.on, read.cells);
 * ```
 */
export function readBeam(get: (name: string) => string | null): BeamOptions {
  const word = get("beam");
  const on = word !== null && !["off", "false", "none"].includes(word.trim().toLowerCase());
  const colour = (get("beam-color") ?? "").trim();
  return {
    on,
    elevation: number(get("beam-elevation"), BEAM_ELEVATION, 0, 80),
    cells: Math.floor(number(get("beam-cells"), 0, 0, 91)),
    cellSize: number(get("beam-cell-size"), 0, 0, 5000),
    colour: /^#[0-9a-f]{3,8}$|^[a-z]+$|^(rgb|hsl)a?\(/i.test(colour) ? colour : BEAM_COLOUR,
    strength: number(get("beam-strength"), 0.6, 0, 1),
  };
}
