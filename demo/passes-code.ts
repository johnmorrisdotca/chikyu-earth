// The code that puts the passes in a page, for each way a page is made, and the address of the embed page that shows them. Pure: no DOM. The passes page fills the family's embed panel from here,
// and a test writes each snippet out and checks it against the package.
import { embedSnippet, type EmbedKind } from "@johnmorrisdotca/kazoku-ui/embed-panel";
import { PACKAGE, SITE } from "./embed-code.ts";

declare const __CHIKYU_VERSION__: string | undefined;
const cdn = (): string => `https://cdn.jsdelivr.net/npm/${PACKAGE}@${typeof __CHIKYU_VERSION__ === "string" ? __CHIKYU_VERSION__ : "latest"}`;

export type PassSat = "iss" | "css" | "hst" | "all";
/** The satellites the panel offers and their NORAD numbers. */
export const PASS_SATELLITES: Readonly<Record<Exclude<PassSat, "all">, number>> = { iss: 25544, css: 48274, hst: 20580 };
export const PASS_DAYS = [3, 5, 7, 10] as const;
/** The three bright satellites as OMM JSON, from this site's own files (the scheduled build's snapshot of CelesTrak and Space-Track). */
export const ELEMENTS_URL = `${SITE}elements/bright.json`;
export const CREDIT = "Orbit data: CelesTrak (celestrak.org) and Space-Track.org (USSPACECOM)";

/** What the reader chose: the place (and its time zone, when known), the satellite and the days. */
export interface PassesChoice {
  lat: number;
  lon: number;
  /** An IANA time zone name such as `Asia/Tokyo`, or an empty text when the place's zone is not known (the offset is then worked out from the longitude). */
  zone: string;
  sat: PassSat;
  days: number;
}

/** What the embed page reads: the place, the satellite, the days, the time zone and the language. */
export function passesQuery(c: PassesChoice, lang = "en"): string {
  const query = new URLSearchParams({ lat: String(c.lat), lon: String(c.lon), sat: c.sat, days: String(c.days) });
  if (c.zone) query.set("tz", c.zone);
  if (lang === "ja") query.set("lang", "ja");
  return query.toString().replace(/%2F/g, "/");
}

/** The attributes `<chikyu-passes>` is given for a choice, in the order they are written. */
export function passesAttrs(c: PassesChoice): [string, string][] {
  return [
    ["latitude", String(c.lat)],
    ["longitude", String(c.lon)],
    ["days", String(c.days)],
    ...(c.sat === "all" ? [] : ([["satellite", String(PASS_SATELLITES[c.sat])]] as [string, string][])),
    c.zone ? ["time-zone", c.zone] : ["utc-offset", String(Math.round(c.lon / 15))],
    ["elements-src", ELEMENTS_URL],
    ["credit", CREDIT],
  ];
}

/**
 * The code for one way a page is made. `preview` writes the iframe's address as the page sees it (relative), so the picture works wherever the demo is served.
 *
 * @param kind - `html`, `module`, `react`, `vue`, `angular`, `svelte` or `iframe`.
 * @param c - The choices.
 * @param preview - True for the picture beside the code.
 * @param size - The iframe's width in pixels.
 */
export function passesCode(kind: EmbedKind, c: PassesChoice, preview = false, size = 480): string {
  return embedSnippet(kind, {
    package: PACKAGE,
    cdn: cdn(),
    tag: "chikyu-passes",
    element: "passes/element",
    entries: [],
    attrs: passesAttrs(c),
    name: "passes",
    iframe: { src: `${preview ? "" : SITE}passes-embed.html?${passesQuery(c)}`, title: "Passes over a place", width: size, height: Math.round(size * 1.4) },
  });
}
