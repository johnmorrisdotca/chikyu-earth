// The credit on the two bare pages made to sit in an iframe (the globe frame and the passes frame). They have no header or footer of the family's, so the page that is embedded names its sources itself,
// with a link to every credit, and a reader sees it without opening anything.
const NOTICE = "https://github.com/johnmorrisdotca/chikyu-earth/blob/main/NOTICE.md";

/** What a globe frame draws on, for its credit line: the look, and whether satellites are in it. */
export type FrameSources = { look: string | null; satellites: boolean };

/** The sources of one globe frame, in English or Japanese: only the ones the picture really uses. */
export function globeCreditText(on: FrameSources, ja: boolean): string {
  const parts = ja ? ["輪郭：Natural Earth。"] : ["Outlines: Natural Earth."];
  if (on.look === "realistic") parts.push(ja ? "画像：NASA。" : "Pictures: NASA.");
  if (on.look === "space") parts.push(ja ? "画像：NASAほか。天体の位置：astronomy-engine。" : "Pictures: NASA and others. Positions: astronomy-engine.");
  if (on.look === "space" && on.satellites) parts.push(ja ? "軌道データ：CelesTrak、Space-Track.org。" : "Orbits: CelesTrak, Space-Track.org.");
  // Japanese has no space between sentences; the link's own words stand off by one space in both languages
  return `${parts.join(ja ? "" : " ")} ${ja ? "出典一覧" : "All credits"}`;
}

/** The link to NOTICE.md, with the words given. */
function creditLink(text: string): HTMLAnchorElement {
  const link = document.createElement("a");
  link.dataset["testid"] = "frame-credit";
  link.href = NOTICE;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = text;
  return link;
}

/** Puts the credit in the top corner of the globe frame (the corner the buttons of a frame never use), in English or Japanese. */
export function globeCredit(on: FrameSources, ja: boolean): void {
  const link = creditLink(globeCreditText(on, ja));
  link.style.cssText = "position:fixed;left:6px;top:6px;z-index:5;max-width:calc(100% - 12px);padding:1px 6px;border-radius:4px;background:rgba(11,20,36,.78);color:#d6e0f0;font:.7rem/1.4 system-ui,sans-serif;text-decoration:underline";
  document.body.append(link);
}

/** Puts the credit under the list of passes, in the flow of the page, in English or Japanese. The list names the orbit data; this adds the link to every credit. */
export function passesCredit(ja: boolean): void {
  const line = document.createElement("p");
  line.style.cssText = "margin:4px 0 0;font:.8rem/1.4 system-ui,sans-serif";
  line.append(creditLink(ja ? "出典の一覧（NOTICE.md）" : "Every credit (NOTICE.md)"));
  document.body.append(line);
}
