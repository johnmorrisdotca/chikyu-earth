// The citation: CITATION.cff (which GitHub reads for its "Cite this repository" button) and the README's "How to cite" name the version in package.json, so a release commit that bumps one and forgets the others fails here.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const pkg = JSON.parse(read("package.json")) as { version: string; license: string; repository: { url: string } };
const cff = read("CITATION.cff");
const field = (name: string): string | undefined => new RegExp(`^${name}: "?([^"\\n]+)"?$`, "m").exec(cff)?.[1];

test("CITATION.cff has the fields the format asks for and names this package's version, repository and licence", () => {
  assert.equal(field("cff-version"), "1.2.0");
  assert.ok(field("title"));
  assert.match(field("message") ?? "", /NOTICE\.md/);
  assert.match(cff, /^authors:\n {2}- family-names: Morris\n {4}given-names: John$/m);
  assert.equal(field("version"), pkg.version, "bump `version` in CITATION.cff with package.json");
  assert.match(field("date-released") ?? "", /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(`${field("repository-code")}.git`, pkg.repository.url.replace(/^git\+/, ""));
  assert.equal(field("license"), pkg.license);
});

test("the README's How to cite gives the same version", () => {
  const readme = read("README.md");
  assert.ok(readme.includes(`*Chikyu Earth* (version ${pkg.version}) [Computer software]. ${field("repository-code")}`), "bump the version in the README's How to cite with package.json");
  assert.ok(readme.includes("[CITATION.cff](CITATION.cff)"));
});
