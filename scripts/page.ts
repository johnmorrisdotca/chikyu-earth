// The demo's page, made from demo/index.html and the family's shared head, header, footer and language chooser (family-template.mjs). The Pages build (site.ts) writes it
// into site/, and the dev server serves the same files, so the tests play the page that is published. The page's words, in both languages, are demo/words.js.
import { readFileSync } from "node:fs";

import { WORDS } from "../demo/words.js";
import { FAMILY_SCRIPT, familyFooter, familyHead, familyHeader, familyUnreviewed } from "./family-template.mjs";

const id = "chikyu-earth";
const TITLE = "Chikyu Earth 地球: a line-drawn globe for the web";
const DESCRIPTION = "A line-drawn globe of the world's countries that turns at the Earth's own rate, centred on where you are, with an optional realistic Earth from space and markers for any place. A web component and an SVG string.";

const LINKS = [{ href: "docs/index.html", say: "pageDocs" }, { href: "embed.html", say: "pageEmbed" }];

/** The family's script and the language chooser, then the page's own module. */
const scripts = (script: string): string =>
  `<script>${FAMILY_SCRIPT}</script>\n<script>window.chikyuLanguage = familyLanguage({ id: ${JSON.stringify(id)}, words: ${JSON.stringify(WORDS)} });</script>\n<script type="module" src="kazoku-parts.js"></script>\n<script type="module" src="${script}"></script>`;

/** The page's text with the family's blocks put in where its comments say. */
export function renderIndex(): string {
  const html = readFileSync(new URL("../demo/index.html", import.meta.url), "utf8");
  return html
    .replace("<!--family:head-->", familyHead({ id, title: TITLE, description: DESCRIPTION }))
    .replace("<!--family:header-->", familyHeader({ id, links: LINKS }))
    .replace("<!--family:unreviewed-->", familyUnreviewed({ id }))
    .replace("<!--family:footer-->", familyFooter({ id }))
    .replace(/<!--family:scripts ([\w.-]+)-->/, (_, script: string) => scripts(script));
}

/** The page for printable sheets, made like the demo's, with the family's blocks and its own script. */
export function renderKids(): string {
  const html = readFileSync(new URL("../demo/kids.html", import.meta.url), "utf8");
  return html
    .replace("<!--family:head-->", familyHead({ id, title: WORDS.en.kd_title, description: WORDS.en.kd_description }))
    .replace("<!--family:header-->", familyHeader({ id, links: LINKS }))
    .replace("<!--family:unreviewed-->", familyUnreviewed({ id }))
    .replace("<!--family:footer-->", familyFooter({ id }))
    .replace(/<!--family:scripts ([\w.-]+)-->/, (_, script: string) => scripts(script));
}

/** The page for the passes over a place, made like the demo's, with the family's blocks and its own script. */
export function renderPasses(): string {
  const html = readFileSync(new URL("../demo/passes.html", import.meta.url), "utf8");
  return html
    .replace("<!--family:head-->", familyHead({ id, title: WORDS.en.ps_title, description: WORDS.en.ps_description }))
    .replace("<!--family:header-->", familyHeader({ id, links: LINKS }))
    .replace("<!--family:unreviewed-->", familyUnreviewed({ id }))
    .replace("<!--family:footer-->", familyFooter({ id }))
    .replace(/<!--family:scripts ([\w.-]+)-->/, (_, script: string) => scripts(script));
}

/** demo/passes-embed.html, the frame for the passes: plain, no family blocks. */
export function renderPassesEmbed(): string {
  return readFileSync(new URL("../demo/passes-embed.html", import.meta.url), "utf8");
}

/** demo/embed.html, the frame a page puts in an iframe: plain, no family blocks. */
export function renderEmbed(): string {
  return readFileSync(new URL("../demo/embed.html", import.meta.url), "utf8");
}
