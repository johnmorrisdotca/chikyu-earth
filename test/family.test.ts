// What this package holds the same way as every package of the family: the shared template and the README writer, the one list of the family, and the README
// block written from it. Changing a shared file means changing it in every repository at once, with the new hash recorded here.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

interface Template {
  FAMILY: { id: string; name: string; kana: string }[];
  FAMILY_GROUPS: { members: string[] }[];
  FAMILY_PITCH: Record<string, string>;
  FAMILY_NOT_ON_NPM: string[];
  FAMILY_TEMPLATE_VERSION: string;
  familyRepo(id: string): string;
  familyHeader(options: { id: string }): string;
  familyFooter(options: { id: string }): string;
}
interface Writer {
  familyBlockOf(readme: string): string | null;
  familyReadmeBlock(id: string): string;
}
const template = (await import(new URL("../scripts/family-template.mjs", import.meta.url).href)) as Template;
const writer = (await import(new URL("../scripts/family-readme.mjs", import.meta.url).href)) as Writer;

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const pkg = JSON.parse(read("package.json")) as { name: string };
const id = pkg.name.replace(/^@[^/]+\//, "");

// The template of 2026-11-02b is the one of 2026-11-02 with this package added to the list (thirty-three packages, geography group), and the README writer's number words
// reaching thirty-three. The other packages take the same two files when they are next touched.
const TEMPLATE = { version: "2026-11-09", sha256: "75ca7e7da99092f360e5a539e34b109b14c92e9c04e7ad98f9e4b1e715c9240e" };
const ea87c4b45eaaa14cbd40eb40d9eccb38dbe7d45855f9eb0f1c75a4e3b0596306256 = "dfd4c27b70fe5d7d5f82724180cc739812f0dd13d209c41c053dbdc61bf90188";
const FAMILY_31df0a58f422070ca4023d5498566b26bc55a5f9a0751f1520d36c61bbb562c9256 = "31df0a58f422070ca4023d5498566b26bc55a5f9a0751f1520d36c61bbb562c9";

test("the family template, the README writer and family.css are the recorded files, byte for byte", () => {
  assert.equal(template.FAMILY_TEMPLATE_VERSION, TEMPLATE.version);
  assert.equal(sha("scripts/family-template.mjs"), TEMPLATE.sha256);
  assert.equal(sha("scripts/family-readme.mjs"), ea87c4b45eaaa14cbd40eb40d9eccb38dbe7d45855f9eb0f1c75a4e3b0596306256);
  assert.equal(sha("demo/family.css"), FAMILY_31df0a58f422070ca4023d5498566b26bc55a5f9a0751f1520d36c61bbb562c9256);
});

test("it lists every package of the family, in order, each with its Japanese name and a line on it", () => {
  assert.equal(template.FAMILY.length, 41);
  assert.deepEqual(template.FAMILY_GROUPS.flatMap((group) => group.members), template.FAMILY.map((one) => one.id));
  for (const group of template.FAMILY_GROUPS) assert.deepEqual(group.members, [...group.members].sort());
  for (const one of template.FAMILY) {
    const slug = one.name.toLowerCase().replaceAll(" ", "-");
    assert.ok(one.id === slug || one.id.startsWith(`${slug}-`), one.id);
    assert.match(one.kana, /\S/, one.id);
    assert.match(template.FAMILY_PITCH[one.id] ?? "", /^[^A-Z.].*[^.]$/, one.id);
  }
  assert.deepEqual(Object.keys(template.FAMILY_PITCH).sort(), template.FAMILY.map((one) => one.id).sort());
  assert.ok(template.FAMILY.some((one) => one.id === id));
});

test("this package is on npm: the header has the npm pill and the footer the install line", () => {
  assert.ok(!template.FAMILY_NOT_ON_NPM.includes(id));
  assert.ok(template.familyHeader({ id }).includes(`https://www.npmjs.com/package/@johnmorrisdotca/${id}`));
  assert.ok(template.familyFooter({ id }).includes(`npm install @johnmorrisdotca/${id}`));
});

test("the demo page is made with the family's header and footer, with the kazoku-ui language picker and theme switch in the header", () => {
  const page = read("scripts/page.ts");
  for (const call of ["familyHead(", "familyHeader(", "familyFooter(", "familyUnreviewed(", "FAMILY_SCRIPT"]) assert.ok(page.includes(call), call);
  const html = read("demo/index.html");
  for (const marker of ["family:head", "family:header", "family:unreviewed", "family:footer", "family:scripts"]) assert.ok(html.includes(`<!--${marker}`), marker);
  const header = template.familyHeader({ id });
  assert.ok(header.includes("<kazoku-language-picker"));
  assert.ok(header.includes("<kazoku-theme-switch"));
});

test("the README's family is the block scripts/family-readme.mjs writes from the template, under a heading of its own, naming every package once", () => {
  const readme = read("README.md");
  const block = writer.familyBlockOf(readme);
  assert.notEqual(block, null, "README.md has no family markers");
  assert.equal(block, writer.familyReadmeBlock(id));
  assert.equal(readme.split("<!-- family:start").length - 1, 1);
  assert.match(readme, /\n#{2,3} The family\n+<!-- family:start/);
  for (const one of template.FAMILY) assert.equal((block ?? "").split(`](${template.familyRepo(one.id)})`).length - 1, 1, one.id);
});
