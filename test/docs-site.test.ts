// The documentation site's checks, in `pnpm check`. scripts/docs-site.mjs and e2e/docs-site.demo.mjs are the family's documentation generator and its browser test, held to one
// recorded hash each; the generator here is chizu's of 2026-10-13 with the header's language picker (kazoku-ui) turned into the twin-page links, and carries its own version.
// This test reads files and builds nothing: the examples are run by `pnpm docs:check` and by the Pages workflow's `pnpm docs:site`, which need the package built.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

interface DocsSite {
  DOCS_SITE_VERSION: string;
  docsProblems(root: string): string[];
  packageOf(root: string): { job: string | null; docsUrl: string };
}
const docs = (await import(new URL("../scripts/docs-site.mjs", import.meta.url).href)) as DocsSite;

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const pkg = JSON.parse(read("package.json")) as { description: string; scripts: Record<string, string>; devDependencies?: Record<string, string>; dependencies?: Record<string, string> };

const RECORDED = {
  version: "2026-11-03-guide-images",
  "scripts/docs-site.mjs": "8c827fce376b6a4622d610f325e0f92936208a68566d9abed8d96ccdace8096a",
  "e2e/docs-site.demo.mjs": "915d74e4017cf117f8322b712ab2f1fa55058d654ff0fca0e476af85bce5fbf6",
};

test("the generator and its browser test are the recorded files, byte for byte", () => {
  assert.equal(docs.DOCS_SITE_VERSION, RECORDED.version);
  for (const path of ["scripts/docs-site.mjs", "e2e/docs-site.demo.mjs"] as const) assert.equal(sha(path), RECORDED[path], path);
});

test("they are wired in: the scripts, the dev dependencies, the Pages step and the ignored examples folder", () => {
  assert.equal(pkg.scripts["docs:site"], "pnpm build && node scripts/docs-site.mjs build");
  assert.equal(pkg.scripts["docs:check"], "pnpm build && node scripts/docs-site.mjs check");
  assert.equal(pkg.scripts["size"], "node scripts/docs-site.mjs size");
  assert.match(pkg.scripts["test:demo"] ?? "", /pnpm site && node scripts\/docs-site\.mjs build && playwright test/);
  for (const name of ["pagefind", "marked", "esbuild"]) {
    assert.ok(pkg.devDependencies?.[name], name);
    assert.equal(pkg.dependencies?.[name], undefined, `${name} builds the docs and is never a dependency of the package`);
  }
  assert.ok(read(".github/workflows/pages.yml").includes("      - run: pnpm site\n      - run: pnpm docs:site\n"));
  assert.match(read(".gitignore"), /^\.docs-examples\/$/m);
});

test("the docs have no problem: every export has a TSDoc summary, @param, @returns and an @example that imports the package; every guide has its front matter and its links lead somewhere", () => {
  assert.deepEqual(docs.docsProblems("."), []);
});

test("docs/site.json has the job, and package.json's description carries it", () => {
  const site = docs.packageOf(".");
  assert.match(site.job ?? "", /\S/);
  assert.ok(pkg.description.includes(site.job ?? "\0"));
});

test("every English guide has its Japanese twin, one language to a page", () => {
  const english = readdirSync("docs/guides").filter((name) => name.endsWith(".md"));
  assert.ok(english.length >= 8, "the guides");
  for (const name of english) assert.ok(existsSync(`docs/guides/ja/${name}`), `docs/guides/ja/${name} is missing`);
  for (const name of readdirSync("docs/guides/ja")) assert.ok(english.includes(name), `docs/guides/ja/${name} has no English page`);
});

test("the README links to the demo, the embed page and the documentation site", () => {
  const readme = read("README.md");
  const site = docs.packageOf(".");
  for (const url of [site.docsUrl, "https://johnmorrisdotca.github.io/chikyu-earth/", "https://johnmorrisdotca.github.io/chikyu-earth/embed.html"]) assert.ok(readme.includes(url), url);
});
