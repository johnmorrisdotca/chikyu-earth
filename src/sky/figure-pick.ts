// Where a reader's pointer is on the constellation figures, and where a figure's name goes. Pure: the lines are a list of segments (x0, y0, x1, y1 in the picture's pixels), a figure being a run of them.

/** A list of segments, four numbers each: where one starts and where it ends. */
export type SegmentList = ArrayLike<number>;

/**
 * The squared distance from a point to the nearest segment of a figure.
 *
 * @param segments - The segments, four numbers each.
 * @param start - The figure's first segment.
 * @param end - One past its last.
 * @param x - The point, x.
 * @param y - The point, y.
 * @returns The squared distance to the nearest, or infinity where the figure has none.
 */
export function nearestSegment(segments: SegmentList, start: number, end: number, x: number, y: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (let s = start; s < end; s += 1) {
    const at = s * 4;
    const x0 = segments[at]!;
    const y0 = segments[at + 1]!;
    const dx = segments[at + 2]! - x0;
    const dy = segments[at + 3]! - y0;
    const length = dx * dx + dy * dy;
    const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / length));
    const d = (x0 + t * dx - x) ** 2 + (y0 + t * dy - y) ** 2;
    if (d < best) best = d;
  }
  return best;
}

/**
 * The convex hull of a figure's segment ends (Andrew's monotone chain), as x y pairs: made once for a figure and kept while the picture holds, then asked of with `areaInHull` at each pointer.
 *
 * @param segments - The segments, four numbers each.
 * @param start - The figure's first segment.
 * @param end - One past its last.
 * @returns The hull's corners, x then y for each, round the figure.
 */
export function hullOf(segments: SegmentList, start: number, end: number): number[] {
  const points: [number, number][] = [];
  for (let s = start; s < end; s += 1) {
    points.push([segments[s * 4]!, segments[s * 4 + 1]!], [segments[s * 4 + 2]!, segments[s * 4 + 3]!]);
  }
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const chain: [number, number][] = [];
  for (const point of points) {
    while (chain.length >= 2 && cross(chain[chain.length - 2]!, chain[chain.length - 1]!, point) <= 0) chain.pop();
    chain.push(point);
  }
  const floor = chain.length + 1;
  for (let i = points.length - 2; i >= 0; i -= 1) {
    const point = points[i]!;
    while (chain.length >= floor && cross(chain[chain.length - 2]!, chain[chain.length - 1]!, point) <= 0) chain.pop();
    chain.push(point);
  }
  chain.pop();
  return chain.flat();
}

/**
 * The area of the convex hull of a figure when a point is inside it, or -1 when it is not. A pointer inside a figure (not only on its lines) picks it; where figures overlap, the smaller hull is the one meant.
 *
 * @param segments - The segments, four numbers each.
 * @param start - The figure's first segment.
 * @param end - One past its last.
 * @param x - The point, x.
 * @param y - The point, y.
 * @returns The hull's area where the point is inside it, else -1.
 */
export function hullAreaAround(segments: SegmentList, start: number, end: number, x: number, y: number): number {
  return areaInHull(hullOf(segments, start, end), x, y);
}

/**
 * The area of a hull when a point is inside it, or -1 when it is not (and for a hull with fewer than three corners).
 *
 * @param h - The hull, from `hullOf`.
 * @param x - The point, x.
 * @param y - The point, y.
 * @returns The area where the point is inside, else -1.
 */
export function areaInHull(h: readonly number[], x: number, y: number): number {
  const n = h.length / 2;
  if (n < 3) return -1;
  let area = 0;
  let sign = 0;
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    const ax = h[i * 2]!;
    const ay = h[i * 2 + 1]!;
    const bx = h[j * 2]!;
    const by = h[j * 2 + 1]!;
    area += ax * by - bx * ay;
    const side = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (side !== 0) {
      if (sign === 0) sign = Math.sign(side);
      else if (Math.sign(side) !== sign) return -1;
    }
  }
  return Math.abs(area) / 2;
}

/**
 * The visual middle of the part of a figure that is on the picture: the middle of its lines, each counted by its length, taken only where they are inside the picture and not under a body or a place kept clear. Pieces outside the picture, and the parts of a figure that run off it, count for nothing.
 *
 * @param segments - The segments, four numbers each.
 * @param start - The figure's first segment.
 * @param end - One past its last.
 * @param width - The picture's width.
 * @param height - The picture's height.
 * @param blocked - Whether a point of the picture is on a body or in a place kept clear, or `undefined` where none is.
 * @param out - Where to write the middle.
 * @returns True where any of the figure is in view, with `out` written.
 */
export function visibleCentre(segments: SegmentList, start: number, end: number, width: number, height: number, blocked: ((x: number, y: number) => boolean) | undefined, out: { x: number; y: number }): boolean {
  let sx = 0;
  let sy = 0;
  let sum = 0;
  for (let s = start; s < end; s += 1) {
    const at = s * 4;
    const x0 = segments[at]!;
    const y0 = segments[at + 1]!;
    const dx = segments[at + 2]! - x0;
    const dy = segments[at + 3]! - y0;
    // Liang and Barsky: the part of the segment inside the picture, as parameters t0 to t1
    let t0 = 0;
    let t1 = 1;
    let inside = true;
    for (let side = 0; side < 4 && inside; side += 1) {
      const p = side === 0 ? -dx : side === 1 ? dx : side === 2 ? -dy : dy;
      const q = side === 0 ? x0 : side === 1 ? width - x0 : side === 2 ? y0 : height - y0;
      if (p === 0) {
        if (q < 0) inside = false;
      } else {
        const r = q / p;
        if (p < 0) {
          if (r > t1) inside = false;
          else if (r > t0) t0 = r;
        } else if (r < t0) inside = false;
        else if (r < t1) t1 = r;
      }
    }
    if (!inside || t1 <= t0) continue;
    const mid = (t0 + t1) / 2;
    const mx = x0 + dx * mid;
    const my = y0 + dy * mid;
    if (blocked?.(mx, my)) continue;
    const length = (t1 - t0) * Math.hypot(dx, dy) || 0.01;
    sx += mx * length;
    sy += my * length;
    sum += length;
  }
  if (sum <= 0) return false;
  out.x = sx / sum;
  out.y = sy / sum;
  return true;
}

/** Offsets tried, in steps of the box's own width (across) and height (down), nearest first. */
const ACROSS = [0, -0.4, 0.4, -0.8, 0.8, -1.2, 1.2, -1.6, 1.6, -2.2, 2.2];
const DOWN = [0, -1.2, 1.2, -2.4, 2.4, -3.6, 3.6, -4.8, 4.8];

/**
 * Where a box goes: its middle at a point, or the nearest place round the point where it is inside the picture and `free` says it can stand.
 *
 * @param x - The wanted middle, x.
 * @param y - The wanted middle, y.
 * @param w - The box's width.
 * @param h - The box's height.
 * @param width - The picture's width.
 * @param height - The picture's height.
 * @param free - Whether a box (left, top, right, bottom) may stand there.
 * @param out - Where to write the middle of the place found.
 * @returns True where a place was found.
 */
export function placeBox(x: number, y: number, w: number, h: number, width: number, height: number, free: (l: number, t: number, r: number, b: number) => boolean, out: { x: number; y: number }): boolean {
  const margin = 4;
  let best = Number.POSITIVE_INFINITY;
  for (const down of DOWN) {
    for (const across of ACROSS) {
      const cx = Math.max(margin + w / 2, Math.min(width - margin - w / 2, x + across * w));
      const cy = Math.max(margin + h / 2, Math.min(height - margin - h / 2, y + down * h));
      const away = Math.abs(cx - x) + Math.abs(cy - y);
      if (away < best && free(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)) {
        best = away;
        out.x = cx;
        out.y = cy;
      }
    }
  }
  return best !== Number.POSITIVE_INFINITY;
}
