// The entries without sky cultures leave every `hoshi-stars/cultures/*` import out of what they pull in, and the default entries keep all three. Read from the source files' own imports, no browser.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Every file of the package that an entry pulls in, by static or dynamic import of a relative file, and the sources' text. */
function reach(entry: string): { files: Set<string>; text: string } {
  const files = new Set<string>();
  const todo = [resolve(root, entry)];
  let text = "";
  while (todo.length > 0) {
    const file = todo.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    const source = readFileSync(file, "utf8");
    text += `\n${source}`;
    for (const match of source.matchAll(/(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+\.ts)["']/g)) todo.push(resolve(dirname(file), match[1]!));
  }
  return { files, text };
}

for (const element of ["space", "realistic"] as const) {
  test(`${element}/no-cultures pulls in no hoshi-stars/cultures import, and ${element}/element pulls in all three`, () => {
    const lite = reach(`src/${element}/no-cultures.ts`);
    assert.doesNotMatch(lite.text, /["']@johnmorrisdotca\/hoshi-stars\/cultures\//, "no culture import");
    assert.ok(![...lite.files].some((file) => file.endsWith("/sky/cultures.ts")), "the table of cultures is not in it");
    assert.ok([...lite.files].some((file) => file.endsWith("/sky/host.ts")), "but the sky layer is");
    const full = reach(`src/${element}/element.ts`);
    for (const culture of ["western", "japanese", "chinese"]) assert.match(full.text, new RegExp(`["']@johnmorrisdotca/hoshi-stars/cultures/${culture}["']`), `${culture} is in the default entry`);
  });
}
