// The documentation site's checks, in `pnpm check`. scripts/docs-site.mjs and e2e/docs-site.demo.mjs are the family's documentation generator and its browser test, held to one
// recorded hash each; the generator here is chizu's of 2026-10-13 with the header's language picker (kazoku-ui) turned into the twin-page links, and carries its own version.
// This test reads files and builds nothing: the examples are run by `pnpm docs:check` and by the Pages workflow's `pnpm docs:site`, which need the package built.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

interface FrontMatter { data: Record<string, string> | null; body: string; problems: { line: number; text: string }[] }
interface DocsSite {
  DOCS_SITE_VERSION: string;
  parseFrontMatter(text: string): FrontMatter;
  guidesOf(site: { repositoryRoot: string }): { file: string; title: string; frontMatterProblems: { line: number; text: string }[] }[];
  docsProblems(root: string): string[];
  packageOf(root: string): { job: string | null; docsUrl: string };
}
const docs = (await import(new URL("../scripts/docs-site.mjs", import.meta.url).href)) as DocsSite;

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const pkg = JSON.parse(read("package.json")) as { description: string; scripts: Record<string, string>; devDependencies?: Record<string, string>; dependencies?: Record<string, string> };

const RECORDED = {
  version: "2026-11-10-strict-front-matter",
  "scripts/docs-site.mjs": "c5d77d0020e2ba01e5b36cbbcf782ae1dafad7f5192bfc9cd2ca43143cd28846",
  "e2e/docs-site.demo.mjs": "4e5120792d4808f9785b333ae4b8a77c995bc0b3f2b57686f931adacf1ae3a5e",
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
  assert.match(read(".github/workflows/pages.yml"), /^ {6}- run: pnpm site\n(?: {8}timeout-minutes: \d+\n)? {6}- run: pnpm docs:site\n/m);
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

const guide = (...lines: string[]) => `---\n${lines.join("\n")}\n---\n\n## Body\n`;

test("front matter is read as YAML is: a quoted colon passes, in double or single quotes, and keeps its text", () => {
  const read = docs.parseFrontMatter(guide('title: "Maps: a guide"', "section: how-to", "order: 2", "description: 'It''s one sentence: with a colon.'"));
  assert.deepEqual(read.problems, []);
  assert.deepEqual(read.data, { title: "Maps: a guide", section: "how-to", order: "2", description: "It's one sentence: with a colon." });
  assert.equal(read.body, "\n## Body\n");
  assert.deepEqual(docs.parseFrontMatter(guide('title: "Say \\"hi\\" # not a comment"', "description: A plain sentence, with a hash#inside and a colon:inside.")).problems, []);
  assert.equal(docs.parseFrontMatter("## No front matter\n").data, null);
});

test("front matter with an unquoted colon fails, naming the line (GitHub shows 'Error in user YAML')", () => {
  const read = docs.parseFrontMatter(guide("title: Maps: a guide", "section: how-to", "description: Fine."));
  assert.equal(read.problems.length, 1);
  assert.equal(read.problems[0].line, 2);
  assert.match(read.problems[0].text, /title has a colon followed by a space/);
  assert.equal(docs.parseFrontMatter(guide("title: Fine", "description: Ends in a colon:")).problems[0].line, 3);
});

test("front matter with a tab or a bad indent fails", () => {
  const tab = docs.parseFrontMatter(guide("title: Fine", "\tdescription: Tabbed."));
  assert.equal(tab.problems.length, 1);
  assert.equal(tab.problems[0].line, 3);
  assert.match(tab.problems[0].text, /tab/);
  const indent = docs.parseFrontMatter(guide("title: Fine", "description: Two lines", "  of one sentence."));
  assert.equal(indent.problems.length, 1);
  assert.equal(indent.problems[0].line, 4);
  assert.match(indent.problems[0].text, /indented/);
  assert.equal(docs.parseFrontMatter(guide(" title: Fine")).problems[0].line, 2);
});

test("front matter also fails on a value YAML reads as syntax, a hash that starts a comment, a key twice, an open quote and a key with no space", () => {
  for (const line of ["title: [draft] Maps", "title: *Maps*", "title: & Maps", "title: !Maps", "title: > Maps", "title: | Maps", "title: %Maps", "title: @Maps", "title: `Maps`", "title: - Maps", "title: Maps # draft", 'title: "Maps', 'title: "Maps" and more', "title: 'Maps", "title:Maps", 'title: "bad \\q escape"']) {
    assert.equal(docs.parseFrontMatter(guide(line)).problems.length, 1, line);
  }
  assert.match(docs.parseFrontMatter(guide("title: One", "title: Two")).problems[0].text, /second time/);
  assert.deepEqual(docs.parseFrontMatter(guide("# a comment", "", "title: Fine")).problems, []);
});

test("a guide with bad front matter is reported by the docs check with its file and line", () => {
  const root = mkdtempSync(join(tmpdir(), "docs-site-"));
  try {
    mkdirSync(join(root, "docs", "guides"), { recursive: true });
    writeFileSync(join(root, "docs", "guides", "bad.md"), guide("title: Bad: unquoted", "section: tutorial", "description: Fine."));
    writeFileSync(join(root, "docs", "guides", "good.md"), guide('title: "Good: quoted"', "section: tutorial", "description: Fine."));
    const found = docs.guidesOf({ repositoryRoot: root });
    assert.deepEqual(found.map((one) => [one.file, one.frontMatterProblems.map((problem) => problem.line)]), [["docs/guides/bad.md", [2]], ["docs/guides/good.md", []]]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
