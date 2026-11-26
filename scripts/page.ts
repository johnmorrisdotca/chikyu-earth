// The demo's page, made from demo/index.html and the family's shared head, header, footer and language chooser (family-template.mjs). The Pages build (site.ts) writes it
// into site/, and the dev server serves the same files, so the tests play the page that is published. The page's words, in both languages, are demo/words.js.
import { readFileSync } from "node:fs";

import { pageCreditsHtml, pageHeaderHtml, type PageTexts } from "@johnmorrisdotca/kazoku-ui/page-frame";
import { WORDS } from "../demo/words.js";
import { FAMILY_SCRIPT, familyFooter, familyHead, familyHeader, familyUnreviewed } from "./family-template.mjs";

const id = "chikyu-earth";
const TITLE = "Chikyu Earth 地球: a line-drawn globe for the web";
const DESCRIPTION = "A line-drawn globe of the world's countries that turns at the Earth's own rate, centred on the place you give it, with an optional realistic Earth from space and markers for any place. A web component and an SVG string.";

/** Where every credit is written in full. */
const NOTICE = "https://github.com/johnmorrisdotca/chikyu-earth/blob/main/NOTICE.md";

/** The family's footer, with a link to every credit beside the one-line credit, so a reader need not open anything to find the sources. */
const footer = (): string => familyFooter({ id }).replace('<span data-say="foot"></span>', `<span><span data-say="foot"></span> <a href="${NOTICE}" data-say="creditsAll"></a></span>`);

const LINKS = [{ href: "docs/index.html", say: "pageDocs" }, { href: "embed.html", say: "pageEmbed" }];

/** The family's script and the language chooser, then the page's own module. */
const scripts = (script: string): string =>
  `<script>${FAMILY_SCRIPT}</script>\n<script>window.chikyuLanguage = familyLanguage({ id: ${JSON.stringify(id)}, words: ${JSON.stringify(WORDS)} });</script>\n<script type="module" src="kazoku-parts.js"></script>\n<script type="module" src="${script}"></script>`;

const said = WORDS as { en: Record<string, string>; ja: Record<string, string> };

/** The family's page frame, in place of `<!--frame:header-->` and `<!--frame:credits-->`. A Japanese title is one the page already has. */
function frame(html: string, title: string, description: string, ja?: { title: string; description: string }, embed = false, creditLine?: { en: string; ja: string }): string {
  const name = "Chikyu Earth 地球";
  const jaName = "地球 Chikyu Earth";
  const rest = (value: string, prefix: string): string => (value.startsWith(prefix) ? value.slice(prefix.length).replace(/^[:\s]+/, "") || value : value);
  const texts: PageTexts = { en: { name, what: rest(title, name), description } };
  if (ja) texts.ja = { name: jaName, what: rest(ja.title, jaName), description: ja.description };
  // An embed already names its sources with the corner link. The page-frame line is that same short credit and has no second link, so it does not sit on the picture or count as another control.
  const credits = embed && creditLine !== undefined
    ? pageCreditsHtml(creditLine, { embed: true })
    : pageCreditsHtml({ en: said.en.credits!, ja: said.ja.credits! }, { href: NOTICE, embed });
  const header = embed ? "" : pageHeaderHtml(texts, { meta: true, sheets: "kids.html" });
  return html.replace("<!--frame:header-->", header).replace("<!--frame:credits-->", credits);
}

/** The page's text with the family's blocks put in where its comments say. */
export function renderIndex(): string {
  const html = readFileSync(new URL("../demo/index.html", import.meta.url), "utf8");
  return frame(html, TITLE, DESCRIPTION)
    .replace("<!--family:head-->", familyHead({ id, title: TITLE, description: DESCRIPTION }))
    .replace("<!--family:header-->", familyHeader({ id, links: LINKS }))
    .replace("<!--family:unreviewed-->", familyUnreviewed({ id }))
    .replace("<!--family:footer-->", footer())
    .replace(/<!--family:scripts ([\w.-]+)-->/, (_, script: string) => scripts(script));
}

/** The page for printable sheets, made like the demo's, with the family's blocks and its own script. */
export function renderKids(): string {
  const html = readFileSync(new URL("../demo/kids.html", import.meta.url), "utf8");
  return frame(html, WORDS.en.kd_title, WORDS.en.kd_description, { title: WORDS.ja.kd_title, description: WORDS.ja.kd_description })
    .replace("<!--family:head-->", familyHead({ id, title: WORDS.en.kd_title, description: WORDS.en.kd_description }))
    .replace("<!--family:header-->", familyHeader({ id, links: LINKS }))
    .replace("<!--family:unreviewed-->", familyUnreviewed({ id }))
    .replace("<!--family:footer-->", footer())
    .replace(/<!--family:scripts ([\w.-]+)-->/, (_, script: string) => scripts(script));
}

/** The page for the passes over a place, made like the demo's, with the family's blocks and its own script. */
export function renderPasses(): string {
  const html = readFileSync(new URL("../demo/passes.html", import.meta.url), "utf8");
  return frame(html, WORDS.en.ps_title, WORDS.en.ps_description, { title: WORDS.ja.ps_title, description: WORDS.ja.ps_description })
    .replace("<!--family:head-->", familyHead({ id, title: WORDS.en.ps_title, description: WORDS.en.ps_description }))
    .replace("<!--family:header-->", familyHeader({ id, links: LINKS }))
    .replace("<!--family:unreviewed-->", familyUnreviewed({ id }))
    .replace("<!--family:footer-->", footer())
    .replace(/<!--family:scripts ([\w.-]+)-->/, (_, script: string) => scripts(script));
}

/** The page for one satellite's ground track on chizu's world map. */
export function renderTrack(): string {
  const html = readFileSync(new URL("../demo/track.html", import.meta.url), "utf8");
  return frame(html, WORDS.en.tr_title, WORDS.en.tr_description, { title: WORDS.ja.tr_title, description: WORDS.ja.tr_description })
    .replace("<!--family:head-->", familyHead({ id, title: WORDS.en.tr_title, description: WORDS.en.tr_description }))
    .replace("<!--family:header-->", familyHeader({ id, links: LINKS }))
    .replace("<!--family:unreviewed-->", familyUnreviewed({ id }))
    .replace("<!--family:footer-->", footer())
    .replace(/<!--family:scripts ([\w.-]+)-->/, (_, script: string) => scripts(script));
}

/** The page for the flat map of the satellites, made like the demo's, with the family's blocks and its own script. */
export function renderFlat(): string {
  const html = readFileSync(new URL("../demo/flat.html", import.meta.url), "utf8");
  return frame(html, WORDS.en.fl_title, WORDS.en.fl_description, { title: WORDS.ja.fl_title, description: WORDS.ja.fl_description })
    .replace("<!--family:head-->", familyHead({ id, title: WORDS.en.fl_title, description: WORDS.en.fl_description }))
    .replace("<!--family:header-->", familyHeader({ id, links: LINKS }))
    .replace("<!--family:unreviewed-->", familyUnreviewed({ id }))
    .replace("<!--family:footer-->", footer())
    .replace(/<!--family:scripts ([\w.-]+)-->/, (_, script: string) => scripts(script));
}

/** demo/passes-embed.html, the frame for the passes: the credit line, and no family header. */
export function renderPassesEmbed(): string {
  const html = readFileSync(new URL("../demo/passes-embed.html", import.meta.url), "utf8");
  return frame(html, "Chikyu Earth 地球: passes", "The passes over a place, in a frame for another page.", undefined, true);
}

/** demo/embed.html, the frame a page puts in an iframe: the credit line, and no family header. */
export function renderEmbed(): string {
  const html = readFileSync(new URL("../demo/embed.html", import.meta.url), "utf8");
  return frame(html, "Chikyu Earth 地球: embed", "A globe in a frame for another page.", undefined, true, { en: "Outlines: Natural Earth.", ja: "輪郭：Natural Earth。" });
}

/** The code builder, which is its own page and still gets the family's page frame. */
export function renderBuilder(): string {
  const html = readFileSync(new URL("../demo/builder.html", import.meta.url), "utf8");
  return frame(html, "Chikyu Earth 地球: code builder", "Choose a place, how the globe is drawn and its size, and copy the code that puts exactly that in your page.");
}

/** The full-screen Earth, with the page frame in its top bar. */
export function renderFullscreen(): string {
  const html = readFileSync(new URL("../demo/fullscreen.html", import.meta.url), "utf8");
  return frame(html, "Chikyu Earth 地球: full screen", "The realistic Earth filling the whole screen, dark, with every satellite group at once: drag anywhere to turn, the wheel to zoom.");
}
