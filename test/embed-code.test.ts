// The code the demo's embed panel writes for each way a page is made: it is valid for its kind, it imports only what the package exports, and it gives the element only the
// attributes the element reads. The ES module is run against a stand-in page and must make the tag the package defines.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseTemplate } from "@angular/compiler";
import { build } from "esbuild";
import { compile } from "svelte/compiler";
import ts from "typescript";
import { compileScript, parse } from "vue/compiler-sfc";
import { EMBED_KINDS, type EmbedKind } from "@johnmorrisdotca/kazoku-ui/embed-panel";
import { centreOf, embedCode, embedQuery, LOOKS, PACKAGE, PLACES, SITE, SIZES, START, type Choice } from "../demo/embed-code.ts";

const tags = new Map<string, { observedAttributes?: string[] }>();
class Stand {}
Object.assign(globalThis, { HTMLElement: Stand, customElements: { define: (name: string, ctor: { observedAttributes?: string[] }) => tags.set(name, ctor), get: (name: string) => tags.get(name) } });
await import("../src/element.ts").catch(() => undefined);
await import("../src/realistic/element.ts").catch(() => undefined);

const exportsOf = (JSON.parse(readFileSync("package.json", "utf8")) as { exports: Record<string, unknown> }).exports;
const CHOICES: Choice[] = [
  START,
  { place: "london", look: "line", graticule: false, size: 240 },
  { place: "sydney", look: "realistic", graticule: true, size: 560 },
  { place: "sao-paulo", look: "thick", graticule: false, size: 420 },
];
const syntax = (code: string, name: string): string[] => (ts.transpileModule(code, { reportDiagnostics: true, fileName: name, compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).diagnostics ?? []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
const tagOf = (code: string): { name: string; attrs: Map<string, string> } => {
  const match = /<(chikyu-earth(?:-realistic)?)\b([^>]*?)\/?>/s.exec(code);
  assert.ok(match, code);
  return { name: match[1]!, attrs: new Map([...match[2]!.matchAll(/([\w-]+)(?:=(?:"([^"]*)"|\{\{.*?\}\}))?/gs)].map((one) => [one[1]!, one[2] ?? ""])) };
};

test("every way of the family's panel is written, for every look", () => {
  for (const c of CHOICES) for (const kind of EMBED_KINDS) assert.ok(embedCode(kind, c).length > 40, `${kind} ${c.look}`);
});

test("the imports are paths the package exports, and the element is the one the look needs", () => {
  for (const c of CHOICES) {
    for (const kind of ["html", "module", "react", "vue", "angular", "svelte"] as EmbedKind[]) {
      const code = embedCode(kind, c);
      const paths = [...code.matchAll(kind === "html" ? /chikyu-earth@[\w.]+\/([\w/-]+)\/\+esm/g : new RegExp(`${PACKAGE}/([\\w/-]+)`, "g"))].map((one) => one[1]!);
      assert.ok(paths.length > 0, kind);
      for (const path of paths) assert.ok(`./${path}` in exportsOf, `${kind}: ./${path}`);
      assert.equal(kind === "module" ? /createElement\("([^"]+)"/.exec(code)![1] : tagOf(code).name, c.look === "realistic" ? "chikyu-earth-realistic" : "chikyu-earth", kind);
    }
  }
});

test("the element is given only attributes it reads, and the look, centre, graticule and size chosen", () => {
  assert.ok(tags.has("chikyu-earth"), "the flat element is defined");
  assert.ok(tags.has("chikyu-earth-realistic"), "the realistic element is defined");
  for (const c of CHOICES) {
    const { name, attrs } = tagOf(embedCode("html", c));
    const read = new Set([...(tags.get(name)!.observedAttributes ?? []), "texture-base", "style"]);
    for (const key of attrs.keys()) assert.ok(read.has(key), `${name} reads ${key}`);
    assert.equal(attrs.get("center"), centreOf(c.place));
    if (c.look === "realistic") assert.match(attrs.get("style")!, new RegExp(`width: ${c.size}px`));
    else {
      assert.equal(attrs.get("look"), c.look);
      assert.equal(attrs.get("size"), String(c.size));
      assert.equal(attrs.has("graticule"), c.graticule);
    }
  }
});

test("the ES module runs against a page and makes the element at the centre chosen", async () => {
  for (const c of CHOICES) {
    const made: { tag: string; attrs: Record<string, string> }[] = [];
    const document = {
      createElement: (tag: string) => {
        const one = { tag, attrs: {} as Record<string, string>, setAttribute: (key: string, value: string) => (one.attrs[key] = value) };
        made.push(one);
        return one;
      },
      querySelector: () => ({ append: () => undefined }),
    };
    const body = embedCode("module", c).replace(/^import .*$/gm, "");
    await new Function("document", body)(document);
    assert.equal(made.length, 1);
    assert.equal(made[0]!.tag, c.look === "realistic" ? "chikyu-earth-realistic" : "chikyu-earth");
    assert.equal(made[0]!.attrs["center"], centreOf(c.place));
  }
});

test("the module, the React and the Angular components are valid, and React builds with the element", async () => {
  for (const c of CHOICES) {
    for (const [kind, file] of [["module", "m.ts"], ["react", "r.tsx"], ["angular", "a.ts"]] as const) assert.deepEqual(syntax(embedCode(kind, c), file), [], `${kind} ${c.look}`);
    const angular = embedCode("angular", c);
    const parsed = parseTemplate(/template: `([^`]*)`/.exec(angular)![1]!, "earth.component.ts");
    assert.deepEqual(parsed.errors ?? [], []);
    const react = embedCode("react", c);
    assert.doesNotMatch(react, /style="/, "React takes a style as an object");
    const out = await build({ stdin: { contents: `declare module "react" {}\n${react}`, loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic", external: [PACKAGE + "/*", "react", "react/*"], logLevel: "silent" });
    assert.ok(out.outputFiles[0]!.text.includes("chikyu-earth"));
  }
});

test("the Vue and Svelte components compile and name the element", () => {
  for (const c of CHOICES) {
    const { descriptor, errors } = parse(embedCode("vue", c));
    assert.deepEqual(errors, []);
    assert.match(compileScript(descriptor, { id: "earth" }).content, /onMounted/);
    const svelte = compile(embedCode("svelte", c), { filename: "Earth.svelte", generate: "client" });
    assert.match(svelte.js.code, /chikyu-earth/);
  }
});

test("the iframe is the embed page at the size chosen, and its address says what the embed page reads", () => {
  for (const c of CHOICES) {
    const code = embedCode("iframe", c);
    assert.match(code, new RegExp(`width="${c.size}"`));
    assert.match(code, new RegExp(`src="${SITE.replaceAll(".", "\\.")}embed\\.html\\?`));
    const query = new URLSearchParams(embedQuery(c));
    assert.equal(query.get("look"), c.look);
    assert.equal(query.get("center"), centreOf(c.place));
    assert.equal(query.get("graticule"), c.graticule && c.look !== "realistic" ? "1" : null);
  }
  assert.match(embedCode("iframe", START, true), /src="embed\.html\?/);
});

test("the panel offers every place, look and size the builder had", () => {
  assert.deepEqual(PLACES.map((one) => one.id), ["tokyo", "toronto", "london", "new-york", "sao-paulo", "cairo", "nairobi", "mumbai", "sydney", "reykjavik"]);
  assert.deepEqual([...LOOKS], ["line", "thick", "realistic"]);
  assert.deepEqual([...SIZES], [240, 320, 420, 560]);
});
