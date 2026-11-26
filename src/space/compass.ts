// The compass mark on a ride's picture: a small dial in the element's shadow root with an arrow that points to north, a dot on its rim for the way the satellite is going, and the heading in words ("Heading SE 128°"). It is a few DOM nodes, not the graphics card's,
// and it is changed only by the draw that moves it, and only when what it shows has changed by half a degree: a picture at rest touches nothing.
import { compassPoint, type CompassPoint } from "../flat/track-state.ts";
import type { RideTrack } from "./scene.ts";

/** The two languages' words of the compass. `{point}` is the point of the compass and `{deg}` the bearing in whole degrees. */
export const COMPASS_WORDS = {
  en: { north: "N", heading: "Heading {point} {deg}°", label: "Compass: north is shown by the arrow. Heading {point}, {deg} degrees.", points: { N: "N", NE: "NE", E: "E", SE: "SE", S: "S", SW: "SW", W: "W", NW: "NW" } as Record<CompassPoint, string> },
  ja: { north: "北", heading: "進行方向 {point} {deg}°", label: "方位磁針：矢印が北を指します。進行方向は{point}、{deg}度。", points: { N: "北", NE: "北東", E: "東", SE: "南東", S: "南", SW: "南西", W: "西", NW: "北西" } as Record<CompassPoint, string> },
} as const;

/** The styles of the compass (`#compass`, in `#compass-place`) in an element's shadow root. `#compass-place` is a grid over the whole picture: a gap of the offset's size on the corner's two sides (it gives way when the picture is too small, so the compass never leaves it), and the compass in the cell beside them. The dial is white lines on a dark disc, the way-it-goes dot yellow, so it reads on the sea, the land, the night and the day alike; `--chikyu-compass-colour` and `--chikyu-compass-travel` change them. */
export const COMPASS_STYLE =
  "#compass-place{position:absolute;inset:0;display:grid;grid-template-columns:minmax(0,var(--compass-x,8px)) max-content;grid-template-rows:minmax(0,var(--compass-y,8px)) max-content;justify-content:start;align-content:start;pointer-events:none}#compass-place[data-right]{grid-template-columns:max-content minmax(0,var(--compass-x,8px));justify-content:end}#compass-place[data-bottom]{grid-template-rows:max-content minmax(0,var(--compass-y,8px));align-content:end}#compass{grid-column:2;grid-row:2;justify-self:start;align-self:start;display:flex;flex-direction:column;align-items:center;gap:2px;pointer-events:none;color:var(--chikyu-compass-colour,#fff);font:11px/1.2 system-ui,-apple-system,sans-serif}#compass-place[data-right] #compass{grid-column:1}#compass-place[data-bottom] #compass{grid-row:1}#compass[hidden]{display:none}#compass svg{width:64px;height:64px;display:block;overflow:visible}#compass .disc{fill:#0b0e14b3;stroke:currentColor;stroke-opacity:.55;stroke-width:1}#compass .north{fill:currentColor}#compass .south{fill:currentColor;fill-opacity:.35}#compass .travel{fill:var(--chikyu-compass-travel,#ffd166);stroke:#0b0e14;stroke-width:1}#compass text{fill:currentColor;font:600 11px system-ui,-apple-system,sans-serif;text-anchor:middle;dominant-baseline:central;paint-order:stroke;stroke:#0b0e14;stroke-width:2.5px}#compass .words{background:#0b0e14b3;padding:1px 6px;border-radius:4px;white-space:nowrap}#compass .words[hidden]{display:none}";

/** The compass's markup: put it in the shadow root and hand it to `createCompass`. */
export const COMPASS_HTML =
  '<div id="compass-place"><div id="compass" role="img" hidden><svg viewBox="-36 -36 72 72" aria-hidden="true"><circle class="disc" r="25"></circle><g class="arrow"><path class="north" d="M0 -21 L5 -3 L0 -7 L-5 -3 Z"></path><path class="south" d="M0 21 L4 4 L0 7 L-4 4 Z"></path></g><text class="n" x="0" y="-31">N</text><circle class="travel" r="3.4" cx="0" cy="-25"></circle></svg><span class="words"></span></div></div>';

export type CompassMode = "full" | "north" | "off";

/** Read the attribute `compass`: `off` takes the compass away, `north` shows the arrow without the words, anything else (or nothing) shows both. */
export function readCompass(value: string | null): CompassMode {
  const text = (value ?? "").trim().toLowerCase();
  return text === "off" || text === "false" || text === "no" || text === "none" ? "off" : text === "north" ? "north" : "full";
}

/**
 * The corners of the picture the compass of a ride can be put in (the attribute `compass-place`, the property `compassPlace`).
 *
 * @example
 * ```ts
 * import type { CompassPlace } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const corner: CompassPlace = "top-right";
 * console.log(corner);
 * ```
 */
export type CompassPlace = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/**
 * How far the compass is from its corner, in pixels: `x` from the side and `y` from the top or the bottom (the attribute `compass-offset`, the property `compassOffset`).
 *
 * @example
 * ```ts
 * import type { CompassOffset } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const offset: CompassOffset = { x: 16, y: 96 };
 * console.log(`${offset.x},${offset.y}`);
 * ```
 */
export interface CompassOffset {
  x: number;
  y: number;
}

/**
 * The compass's corner when nothing is set: the top-left, where it always was.
 *
 * @example
 * ```ts
 * import { COMPASS_PLACE } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(COMPASS_PLACE);
 * ```
 */
export const COMPASS_PLACE: CompassPlace = "top-left";

/**
 * The compass's offset when nothing is set: 8 pixels in from both sides of its corner, where it always was.
 *
 * @example
 * ```ts
 * import { COMPASS_OFFSET } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(COMPASS_OFFSET.x, COMPASS_OFFSET.y);
 * ```
 */
export const COMPASS_OFFSET: Readonly<CompassOffset> = { x: 8, y: 8 };

const COMPASS_PLACES: readonly CompassPlace[] = ["top-left", "top-right", "bottom-left", "bottom-right"];

/**
 * Read the attribute `compass-place`: one of the four corners, in any case, or the top-left corner for anything else (or nothing).
 *
 * @param value - The attribute's text, or `null` when it is not set.
 * @returns The corner.
 *
 * @example
 * ```ts
 * import { readCompassPlace } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(readCompassPlace("Bottom-Right"), readCompassPlace("middle"));
 * ```
 */
export function readCompassPlace(value: string | null): CompassPlace {
  const text = (value ?? "").trim().toLowerCase();
  return COMPASS_PLACES.find((place) => place === text) ?? COMPASS_PLACE;
}

/**
 * Read the attribute `compass-offset`: `x,y` in pixels from the corner (a space may stand for the comma and `px` may follow a number), or one number for both. Each is 0 or more; anything else (or nothing) is 8,8.
 *
 * @param value - The attribute's text, or `null` when it is not set.
 * @returns The offset in pixels.
 *
 * @example
 * ```ts
 * import { readCompassOffset } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(readCompassOffset("16,96"), readCompassOffset("-3,x"));
 * ```
 */
export function readCompassOffset(value: string | null): CompassOffset {
  const parts = (value ?? "").trim().toLowerCase().split(/\s*,\s*|\s+/);
  if (parts.length > 2) return { ...COMPASS_OFFSET };
  const numbers = parts.map((part) => (/^\d+(\.\d+)?(px)?$/.test(part) ? parseFloat(part) : NaN));
  if (numbers.some((n) => !Number.isFinite(n))) return { ...COMPASS_OFFSET };
  return { x: numbers[0]!, y: numbers[1] ?? numbers[0]! };
}

export interface Compass {
  /** Put the compass in a corner, `offset` pixels in from it; the offset is held to what the picture has room for, so the compass is always inside it. */
  place(place: CompassPlace, offset: CompassOffset): void;
  /** Show what the last draw found (or hide the compass for `null`). Changes the page only when something it shows moved by half a degree (the words: a whole degree), the language or the mode changed, so a view at rest does nothing. */
  update(track: RideTrack | null, lang: "en" | "ja", mode: CompassMode): void;
  /** What the compass shows now, for a test: the angle of the arrow, the angle of the dot and the words; `null` when it is hidden. */
  readonly shown: { northDeg: number; travelDeg: number | null; text: string } | null;
  /** The compass's own box (the dial and the heading label) in the element's own pixels from its top left, for the names that keep clear of it; `null` when it is hidden. Reads the page's layout, so it is asked once a draw, not more. */
  readonly box: { left: number; top: number; width: number; height: number } | null;
}

/** Take the markup the element put in its shadow root and make the compass of it. */
export function createCompass(root: ShadowRoot): Compass {
  const box = root.getElementById("compass") as HTMLElement;
  const slot = root.getElementById("compass-place") as HTMLElement;
  const arrow = box.querySelector(".arrow") as SVGGElement;
  const letter = box.querySelector("text.n") as SVGTextElement;
  const dot = box.querySelector(".travel") as SVGCircleElement;
  const words = box.querySelector(".words") as HTMLElement;
  let key = "";
  let shown: { northDeg: number; travelDeg: number | null; text: string } | null = null;
  return {
    place(place, offset) {
      slot.toggleAttribute("data-right", place.endsWith("right"));
      slot.toggleAttribute("data-bottom", place.startsWith("bottom"));
      slot.style.setProperty("--compass-x", `${offset.x}px`);
      slot.style.setProperty("--compass-y", `${offset.y}px`);
    },
    update(track, lang, mode) {
      if (!track || mode === "off" || track.northDeg === null) {
        if (!box.hidden) box.hidden = true;
        key = "";
        shown = null;
        return;
      }
      const north = Math.round(track.northDeg * 2) / 2;
      const travel = track.travelDeg === null ? null : Math.round(track.travelDeg * 2) / 2;
      const bearing = Math.round(track.bearingDeg) % 360;
      const next = `${north}|${travel}|${bearing}|${lang}|${mode}`;
      if (next === key && !box.hidden) return;
      key = next;
      const set = COMPASS_WORDS[lang];
      const text = set.heading.replace("{point}", set.points[compassPoint(bearing)]).replace("{deg}", String(bearing));
      arrow.setAttribute("transform", `rotate(${north})`);
      // the letter stays upright, at the arrow's tip
      const a = north * (Math.PI / 180);
      letter.setAttribute("x", (31 * Math.sin(a)).toFixed(2));
      letter.setAttribute("y", (-31 * Math.cos(a)).toFixed(2));
      if (letter.textContent !== set.north) letter.textContent = set.north;
      if (travel === null) dot.setAttribute("visibility", "hidden");
      else {
        dot.removeAttribute("visibility");
        const t = travel * (Math.PI / 180);
        dot.setAttribute("cx", (25 * Math.sin(t)).toFixed(2));
        dot.setAttribute("cy", (-25 * Math.cos(t)).toFixed(2));
      }
      words.textContent = text;
      words.hidden = mode === "north";
      box.setAttribute("aria-label", set.label.replace("{point}", set.points[compassPoint(bearing)]).replace("{deg}", String(bearing)));
      box.lang = lang;
      if (box.hidden) box.hidden = false;
      shown = { northDeg: north, travelDeg: travel, text };
    },
    get shown() {
      return shown;
    },
    get box() {
      if (box.hidden) return null;
      const at = box.getBoundingClientRect();
      if (at.width === 0 || at.height === 0) return null;
      const over = slot.getBoundingClientRect();
      return { left: at.left - over.left, top: at.top - over.top, width: at.width, height: at.height };
    },
  };
}
