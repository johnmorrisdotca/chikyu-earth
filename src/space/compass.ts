// The compass mark on a ride's picture: a small dial in the element's shadow root with an arrow that points to north, a dot on its rim for the way the satellite is going, and the heading in words ("Heading SE 128°"). It is a few DOM nodes, not the graphics card's,
// and it is changed only by the draw that moves it, and only when what it shows has changed by half a degree: a picture at rest touches nothing.
import { compassPoint, type CompassPoint } from "../flat/track-state.ts";
import type { RideTrack } from "./scene.ts";

/** The two languages' words of the compass. `{point}` is the point of the compass and `{deg}` the bearing in whole degrees. */
export const COMPASS_WORDS = {
  en: { north: "N", heading: "Heading {point} {deg}°", label: "Compass: north is shown by the arrow. Heading {point}, {deg} degrees.", points: { N: "N", NE: "NE", E: "E", SE: "SE", S: "S", SW: "SW", W: "W", NW: "NW" } as Record<CompassPoint, string> },
  ja: { north: "北", heading: "進行方向 {point} {deg}°", label: "方位磁針：矢印が北を指します。進行方向は{point}、{deg}度。", points: { N: "北", NE: "北東", E: "東", SE: "南東", S: "南", SW: "南西", W: "西", NW: "北西" } as Record<CompassPoint, string> },
} as const;

/** The styles of the compass (`#compass`) in an element's shadow root. The dial is white lines on a dark disc, the way-it-goes dot yellow, so it reads on the sea, the land, the night and the day alike; `--chikyu-compass-colour` and `--chikyu-compass-travel` change them. */
export const COMPASS_STYLE =
  "#compass{position:absolute;left:8px;top:8px;display:flex;flex-direction:column;align-items:center;gap:2px;pointer-events:none;color:var(--chikyu-compass-colour,#fff);font:11px/1.2 system-ui,-apple-system,sans-serif}#compass[hidden]{display:none}#compass svg{width:64px;height:64px;display:block;overflow:visible}#compass .disc{fill:#0b0e14b3;stroke:currentColor;stroke-opacity:.55;stroke-width:1}#compass .north{fill:currentColor}#compass .south{fill:currentColor;fill-opacity:.35}#compass .travel{fill:var(--chikyu-compass-travel,#ffd166);stroke:#0b0e14;stroke-width:1}#compass text{fill:currentColor;font:600 11px system-ui,-apple-system,sans-serif;text-anchor:middle;dominant-baseline:central;paint-order:stroke;stroke:#0b0e14;stroke-width:2.5px}#compass .words{background:#0b0e14b3;padding:1px 6px;border-radius:4px;white-space:nowrap}#compass .words[hidden]{display:none}";

/** The compass's markup: put it in the shadow root and hand it to `createCompass`. */
export const COMPASS_HTML =
  '<div id="compass" role="img" hidden><svg viewBox="-36 -36 72 72" aria-hidden="true"><circle class="disc" r="25"></circle><g class="arrow"><path class="north" d="M0 -21 L5 -3 L0 -7 L-5 -3 Z"></path><path class="south" d="M0 21 L4 4 L0 7 L-4 4 Z"></path></g><text class="n" x="0" y="-31">N</text><circle class="travel" r="3.4" cx="0" cy="-25"></circle></svg><span class="words"></span></div>';

export type CompassMode = "full" | "north" | "off";

/** Read the attribute `compass`: `off` takes the compass away, `north` shows the arrow without the words, anything else (or nothing) shows both. */
export function readCompass(value: string | null): CompassMode {
  const text = (value ?? "").trim().toLowerCase();
  return text === "off" || text === "false" || text === "no" || text === "none" ? "off" : text === "north" ? "north" : "full";
}

export interface Compass {
  /** Show what the last draw found (or hide the compass for `null`). Changes the page only when something it shows moved by half a degree (the words: a whole degree), the language or the mode changed, so a view at rest does nothing. */
  update(track: RideTrack | null, lang: "en" | "ja", mode: CompassMode): void;
  /** What the compass shows now, for a test: the angle of the arrow, the angle of the dot and the words; `null` when it is hidden. */
  readonly shown: { northDeg: number; travelDeg: number | null; text: string } | null;
}

/** Take the markup the element put in its shadow root and make the compass of it. */
export function createCompass(root: ShadowRoot): Compass {
  const box = root.getElementById("compass") as HTMLElement;
  const arrow = box.querySelector(".arrow") as SVGGElement;
  const letter = box.querySelector("text.n") as SVGTextElement;
  const dot = box.querySelector(".travel") as SVGCircleElement;
  const words = box.querySelector(".words") as HTMLElement;
  let key = "";
  let shown: { northDeg: number; travelDeg: number | null; text: string } | null = null;
  return {
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
  };
}
