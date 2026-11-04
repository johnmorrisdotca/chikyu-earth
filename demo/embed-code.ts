// The code that puts a globe in a page, for each way a page is made, and the address of the embed page that draws it. Pure: no DOM. The index page and the code builder fill the
// family's embed panel from here, and a test writes each snippet out and checks it against the package.
import { embedSnippet, type EmbedKind } from "@johnmorrisdotca/kazoku-ui/embed-panel";

declare const __CHIKYU_VERSION__: string | undefined;

export const PACKAGE = "@johnmorrisdotca/chikyu-earth";
export const SITE = "https://johnmorrisdotca.github.io/chikyu-earth/";
const cdn = (): string => `https://cdn.jsdelivr.net/npm/${PACKAGE}@${typeof __CHIKYU_VERSION__ === "string" ? __CHIKYU_VERSION__ : "latest"}`;

export type Look = "line" | "thick" | "realistic";
export const LOOKS: readonly Look[] = ["line", "thick", "realistic"];

/** The places the panel can centre the globe on. */
export const PLACES: readonly { id: string; label: string; lon: number; lat: number }[] = [
  { id: "tokyo", label: "Tokyo", lon: 139.7, lat: 35.7 },
  { id: "toronto", label: "Toronto", lon: -79.38, lat: 43.65 },
  { id: "london", label: "London", lon: -0.13, lat: 51.51 },
  { id: "new-york", label: "New York", lon: -74.01, lat: 40.71 },
  { id: "sao-paulo", label: "São Paulo", lon: -46.63, lat: -23.55 },
  { id: "cairo", label: "Cairo", lon: 31.24, lat: 30.04 },
  { id: "nairobi", label: "Nairobi", lon: 36.82, lat: -1.29 },
  { id: "mumbai", label: "Mumbai", lon: 72.88, lat: 19.08 },
  { id: "sydney", label: "Sydney", lon: 151.21, lat: -33.87 },
  { id: "reykjavik", label: "Reykjavik", lon: -21.94, lat: 64.15 },
];

/** The sizes the panel offers. */
export const SIZES = [240, 320, 420, 560] as const;

/** What the reader chose. */
export interface Choice {
  place: string;
  look: Look;
  graticule: boolean;
  size: number;
}

/** The start: Tokyo, the thick line drawing with its graticule, 320 pixels. */
export const START: Choice = { place: "tokyo", look: "thick", graticule: true, size: 320 };

/** `lon,lat` for a place. */
export function centreOf(place: string): string {
  const one = PLACES.find((p) => p.id === place) ?? PLACES[0]!;
  return `${one.lon},${one.lat}`;
}

/** What the embed page reads: the look, the centre and (for the flat looks) the graticule. */
export function embedQuery(c: Choice): string {
  return `look=${c.look}&center=${centreOf(c.place)}${c.graticule && c.look !== "realistic" ? "&graticule=1" : ""}`;
}

/** The credit for what the picture shows. */
export function creditOf(look: Look): string {
  return look === "realistic" ? "The realistic Earth's pictures are NASA's (Blue Marble), public domain." : "Outlines: Natural Earth, public domain.";
}

/**
 * The code for one way a page is made. `preview` writes the iframe's address as the page sees it (relative), so the picture works wherever the demo is served.
 *
 * @param kind - `html`, `module`, `react`, `vue`, `angular`, `svelte` or `iframe`.
 * @param c - The choices.
 * @param preview - True for the picture beside the code.
 */
export function embedCode(kind: EmbedKind, c: Choice, preview = false): string {
  const at = centreOf(c.place);
  const real = c.look === "realistic";
  const code = embedSnippet(kind, {
    package: PACKAGE,
    cdn: cdn(),
    tag: real ? "chikyu-earth-realistic" : "chikyu-earth",
    element: real ? "realistic/element" : "element",
    entries: [],
    attrs: real
      ? [["center", at], ["texture-base", `${cdn()}/dist/textures/`], ["style", `display: block; width: ${c.size}px`]]
      : [["center", at], ["look", c.look], ...(c.graticule ? ([["graticule", ""]] as const) : []), ["size", String(c.size)]],
    name: "earth",
    iframe: { src: `${preview ? "" : SITE}embed.html?${embedQuery(c)}`, title: "The Earth", width: c.size, height: c.size },
  });
  // React takes a style as an object, never as text.
  return kind === "react" ? code.replace(`style="display: block; width: ${c.size}px"`, `style={{ display: "block", width: ${c.size} }}`) : code;
}
