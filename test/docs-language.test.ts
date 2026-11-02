// The docs are single-language: an English page has no Japanese outside code, a Japanese page (docs/guides/ja/, the twin of each guide in docs/guides/) has no English prose
// outside code. The site links the two of a pair to each other from its header. What is allowed to be otherwise is
// listed in ALLOWED, each with its reason; an entry that no longer applies fails, so the list cannot go stale.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/** An exception to the rule. `both`: the page is about the translations themselves and may show both languages side by side. `quoted`: Japanese (or English, on a Japanese page) strings that are proper names or titles and stay as they are. `between`: a generated block, from one marker to the other, that is the family's own text. */
type Allowed = { file: string; reason: string; both?: boolean; quoted?: string[]; between?: [string, string] };

const ALLOWED: Allowed[] = [
  {
    file: "README.md",
    between: ["<!-- family:start", "<!-- family:end -->"],
    reason: "The list of the family is made by scripts/family-readme.mjs from the family's own template, the same in every package; each sibling is listed with its own Japanese name, a proper noun.",
  },
  {
    file: "README.md",
    quoted: ["<sub>地球</sub>", "(地球, ちきゅう)", "(日本語)"],
    reason: "The package's own name in Japanese, in the title and once in the section that says what the name means, and the name of the Japanese guides.",
  },
  {
    file: "docs/guides/ja/troubleshooting.md",
    quoted: ["HTMLElement is not defined", "The `style` prop expects a mapping", "Maximum call stack size exceeded", "Failed to resolve component: chikyu-earth"],
    reason: "The error messages as the browser, React and Vue print them in English: a reader searches for them as written.",
  },
];

const JAPANESE = /[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff00-\uffef]/;
/** Four Latin words in a row are English prose; a name of one to three words (`Dougu Sports`, `World Aquatics Rules`) is not. */
const ENGLISH_PROSE = /[A-Za-z][A-Za-z'’-]*(?:[ ,.;:!?]+[A-Za-z][A-Za-z'’-]*){3,}/;

const SKIP_DIRECTORIES = new Set(["node_modules", "dist", "site", "test-results", "playwright-report", ".git", ".github", ".readme-examples", "scripts", "examples"]);

/** The Markdown files whose language is held: the root's, and everything under docs/ and src/. */
function pages(directory = ".", out: string[] = []): string[] {
  for (const name of readdirSync(directory)) {
    const path = directory === "." ? name : join(directory, name).split("\\").join("/");
    if (statSync(path).isDirectory()) {
      if (!SKIP_DIRECTORIES.has(name)) pages(path, out);
    } else if (name.endsWith(".md")) out.push(path);
  }
  return out;
}

/** The text a reader reads: without fenced code, code spans, comments, link addresses, bare addresses and tag attributes that are addresses. */
function proseOf(text: string, allowed: Allowed[]): string[] {
  let source = text.replace(/\r\n/g, "\n");
  for (const { between } of allowed) {
    if (!between) continue;
    const start = source.indexOf(between[0]);
    const end = source.indexOf(between[1], start);
    if (start >= 0 && end > start) source = source.slice(0, start) + source.slice(end + between[1].length);
  }
  for (const name of allowed.flatMap((entry) => entry.quoted ?? []).sort((x, y) => y.length - x.length)) source = source.split(name).join(" ");
  const lines: string[] = [];
  let fence = "";
  let comment = false;
  for (const raw of source.split("\n")) {
    const mark = /^\s*(```+|~~~+)/.exec(raw)?.[1];
    if (fence) {
      if (mark && mark[0] === fence[0] && mark.length >= fence.length) fence = "";
      lines.push("");
      continue;
    }
    if (mark) {
      fence = mark;
      lines.push("");
      continue;
    }
    let line = raw;
    if (comment) {
      const end = line.indexOf("-->");
      if (end < 0) {
        lines.push("");
        continue;
      }
      line = line.slice(end + 3);
      comment = false;
    }
    line = line.replace(/<!--.*?-->/g, "");
    if (line.includes("<!--")) {
      line = line.slice(0, line.indexOf("<!--"));
      comment = true;
    }
    line = line
      .replace(/\[日本語\]\([^)]*\.ja\.md\)/g, "")
      .replace(/(``+)[^]*?\1/g, "")
      .replace(/`[^`]*`/g, "")
      .replace(/\]\([^)]*\)/g, "]")
      .replace(/\b(?:href|src|srcset|id|class|style)="[^"]*"/g, "")
      .replace(/https?:\/\/[^\s)>\]"]+/g, "")
      .replace(/<\/?[a-z][a-z0-9-]*/gi, "");
    lines.push(line);
  }
  return lines;
}

const all = pages();
const isJapanese = (file: string) => file.startsWith("docs/guides/ja/");
const allowedOf = (file: string) => ALLOWED.filter((entry) => entry.file === file);

describe("the docs are single-language", () => {
  it("find the Markdown pages", () => {
    assert.ok(all.includes("README.md"), "the README is held");
    assert.ok(all.some(isJapanese), "the Japanese guides are held");
  });

  it("have an English page with no Japanese outside code, except what ALLOWED names", () => {
    const found: string[] = [];
    for (const file of all) {
      if (isJapanese(file)) continue;
      const allowed = allowedOf(file);
      proseOf(readFileSync(file, "utf8"), allowed).forEach((line, index) => {
        if (JAPANESE.test(line)) found.push(`${file}:${index + 1}: ${line.trim().slice(0, 100)}`);
      });
    }
    assert.deepEqual(found, [], "Japanese in an English page: move it to the guide's twin in docs/guides/ja/, put it in a code span if it is an identifier, or add the page to ALLOWED with a reason");
  });

  it("have a Japanese page with no English prose outside code, except what ALLOWED names", () => {
    const found: string[] = [];
    for (const file of all.filter(isJapanese)) {
      const allowed = allowedOf(file);
      proseOf(readFileSync(file, "utf8"), allowed).forEach((line, index) => {
        const prose = ENGLISH_PROSE.exec(line);
        if (prose) found.push(`${file}:${index + 1}: ${prose[0].slice(0, 80)}`);
      });
    }
    assert.deepEqual(found, [], "English prose in a Japanese page: write it in Japanese, or add it to ALLOWED with a reason");
  });

  it("have no exception in ALLOWED that no longer applies", () => {
    for (const entry of ALLOWED) {
      const text = readFileSync(entry.file, "utf8");
      for (const name of entry.quoted ?? []) assert.ok(text.includes(name), `${entry.file} no longer holds ${name}`);
      if (entry.between) assert.ok(text.includes(entry.between[0]), `${entry.file} no longer holds ${entry.between[0]}`);
    }
  });
});
