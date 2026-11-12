// The figures of a sky culture other than the IAU's as lines for the sky layer, the way hoshi-stars lays out the 88 IAU figures (`createFigureLines`): the page says where a direction falls on its screen, and this lays the segments out and says where each figure's lines are.
// hoshi-stars' own does not take a culture (it draws the 88), so this is the same few lines of work over the figures of a culture (`figures(culture)` of its `lines`). Pure, and after the first call nothing is allocated.
import type { LabelStyle } from "@johnmorrisdotca/hoshi-stars/sky-labels";

/** A star's place in the sky, in degrees. */
export interface SkyPoint {
  rightAscension: number;
  declination: number;
}
/** A figure of a culture as lines: its key and the pairs of stars its lines join (hoshi-stars' `CultureFigure`, to the part used here). */
export interface CultureFigureLines {
  id: string;
  segments: ReadonlyArray<readonly [SkyPoint, SkyPoint]>;
}
/** One figure on the screen: where its lines are in `segments`, and its box. */
export interface OnScreen {
  abbreviation: string;
  start: number;
  end: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  x: number;
}
/** What the sky layer needs of a set of figure lines: those of hoshi-stars' `FigureLines` and of `createCultureLines`. */
export interface Lines {
  readonly settings: Readonly<{ strength?: number; reach?: number }>;
  readonly style: LabelStyle;
  readonly segments: ArrayLike<number>;
  readonly count: number;
  readonly figures: readonly OnScreen[];
  opacityOf(figure: OnScreen): number;
  update(project: (rightAscension: number, declination: number, out: { x: number; y: number }) => boolean, view: { width: number; height: number }, avoid?: unknown): number;
  set(next: { strength?: number; lang?: unknown; style?: Partial<LabelStyle> }): void;
}

/**
 * The lines of the figures of a culture.
 *
 * @param figures - The culture's figures, from hoshi-stars' `figures(culture)`.
 * @param strength - How strong the lines are when not lit, 0 to 1.
 * @param styleOf - Makes a label style (hoshi-stars' `labelStyle`) from a partial one.
 * @param style - The look of the names, a partial `LabelStyle`.
 * @returns The lines.
 */
export function createCultureLines(figures: readonly CultureFigureLines[], strength: number, styleOf: (style?: Partial<LabelStyle>) => LabelStyle, style?: Partial<LabelStyle>): Lines {
  let total = 0;
  for (const figure of figures) total += figure.segments.length;
  const segments = new Float32Array(total * 4);
  const onScreen: OnScreen[] = figures.map((figure) => ({ abbreviation: figure.id, start: 0, end: 0, left: 0, top: 0, right: 0, bottom: 0, x: 0 }));
  const a = { x: 0, y: 0 };
  const b = { x: 0, y: 0 };
  let current: { strength?: number; reach?: number } = Object.freeze({ strength });
  let look = styleOf(style);
  let count = 0;
  return {
    get settings() {
      return current;
    },
    get style() {
      return look;
    },
    segments,
    get count() {
      return count;
    },
    figures: onScreen,
    opacityOf() {
      return current.strength ?? 0;
    },
    set(next) {
      current = Object.freeze({ ...current, strength: Math.max(0, Math.min(1, next.strength ?? current.strength ?? 0)) });
      look = styleOf(next.style);
    },
    update(project, view) {
      count = 0;
      for (let i = 0; i < figures.length; i += 1) {
        const out = onScreen[i]!;
        out.start = count;
        let left = Number.POSITIVE_INFINITY;
        let top = Number.POSITIVE_INFINITY;
        let right = Number.NEGATIVE_INFINITY;
        let bottom = Number.NEGATIVE_INFINITY;
        if ((current.strength ?? 0) > 0) {
          const pairs = figures[i]!.segments;
          for (let k = 0; k < pairs.length; k += 1) {
            const from = pairs[k]![0];
            const to = pairs[k]![1];
            if (!project(from.rightAscension, from.declination, a) || !project(to.rightAscension, to.declination, b)) continue;
            if ((a.x < 0 && b.x < 0) || (a.x > view.width && b.x > view.width) || (a.y < 0 && b.y < 0) || (a.y > view.height && b.y > view.height)) continue;
            const at = count * 4;
            segments[at] = a.x;
            segments[at + 1] = a.y;
            segments[at + 2] = b.x;
            segments[at + 3] = b.y;
            count += 1;
            left = Math.min(left, a.x, b.x);
            right = Math.max(right, a.x, b.x);
            top = Math.min(top, a.y, b.y);
            bottom = Math.max(bottom, a.y, b.y);
          }
        }
        out.end = count;
        if (out.end > out.start) {
          out.left = left;
          out.right = right;
          out.top = top;
          out.bottom = bottom;
          out.x = Math.max(0, Math.min(view.width, (left + right) / 2));
        }
      }
      return count;
    },
  };
}
