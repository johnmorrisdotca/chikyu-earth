// Build the demo into site/: one bundled script, the stylesheet and the page, served at /chikyu-earth/.
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";

const at = (path: string) => new URL(`../${path}`, import.meta.url).pathname;

await mkdir(at("site/"), { recursive: true });
await build({
  entryPoints: [at("demo/demo.ts")],
  bundle: true,
  format: "esm",
  minify: true,
  outfile: at("site/demo.js"),
  logLevel: "silent",
});
await cp(at("demo/demo.css"), at("site/demo.css"));
await writeFile(at("site/index.html"), await readFile(at("demo/index.html"), "utf8"), "utf8");
console.log("site built: site/index.html, demo.js, demo.css");
