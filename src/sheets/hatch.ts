// Shading that prints in black and white: parallel lines, drawn only where a test says so (the night side of the Earth). The lines are plain geometry, not a pattern fill, so they print the same in any browser. Pure.

export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const r = (v: number): string => (Math.round(v * 100) / 100).toString();

/**
 * Parallel lines, `spacing` apart at `angleDeg`, cut to where `inside(x, y)` is true, as the data of one SVG path (a millimetre of the picture is a millimetre of the paper). Each end is found to a twentieth of a millimetre.
 * @param bounds - The box the lines are laid over.
 * @param spacing - The gap between lines, in millimetres.
 * @param angleDeg - The turn of the lines, in degrees from the x axis.
 * @param inside - Whether a point is in the shaded part.
 * @returns Path data: `M x y L x y` for each stroke.
 *
 * @example
 * ```ts
 * import { hatchPath } from "@johnmorrisdotca/chikyu-earth/sheets";
 *
 * const d = hatchPath({ x0: 0, y0: 0, x1: 20, y1: 20 }, 4, 45, (x) => x < 10);
 * console.log(d.startsWith("M"));
 * ```
 */
export function hatchPath(bounds: Bounds, spacing: number, angleDeg: number, inside: (x: number, y: number) => boolean): string {
  const a = (angleDeg * Math.PI) / 180;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const nx = -uy;
  const ny = ux;
  const corners = [[bounds.x0, bounds.y0], [bounds.x1, bounds.y0], [bounds.x0, bounds.y1], [bounds.x1, bounds.y1]] as const;
  const ts = corners.map(([x, y]) => x * nx + y * ny);
  const ss = corners.map(([x, y]) => x * ux + y * uy);
  const tMin = Math.min(...ts);
  const tMax = Math.max(...ts);
  const sMin = Math.min(...ss);
  const sMax = Math.max(...ss);
  const step = 0.4;
  const at = (t: number, s: number): [number, number] => [t * nx + s * ux, t * ny + s * uy];
  /** The place between an outside sample and an inside one where the shading starts or stops. */
  const edge = (t: number, outside: number, within: number): number => {
    let lo = outside;
    let hi = within;
    for (let i = 0; i < 4; i += 1) {
      const m = (lo + hi) / 2;
      if (inside(...at(t, m))) hi = m;
      else lo = m;
    }
    return (lo + hi) / 2;
  };
  const out: string[] = [];
  for (let t = tMin + spacing / 2; t <= tMax; t += spacing) {
    let start: number | undefined;
    let previous = sMin;
    for (let s = sMin; s <= sMax + step; s += step) {
      const on = inside(...at(t, s));
      if (on && start === undefined) start = s === sMin ? s : edge(t, previous, s);
      if (!on && start !== undefined) {
        const end = edge(t, s, previous);
        const [x0, y0] = at(t, start);
        const [x1, y1] = at(t, end);
        out.push(`M${r(x0)} ${r(y0)}L${r(x1)} ${r(y1)}`);
        start = undefined;
      }
      previous = s;
    }
  }
  return out.join("");
}
