// Build the demo into site/: the script (split, so three.js is its own file fetched only when the realistic look is chosen), the
// stylesheet, the textures and the page, served at /chikyu-earth/.
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";

const at = (path: string) => new URL(`../${path}`, import.meta.url).pathname;

await mkdir(at("site/"), { recursive: true });
await build({
  entryPoints: [at("demo/demo.ts")],
  bundle: true,
  splitting: true,
  format: "esm",
  minify: true,
  outdir: at("site/"),
  chunkNames: "[name]-[hash]",
  logLevel: "silent",
});
await cp(at("demo/demo.css"), at("site/demo.css"));
await cp(at("textures"), at("site/textures"), { recursive: true });
await writeFile(at("site/index.html"), await readFile(at("demo/index.html"), "utf8"), "utf8");
console.log("site built: site/index.html, demo.js, demo.css, textures/");
