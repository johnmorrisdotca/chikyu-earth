// Build the demo into site/ for GitHub Pages, served at /chikyu-earth/: the page and the embed frame (made by page.ts from the family's shared header and footer), their scripts
// (split, so three.js is its own file fetched only when the realistic look is chosen), the stylesheets, the textures, and the kazoku-ui parts the header uses.
import { existsSync, readFileSync } from "node:fs";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import { wideCss } from "@johnmorrisdotca/kazoku-ui/wide-layout";
import { publishThumbnails, thumbnailHead } from "./family-thumbnail.mjs";
import { renderEmbed, renderIndex, renderKids, renderPasses, renderPassesEmbed } from "./page.ts";

const at = (path: string) => new URL(`../${path}`, import.meta.url).pathname;

const pkg = JSON.parse(readFileSync(at("package.json"), "utf8"));
await rm(at("site/"), { recursive: true, force: true });
await mkdir(at("site/"), { recursive: true });
await build({
  entryPoints: [at("demo/demo.ts"), at("demo/fullscreen.ts"), at("demo/embed.ts"), at("demo/builder.ts"), at("demo/kids.ts"), at("demo/passes.ts"), at("demo/passes-embed.ts")],
  bundle: true,
  splitting: true,
  format: "esm",
  minify: true,
  outdir: at("site/"),
  chunkNames: "[name]-[hash]",
  define: { __CHIKYU_VERSION__: JSON.stringify(pkg.version) },
  logLevel: "silent",
});
// The family header's language picker and theme switch: one small module for every page of the site.
await writeFile(at("site/kazoku-parts.src.js"), `import "@johnmorrisdotca/kazoku-ui/language-picker/define";\nimport "@johnmorrisdotca/kazoku-ui/theme-switch/define";\n`);
await build({ entryPoints: [at("site/kazoku-parts.src.js")], outfile: at("site/kazoku-parts.js"), bundle: true, format: "esm", minify: true, logLevel: "silent", absWorkingDir: at("") });
await rm(at("site/kazoku-parts.src.js"));
await cp(at("demo/demo.css"), at("site/demo.css"));
// the Wide layout's rule, from kazoku-ui, as a stylesheet so the page lays out right before any script runs
await writeFile(at("site/wide.css"), `${wideCss({ side: "22rem" })}\n`, "utf8");
await cp(at("demo/family.css"), at("site/family.css"));
await cp(at("textures"), at("site/textures"), { recursive: true });
// the family's font for the name written on the Earth (Michroma, SIL Open Font License 1.1, with its licence), beside the page: the demo says where it is with `setBodyLabelFontUrl`
await cp(at("node_modules/@johnmorrisdotca/kazoku-ui/dist/body-label/fonts"), at("site/fonts"), { recursive: true });
// the Earth tile pyramid (made by `pnpm tiles`, never committed): served beside the demo when it has been built
// without it, an empty manifest, so the demo's one request for it is answered (no 404 in the console) and the Earth keeps its own pictures
if (existsSync(at(".cache/earth-tiles-out/manifest.json"))) await cp(at(".cache/earth-tiles-out"), at("site/tiles"), { recursive: true });
else {
  await mkdir(at("site/tiles"), { recursive: true });
  await writeFile(at("site/tiles/manifest.json"), JSON.stringify({ tileSize: 512, layers: {} }), "utf8");
}
// the pictures of the Sun, planets and moons (wakusei-planets, an optional peer the demo draws them with): the two smaller widths ship in its package, the sharpest come from the repository by jsDelivr
await cp(at("node_modules/@johnmorrisdotca/wakusei-planets/dist/textures"), at("site/planets"), { recursive: true });
await cp(at("demo/elements"), at("site/elements"), { recursive: true });
await cp(at("demo/missions"), at("site/missions"), { recursive: true });
// the Earth-orbit catalogue (made by scripts/catalogue.ts, never committed): published beside the demo once it has been made
if (existsSync(at("demo/catalogue/manifest.json"))) await cp(at("demo/catalogue"), at("site/catalogue"), { recursive: true });
// The family's card in the demo's <head> (og:image, twitter:image, the icon), and the three pictures published beside it.
const ALT = "Chikyu Earth: the globe as a line drawing over Europe and Africa, and as the realistic Earth over Asia with evening in the east.";
await writeFile(at("site/index.html"), renderIndex().replace("  </head>", `    ${thumbnailHead(pkg, { alt: ALT })}\n  </head>`), "utf8");
publishThumbnails(at(""), at("site/"));
await writeFile(at("site/embed.html"), renderEmbed(), "utf8");
await writeFile(at("site/kids.html"), renderKids(), "utf8");
await writeFile(at("site/passes.html"), renderPasses(), "utf8");
await writeFile(at("site/passes-embed.html"), renderPassesEmbed(), "utf8");
await cp(at("demo/builder.html"), at("site/builder.html"));
await cp(at("demo/fullscreen.html"), at("site/fullscreen.html"));
console.log("site built: index.html, embed.html, kids.html, passes.html, passes-embed.html, builder.html, demo.js, embed.js, kazoku-parts.js, demo.css, family.css, textures/, elements/, missions/");
