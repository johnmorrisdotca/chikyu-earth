// Places on the picture where the Earth's own names (cities, countries, seas and oceans) must not go: the page's bar, its cards, its notices. Types and pure helpers; the layers lay their names out against them.

/**
 * A rectangle of the view the Earth's names are kept out of, as the property `keepOut` of `<chikyu-space>` and `<chikyu-earth-realistic>` takes it: in the element's own box, in CSS pixels from its top left (`x`, `y`, `w`, `h`),
 * the page's bar, its cards and its notices. The shape is the one `<wakusei-space>` takes for its own `keepOut`.
 *
 * @example
 * ```ts
 * import type { KeepOut } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const bar: KeepOut = { x: 0, y: 270, w: 400, h: 30 };
 * console.log(bar.y + bar.h);
 * ```
 */
export interface KeepOut {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A box as the name layers take it from one another: its top left corner and its size. */
export interface NameBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Cleans a list a page set: whatever is not a rectangle with four finite numbers is dropped, the rest copied.
 *
 * @param value - What the page set (a list of `{ x, y, w, h }`), or anything else.
 * @returns The rectangles, in the order given; none for anything that is not a list.
 *
 * @example
 * ```ts
 * import { readKeepOut } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(readKeepOut([{ x: 0, y: 270, w: 400, h: 30 }, { x: Number.NaN, y: 0, w: 1, h: 1 }, null]).length);
 * ```
 */
export function readKeepOut(value: unknown): KeepOut[] {
  if (!Array.isArray(value)) return [];
  const out: KeepOut[] = [];
  for (const one of value as unknown[]) {
    if (one === null || typeof one !== "object") continue;
    const { x, y, w, h } = one as Record<string, unknown>;
    if (typeof x === "number" && typeof y === "number" && typeof w === "number" && typeof h === "number" && [x, y, w, h].every(Number.isFinite)) out.push({ x, y, w, h });
  }
  return out;
}

/**
 * The same rectangles as boxes the name layers keep clear of (left, top, width, height).
 *
 * @param areas - The rectangles from `readKeepOut`.
 * @returns A box for each.
 *
 * @example
 * ```ts
 * import { keepOutBoxes } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(keepOutBoxes([{ x: 0, y: 270, w: 400, h: 30 }])[0]!.top);
 * ```
 */
export function keepOutBoxes(areas: readonly KeepOut[]): NameBox[] {
  return areas.map((one) => ({ left: one.x, top: one.y, width: one.w, height: one.h }));
}

/**
 * Whether a disc (a city's dot) touches any of the rectangles.
 *
 * @param areas - The rectangles.
 * @param x - The disc's centre x.
 * @param y - The disc's centre y.
 * @param radius - The disc's radius.
 * @returns True where the disc and a rectangle overlap.
 *
 * @example
 * ```ts
 * import { touchesKeepOut } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(touchesKeepOut([{ x: 0, y: 270, w: 400, h: 30 }], 100, 280, 3));
 * ```
 */
export function touchesKeepOut(areas: readonly KeepOut[], x: number, y: number, radius: number): boolean {
  for (const a of areas) if (x + radius > a.x && x - radius < a.x + a.w && y + radius > a.y && y - radius < a.y + a.h) return true;
  return false;
}
