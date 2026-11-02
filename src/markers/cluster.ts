// Crowded markers become one: points closer than a cell on the screen share a cluster. A grid, so thousands of points cost one pass. Pure.

/**
 * Several points gathered into one on the screen: where it is drawn and which points are in it.
 *
 * @example
 * ```ts
 * import { clusterPoints, type Cluster } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * const clusters: Cluster[] = clusterPoints([0, 1], 2, [10, 12], [10, 11], 28);
 * console.log(clusters[0]?.members);
 * ```
 */
export interface Cluster {
  x: number;
  y: number;
  /** Indices of the points in it. */
  members: number[];
}

/**
 * Group the points `indices` (into `xs` and `ys`) by the grid cell they fall in. A cell with one point is that point alone; with more it is one cluster at their
 * average. Order is stable: clusters come in the order their first member was seen.
 *
 * @param indices - Which points to group: indices into `xs` and `ys`.
 * @param count - How many of `indices` to read.
 * @param xs - Every point's x on the screen, in pixels.
 * @param ys - Every point's y on the screen, in pixels.
 * @param cell - The side of a grid cell in pixels; points in one cell join.
 * @returns The clusters, each with the indices of its members; a lone point is a cluster of one.
 *
 * @example
 * ```ts
 * import { clusterPoints } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * const xs = [10, 14, 200];
 * const ys = [10, 12, 200];
 * console.log(clusterPoints([0, 1, 2], 3, xs, ys, 28).map((cluster) => cluster.members));
 * ```
 */
export function clusterPoints(indices: ArrayLike<number>, count: number, xs: ArrayLike<number>, ys: ArrayLike<number>, cell: number): Cluster[] {
  const cells = new Map<number, Cluster>();
  const out: Cluster[] = [];
  for (let k = 0; k < count; k += 1) {
    const i = indices[k]!;
    const key = Math.floor(xs[i]! / cell) * 100_003 + Math.floor(ys[i]! / cell);
    const found = cells.get(key);
    if (found) {
      const n = found.members.length;
      found.x = (found.x * n + xs[i]!) / (n + 1);
      found.y = (found.y * n + ys[i]!) / (n + 1);
      found.members.push(i);
    } else {
      const made: Cluster = { x: xs[i]!, y: ys[i]!, members: [i] };
      cells.set(key, made);
      out.push(made);
    }
  }
  return out;
}
