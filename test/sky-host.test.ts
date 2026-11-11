// The star names' layer at rest: it is laid out and drawn only when the picture is (`frame`), when a setting or the language changes, and never by itself. A fake document stands in for the browser; hoshi-stars is the real one.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { SkyFrame } from "../src/sky/frame.ts";
import { createSkyHost } from "../src/sky/host.ts";

interface FakeNode {
  style: { setProperty(): void; removeProperty(): void };
  hidden: boolean;
  textContent: string;
  className: string;
  width: number;
  height: number;
  append(...nodes: FakeNode[]): void;
  remove(): void;
  setAttribute(): void;
  getContext(): unknown;
  addEventListener(): void;
  getBoundingClientRect?(): { left: number; top: number; right: number; bottom: number };
}
const context = new Proxy({}, { get: () => () => undefined, set: () => true });
let measure: ((node: FakeNode, index: number) => { left: number; top: number; right: number; bottom: number }) | undefined;
let made = 0;
const element = (): FakeNode => {
  const index = made;
  made += 1;
  const node: FakeNode = { style: { setProperty() {}, removeProperty() {} }, hidden: false, textContent: "", className: "", width: 0, height: 0, append() {}, remove() {}, setAttribute() {}, getContext: () => context, addEventListener() {} };
  if (measure) node.getBoundingClientRect = () => measure!(node, index);
  return node;
};
const listeners = new Map<string, Set<() => void>>();
const doc = {
  createElement: element,
  addEventListener: (name: string, fn: () => void) => (listeners.get(name) ?? listeners.set(name, new Set()).get(name)!).add(fn),
  removeEventListener: (name: string, fn: () => void) => listeners.get(name)?.delete(fn),
};
const root = { ownerDocument: doc, append() {}, host: { addEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0 }) } } as unknown as ShadowRoot;
const frame: SkyFrame = {
  width: 400,
  height: 400,
  discs: [{ x: 200, y: 200, radius: 50 }],
  project(ra, dec, out) {
    out.x = 200 + 150 * Math.cos(dec * (Math.PI / 180)) * Math.sin(ra * (Math.PI / 180));
    out.y = 200 - 150 * Math.sin(dec * (Math.PI / 180));
    return Math.cos(dec * (Math.PI / 180)) * Math.cos(ra * (Math.PI / 180)) > -0.9;
  },
};
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
/** Waits for what the host reports, not for a time: hoshi-stars is imported and the names laid out. */
async function until(host: { readonly stats: { loaded: boolean; names: number } }): Promise<void> {
  for (let waited = 0; waited < 20_000 && !(host.stats.loaded && host.stats.names > 0); waited += 20) await wait(20);
  assert.ok(host.stats.loaded && host.stats.names > 0, "hoshi-stars is loaded and names are laid out");
}

test("at rest nothing is laid out or drawn again: only a frame, a change of setting or a change of language does it", async () => {
  let lang: "en" | "ja" = "en";
  let count: string | null = "12";
  const host = createSkyHost({ root, attribute: (name) => (name === "star-names" ? count : null), language: () => lang, onError: (error) => assert.fail(String(error)), loadFont: async () => undefined });
  host.frame(frame);
  await until(host);
  const drawn = host.stats.renders;
  assert.ok(drawn > 0);
  // at rest: time passes, the document says nothing, and the language is read again by nobody
  await wait(400);
  assert.equal(host.stats.renders, drawn, "no draw by itself");
  // the family's event with the language unchanged is not a change
  for (const fn of listeners.get("kazoku-languagechange") ?? []) fn();
  await wait(50);
  assert.equal(host.stats.renders, drawn, "the language event, with the same language, draws nothing");
  // a frame is a draw of the picture: the layer follows it, once
  host.frame(frame);
  assert.equal(host.stats.renders, drawn + 1, "one draw for one frame");
  host.frame(frame);
  assert.equal(host.stats.renders, drawn + 2);
  // the language changes: written again, once, by the event
  lang = "ja";
  for (const fn of listeners.get("kazoku-languagechange") ?? []) fn();
  await wait(50);
  assert.equal(host.stats.renders, drawn + 3, "a change of language is one draw");
  assert.equal(host.stats.lang, "ja");
  for (const fn of listeners.get("kazoku-languagechange") ?? []) fn();
  await wait(50);
  assert.equal(host.stats.renders, drawn + 3, "and the same event again is nothing");
  // a setting changes: one draw
  count = "8";
  host.refresh();
  assert.equal(host.stats.renders, drawn + 4);
  await wait(300);
  assert.equal(host.stats.renders, drawn + 4, "and then it rests");
  host.dispose();
});

test("a frame in a new language is laid out in it, without a separate draw", async () => {
  let lang: "en" | "ja" = "en";
  const host = createSkyHost({ root, attribute: (name) => (name === "star-names" ? "12" : null), language: () => lang, onError: (error) => assert.fail(String(error)), loadFont: async () => undefined });
  host.frame(frame);
  await until(host);
  const drawn = host.stats.renders;
  lang = "ja";
  host.frame(frame);
  assert.equal(host.stats.renders, drawn + 1, "the frame is the one draw");
  assert.equal(host.stats.lang, "ja");
  host.dispose();
});

test("names are measured as they are drawn: one that runs over a brighter star's name is left out, with its ring, and the count is what is shown", async () => {
  // every name is drawn on the same box, as if a font with wider letters made them cover one another
  measure = () => ({ left: 100, top: 100, right: 220, bottom: 118 });
  made = 0;
  const host = createSkyHost({ root, attribute: (name) => (name === "star-names" ? "12" : null), language: () => "en", onError: (error) => assert.fail(String(error)), loadFont: async () => undefined });
  host.frame(frame);
  await until(host);
  assert.equal(host.stats.names, 1, "of names on top of one another, the first stays");
  // names that are apart all stay
  measure = (_node, index) => ({ left: index * 300, top: 0, right: index * 300 + 120, bottom: 18 });
  made = 0;
  const apart = createSkyHost({ root, attribute: (name) => (name === "star-names" ? "12" : null), language: () => "en", onError: (error) => assert.fail(String(error)), loadFont: async () => undefined });
  apart.frame(frame);
  await until(apart);
  assert.equal(apart.stats.names, 12, "names that do not touch are all shown");
  measure = undefined;
  host.dispose();
  apart.dispose();
});

test("without hoshi-stars the layer says so once, draws nothing, leaves nothing in the page and does not try again", async () => {
  const errors: unknown[] = [];
  let tries = 0;
  const appended: FakeNode[] = [];
  const bare = { ...(root as unknown as Record<string, unknown>), append: (...nodes: FakeNode[]) => appended.push(...nodes) } as unknown as ShadowRoot;
  const host = createSkyHost({
    root: bare,
    attribute: (name) => (name === "star-names" ? "12" : null),
    language: () => "en",
    onError: (error) => errors.push(error),
    loadFont: async () => undefined,
    importer: async () => {
      tries += 1;
      throw new Error("Cannot find package '@johnmorrisdotca/hoshi-stars'");
    },
  });
  host.frame(frame);
  for (let waited = 0; waited < 5000 && errors.length === 0; waited += 20) await wait(20);
  assert.equal(errors.length, 1, "the page is told once");
  assert.match(String((errors[0] as Error).message), /hoshi-stars/, "with the reason");
  assert.equal(host.stats.loaded, false);
  assert.equal(host.stats.names, 0);
  host.frame(frame);
  host.frame(frame);
  host.refresh();
  await wait(100);
  assert.equal(tries, 1, "it does not try again");
  assert.equal(errors.length, 1, "and does not say so again");
  assert.equal(host.stats.renders, 0, "nothing was drawn");
  host.dispose();
});
