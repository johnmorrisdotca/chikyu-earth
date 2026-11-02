// Build the demo into site/ for GitHub Pages, served at /chikyu-earth/: the page and the embed frame (made by page.ts from the family's shared header and footer), their scripts
// (split, so three.js is its own file fetched only when the realistic look is chosen), the stylesheets, the textures, and the kazoku-ui parts the header uses.
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import { renderEmbed, renderIndex } from "./page.ts";

const at = (path: string) => new URL(`../${path}`, import.meta.url).pathname;

await rm(at("site/"), { recursive: true, force: true });
await mkdir(at("site/"), { recursive: true });
await build({
  entryPoints: [at("demo/demo.ts"), at("demo/embed.ts")],
  bundle: true,
  splitting: true,
  format: "esm",
  minify: true,
  outdir: at("site/"),
  chunkNames: "[name]-[hash]",
  logLevel: "silent",
});
// The family header's language picker and theme switch: one small module for every page of the site.
await writeFile(at("site/kazoku-parts.src.js"), `import "@johnmorrisdotca/kazoku-ui/language-picker/define";\nimport "@johnmorrisdotca/kazoku-ui/theme-switch/define";\n`);
await build({ entryPoints: [at("site/kazoku-parts.src.js")], outfile: at("site/kazoku-parts.js"), bundle: true, format: "esm", minify: true, logLevel: "silent", absWorkingDir: at("") });
await rm(at("site/kazoku-parts.src.js"));
await cp(at("demo/demo.css"), at("site/demo.css"));
await cp(at("demo/family.css"), at("site/family.css"));
await cp(at("textures"), at("site/textures"), { recursive: true });
await writeFile(at("site/index.html"), renderIndex(), "utf8");
await writeFile(at("site/embed.html"), renderEmbed(), "utf8");
console.log("site built: index.html, embed.html, demo.js, embed.js, kazoku-parts.js, demo.css, family.css, textures/");
