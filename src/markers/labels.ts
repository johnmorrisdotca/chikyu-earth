// Which labels to show: the most important first, each beside its dot, none over another label or a dot's label slot already taken. Pure.

/**
 * One label to place: its dot's centre and radius, its box's size and its priority.
 *
 * @example
 * ```ts
 * import type { LabelItem } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * const label: LabelItem = { x: 100, y: 100, r: 4, w: 60, h: 20, priority: 1 };
 * console.log(label.w);
 * ```
 */
export interface LabelItem {
  /** The dot's centre and radius. */
  x: number;
  y: number;
  r: number;
  /** The label's box size. */
  w: number;
  h: number;
  /** Higher is placed first. */
  priority: number;
}

/**
 * Where one label goes: which item it is and its box's top-left corner.
 *
 * @example
 * ```ts
 * import { placeLabels, type Placement } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * const placed: Placement[] = placeLabels([{ x: 100, y: 100, r: 4, w: 60, h: 20, priority: 1 }], 300, 300, 10);
 * console.log(placed[0]);
 * ```
 */
export interface Placement {
  /** Index into the items given. */
  item: number;
  /** The label box's top-left corner. */
  left: number;
  top: number;
}

interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}

const GAP = 3;

/**
 * Place up to `max` labels inside `width` x `height`. Each label is tried to the right of its dot, then to the left, above and below; the first spot that is inside
 * and free of the labels already placed wins. Items are taken highest priority first (a tie keeps the order given). The cost is the number of items times at most
 * four tries against a grid of what is placed.
 *
 * @param items - The dots and the size of each one's label.
 * @param width - The width of the area the labels must stay inside, in pixels.
 * @param height - The height of that area, in pixels.
 * @param max - The most labels to place.
 * @param cell - The side of the grid cell used to find overlaps, in pixels.
 * @returns A placement for each label that fits; the others are left out.
 *
 * @example
 * ```ts
 * import { placeLabels } from "@johnmorrisdotca/chikyu-earth/markers";
 *
 * const items = [
 *   { x: 100, y: 100, r: 4, w: 60, h: 20, priority: 1 },
 *   { x: 110, y: 104, r: 4, w: 60, h: 20, priority: 9 },
 * ];
 * console.log(placeLabels(items, 300, 300, 10).map((place) => place.item));
 * ```
 */
export function placeLabels(items: readonly LabelItem[], width: number, height: number, max: number, cell = 64): Placement[] {
  const order = items.map((_, i) => i).sort((a, b) => items[b]!.priority - items[a]!.priority || a - b);
  const grid = new Map<number, Box[]>();
  const placed: Placement[] = [];
  const keys = (box: Box): number[] => {
    const out: number[] = [];
    for (let gx = Math.floor(box.l / cell); gx <= Math.floor(box.r / cell); gx += 1) for (let gy = Math.floor(box.t / cell); gy <= Math.floor(box.b / cell); gy += 1) out.push(gx * 100_003 + gy);
    return out;
  };
  const free = (box: Box): boolean => {
    for (const key of keys(box)) for (const other of grid.get(key) ?? []) if (box.l < other.r && box.r > other.l && box.t < other.b && box.b > other.t) return false;
    return true;
  };
  for (const index of order) {
    if (placed.length >= max) break;
    const it = items[index]!;
    const tries: [number, number][] = [
      [it.x + it.r + GAP, it.y - it.h / 2],
      [it.x - it.r - GAP - it.w, it.y - it.h / 2],
      [it.x - it.w / 2, it.y - it.r - GAP - it.h],
      [it.x - it.w / 2, it.y + it.r + GAP],
    ];
    for (const [left, top] of tries) {
      const box: Box = { l: left, t: top, r: left + it.w, b: top + it.h };
      if (box.l < 0 || box.t < 0 || box.r > width || box.b > height || !free(box)) continue;
      for (const key of keys(box)) {
        const list = grid.get(key);
        if (list) list.push(box);
        else grid.set(key, [box]);
      }
      placed.push({ item: index, left, top });
      break;
    }
  }
  return placed;
}
