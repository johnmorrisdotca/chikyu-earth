// The code the passes page's embed panel writes for each way a page is made: it is valid for its kind, it imports only what the package exports, and it gives `<chikyu-passes>` only the attributes
// the element reads. The ES module is run against a stand-in page and must make the tag the package defines.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseTemplate } from "@angular/compiler";
import { build } from "esbuild";
import { compile } from "svelte/compiler";
import ts from "typescript";
import { compileScript, parse } from "vue/compiler-sfc";
import { EMBED_KINDS, type EmbedKind } from "@johnmorrisdotca/kazoku-ui/embed-panel";
import { SITE, PACKAGE } from "../demo/embed-code.ts";
import { ELEMENTS_URL, passesAttrs, passesCode, passesQuery, PASS_DAYS, PASS_SATELLITES, type PassesChoice } from "../demo/passes-code.ts";

const tags = new Map<string, { observedAttributes?: string[] }>();
class Stand {}
Object.assign(globalThis, { HTMLElement: Stand, customElements: { define: (name: string, ctor: { observedAttributes?: string[] }) => tags.set(name, ctor), get: (name: string) => tags.get(name) } });
await import("../src/passes/element.ts");

const exportsOf = (JSON.parse(readFileSync("package.json", "utf8")) as { exports: Record<string, unknown> }).exports;
const CHOICES: PassesChoice[] = [
  { lat: 35.69, lon: 139.69, zone: "Asia/Tokyo", sat: "iss", days: 5 },
  { lat: -33.87, lon: 151.21, zone: "Australia/Sydney", sat: "all", days: 10 },
  { lat: 51.51, lon: -0.13, zone: "Europe/London", sat: "hst", days: 3 },
  { lat: 12.5, lon: 45.25, zone: "", sat: "css", days: 7 },
];
const syntax = (code: string, name: string): string[] => (ts.transpileModule(code, { reportDiagnostics: true, fileName: name, compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).diagnostics ?? []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
const tagOf = (code: string): Map<string, string> => {
  const match = /<chikyu-passes\b([^>]*?)\/?>/s.exec(code);
  assert.ok(match, code);
  return new Map([...match[1]!.matchAll(/([\w-]+)(?:="([^"]*)")?/gs)].map((one) => [one[1]!, one[2] ?? ""]));
};

test("every way of the family's panel is written, for every choice", () => {
  for (const c of CHOICES) for (const kind of EMBED_KINDS) assert.ok(passesCode(kind, c).length > 40, `${kind} ${c.sat}`);
});

test("the imports are paths the package exports, and the tag is the one the package defines", () => {
  assert.ok(tags.has("chikyu-passes"), "the element is defined");
  for (const c of CHOICES) {
    for (const kind of ["html", "module", "react", "vue", "angular", "svelte"] as EmbedKind[]) {
      const code = passesCode(kind, c);
      const paths = [...code.matchAll(kind === "html" ? /chikyu-earth@[\w.]+\/([\w/-]+)\/\+esm/g : new RegExp(`${PACKAGE}/([\\w/-]+)`, "g"))].map((one) => one[1]!);
      assert.ok(paths.length > 0, kind);
      for (const path of paths) assert.ok(`./${path}` in exportsOf, `${kind}: ./${path}`);
      assert.equal(kind === "module" ? /createElement\("([^"]+)"/.exec(code)![1] : (/<(chikyu-passes)\b/.exec(code)?.[1] ?? ""), "chikyu-passes", kind);
    }
  }
});

test("the element is given only attributes it reads, with the place, the days, the satellite and the zone chosen", () => {
  const read = new Set(tags.get("chikyu-passes")!.observedAttributes ?? []);
  for (const c of CHOICES) {
    const attrs = tagOf(passesCode("html", c));
    for (const key of attrs.keys()) assert.ok(read.has(key), `chikyu-passes reads ${key}`);
    assert.equal(attrs.get("latitude"), String(c.lat));
    assert.equal(attrs.get("longitude"), String(c.lon));
    assert.equal(attrs.get("days"), String(c.days));
    assert.equal(attrs.get("elements-src"), ELEMENTS_URL);
    assert.equal(attrs.get("satellite"), c.sat === "all" ? undefined : String(PASS_SATELLITES[c.sat]));
    if (c.zone) assert.equal(attrs.get("time-zone"), c.zone);
    else assert.equal(attrs.get("utc-offset"), String(Math.round(c.lon / 15)));
    assert.ok(Number(attrs.get("days")) >= 1 && Number(attrs.get("days")) <= 14);
  }
  assert.deepEqual([...PASS_DAYS], [3, 5, 7, 10]);
  assert.match(ELEMENTS_URL, new RegExp(`^${SITE.replaceAll(".", "\\.")}elements/bright\\.json$`));
});

test("the ES module runs against a page and makes the element with the attributes chosen", async () => {
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
    const body = passesCode("module", c).replace(/^import .*$/gm, "");
    await new Function("document", body)(document);
    assert.equal(made.length, 1);
    assert.equal(made[0]!.tag, "chikyu-passes");
    assert.deepEqual(Object.entries(made[0]!.attrs), passesAttrs(c));
  }
});

test("the module, the React and the Angular components are valid, and React builds with the element", async () => {
  for (const c of CHOICES) {
    for (const [kind, file] of [["module", "m.ts"], ["react", "r.tsx"], ["angular", "a.ts"]] as const) assert.deepEqual(syntax(passesCode(kind, c), file), [], `${kind} ${c.sat}`);
    const parsed = parseTemplate(/template: `([^`]*)`/.exec(passesCode("angular", c))![1]!, "passes.component.ts");
    assert.deepEqual(parsed.errors ?? [], []);
    const react = passesCode("react", c);
    const out = await build({ stdin: { contents: `declare module "react" {}\n${react}`, loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic", external: [PACKAGE + "/*", "react", "react/*"], logLevel: "silent" });
    assert.ok(out.outputFiles[0]!.text.includes("chikyu-passes"));
  }
});

test("the Vue and Svelte components compile and name the element", () => {
  for (const c of CHOICES) {
    const { descriptor, errors } = parse(passesCode("vue", c));
    assert.deepEqual(errors, []);
    assert.match(compileScript(descriptor, { id: "passes" }).content, /onMounted/);
    assert.match(compile(passesCode("svelte", c), { filename: "Passes.svelte", generate: "client" }).js.code, /chikyu-passes/);
  }
});

test("the iframe is the embed page at the size chosen, and its address says what the embed page reads", () => {
  for (const c of CHOICES) {
    const code = passesCode("iframe", c, false, 640);
    assert.match(code, /width="640"/);
    assert.match(code, new RegExp(`src="${SITE.replaceAll(".", "\\.")}passes-embed\\.html\\?`));
    const query = new URLSearchParams(passesQuery(c, "ja"));
    assert.equal(query.get("lat"), String(c.lat));
    assert.equal(query.get("lon"), String(c.lon));
    assert.equal(query.get("sat"), c.sat);
    assert.equal(query.get("days"), String(c.days));
    assert.equal(query.get("tz"), c.zone || null);
    assert.equal(query.get("lang"), "ja");
  }
  assert.match(passesCode("iframe", CHOICES[0]!, true), /src="passes-embed\.html\?/);
  assert.doesNotMatch(passesQuery(CHOICES[0]!), /lang=/);
});
