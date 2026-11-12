// Places on the picture where the sky's names must not go: a page's own text laid over the element. Types and pure helpers; `host.ts` measures and uses them.

/**
 * A place where the sky's names must not go, as the property `keepClear` of `<chikyu-space>` and `<chikyu-earth-realistic>` takes it: a rectangle in the element's own CSS pixels from its top left, or an element of the page whose box is read (on a resize, not every frame).
 *
 * @example
 * ```ts
 * import type { SkyKeepClear } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const areas: SkyKeepClear[] = [{ x: 24, y: 40, width: 480, height: 220 }];
 * console.log(areas.length);
 * ```
 */
export type SkyKeepClear = { x: number; y: number; width: number; height: number } | { getBoundingClientRect(): { left: number; top: number; right: number; bottom: number } };

/** A keep-clear area as the layer holds it: its edges, from the picture's top left, in CSS pixels. */
export interface KeepBox {
  l: number;
  t: number;
  r: number;
  b: number;
}

/**
 * The edges of a keep-clear area, from the picture's top left.
 *
 * @param area - A rectangle in the picture's own pixels, or an element of the page.
 * @param own - The picture's box on the page (`getBoundingClientRect`), to read an element's box against.
 * @param into - The box to write, or one is made.
 * @returns The box.
 */
export function keepBox(area: SkyKeepClear, own: { left: number; top: number }, into: KeepBox = { l: 0, t: 0, r: 0, b: 0 }): KeepBox {
  if ("getBoundingClientRect" in area) {
    const rect = area.getBoundingClientRect();
    into.l = rect.left - own.left;
    into.t = rect.top - own.top;
    into.r = rect.right - own.left;
    into.b = rect.bottom - own.top;
  } else {
    into.l = area.x;
    into.t = area.y;
    into.r = area.x + area.width;
    into.b = area.y + area.height;
  }
  return into;
}

/**
 * Whether a box touches any of the keep-clear areas.
 *
 * @param areas - The areas, from `keepBox`.
 * @param left - The box's left.
 * @param top - The top.
 * @param right - The right.
 * @param bottom - The bottom.
 * @returns True where the box and an area overlap.
 */
export function touchesKeep(areas: readonly KeepBox[], left: number, top: number, right: number, bottom: number): boolean {
  for (const a of areas) if (left < a.r && right > a.l && top < a.b && bottom > a.t) return true;
  return false;
}

/**
 * Whether a point is inside any of the keep-clear areas.
 *
 * @param areas - The areas, from `keepBox`.
 * @param x - The point's x.
 * @param y - The point's y.
 * @returns True where the point is in an area.
 */
export function inKeep(areas: readonly KeepBox[], x: number, y: number): boolean {
  for (const a of areas) if (x >= a.l && x <= a.r && y >= a.t && y <= a.b) return true;
  return false;
}
