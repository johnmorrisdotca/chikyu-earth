// Thick lines hide fine detail, so a coast is made simpler before it is drawn: a path from d3-geo is read back as points in millimetres, the points that matter at the line's thickness are kept (Douglas-Peucker), loops too small to colour
// are dropped, and the corners are rounded. Pure.

type Point = [number, number];

interface Run {
  points: Point[];
  closed: boolean;
}

/** The runs of a path written by d3-geo: `M x,y L x,y ... Z` or without the `Z`. */
function runsOf(d: string): Run[] {
  const runs: Run[] = [];
  for (const part of d.split("M").slice(1)) {
    const closed = part.endsWith("Z");
    const points = part
      .replace(/Z$/, "")
      .split("L")
      .map((pair): Point => {
        const [x, y] = pair.split(",");
        return [Number(x), Number(y)];
      });
    const first = points[0]!;
    const last = points.at(-1)!;
    const loops = closed || (points.length > 3 && Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-6);
    if (loops && Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-6) points.pop();
    runs.push({ points, closed: loops });
  }
  return runs;
}

const distance = (p: Point, a: Point, b: Point): number => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = dx * dx + dy * dy;
  if (length === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
};

/** Douglas-Peucker: the points of a line that leave it within `tolerance` of the simpler line through them. */
function simplify(points: Point[], tolerance: number): Point[] {
  if (points.length < 3) return points;
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [from, to] = stack.pop()!;
    let far = -1;
    let most = tolerance;
    for (let i = from + 1; i < to; i += 1) {
      const d = distance(points[i]!, points[from]!, points[to]!);
      if (d > most) {
        most = d;
        far = i;
      }
    }
    if (far >= 0) {
      keep[far] = true;
      stack.push([from, far], [far, to]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const r = (v: number): string => (Math.round(v * 100) / 100).toString();
const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** A run as a path with rounded corners: straight to the middle of the first side, then a curve through each corner. */
function rounded(run: Run): string {
  const p = run.points;
  if (p.length < 3) return `M${r(p[0]![0])} ${r(p[0]![1])}L${r(p.at(-1)![0])} ${r(p.at(-1)![1])}`;
  if (run.closed) {
    const start = mid(p[0]!, p[1]!);
    let d = `M${r(start[0])} ${r(start[1])}`;
    for (let i = 1; i <= p.length; i += 1) {
      const corner = p[i % p.length]!;
      const next = mid(corner, p[(i + 1) % p.length]!);
      d += `Q${r(corner[0])} ${r(corner[1])} ${r(next[0])} ${r(next[1])}`;
    }
    return `${d}Z`;
  }
  let d = `M${r(p[0]![0])} ${r(p[0]![1])}`;
  const first = mid(p[0]!, p[1]!);
  d += `L${r(first[0])} ${r(first[1])}`;
  for (let i = 1; i < p.length - 1; i += 1) {
    const next = mid(p[i]!, p[i + 1]!);
    d += `Q${r(p[i]![0])} ${r(p[i]![1])} ${r(next[0])} ${r(next[1])}`;
  }
  return `${d}L${r(p.at(-1)![0])} ${r(p.at(-1)![1])}`;
}

/**
 * A d3-geo path made fit for a thick line: simpler to within `toleranceMm`, loops whose longest side is under `minLoopMm` left out, corners rounded.
 * @param d - The path as d3-geo's `geoPath` writes it, in millimetres.
 * @param toleranceMm - How far the simpler line may stray from the real one.
 * @param minLoopMm - The smallest island, by its longest side, that is kept.
 * @returns The path.
 *
 * @example
 * ```ts
 * import { thickPath } from "@johnmorrisdotca/chikyu-earth/sheets";
 *
 * console.log(thickPath("M0,0L5,0.1L10,0L20,0", 0.5, 0));
 * ```
 */
export function thickPath(d: string, toleranceMm: number, minLoopMm: number): string {
  const out: string[] = [];
  for (const run of runsOf(d)) {
    if (run.points.length < 2) continue;
    if (run.closed) {
      const xs = run.points.map((p) => p[0]);
      const ys = run.points.map((p) => p[1]);
      if (Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) < minLoopMm) continue;
    }
    const points = simplify(run.points, toleranceMm);
    if (run.closed ? points.length < 3 : points.length < 2) continue;
    out.push(rounded({ points, closed: run.closed }));
  }
  return out.join("");
}
