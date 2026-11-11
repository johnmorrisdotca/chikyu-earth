// The star names' layer at rest: it is laid out and drawn only when the picture is (`frame`), when a setting or the language changes, and never by itself. A fake document stands in for the browser; hoshi-stars is the real one.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createSkyHost, type SkyFrame } from "../src/sky/host.ts";

const context = new Proxy({}, { get: () => () => undefined, set: () => true });
const element = (): any => {
  const node: any = { style: { setProperty() {}, removeProperty() {} }, hidden: false, textContent: "", className: "", children: [] as any[], width: 0, height: 0, append(...c: any[]) { node.children.push(...c); }, remove() {}, setAttribute() {}, getContext: () => context, addEventListener() {} };
  return node;
};
const listeners = new Map<string, Set<() => void>>();
const doc: any = {
  createElement: element,
  addEventListener: (name: string, fn: () => void) => (listeners.get(name) ?? listeners.set(name, new Set()).get(name)!).add(fn),
  removeEventListener: (name: string, fn: () => void) => listeners.get(name)?.delete(fn),
};
const root: any = { ownerDocument: doc, append() {}, host: { addEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0 }) } };
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

test("at rest nothing is laid out or drawn again: only a frame, a change of setting or a change of language does it", async () => {
  let lang: "en" | "ja" = "en";
  let count: string | null = "12";
  const host = createSkyHost({ root, attribute: (name) => (name === "star-names" ? count : null), language: () => lang, onError: (error) => assert.fail(String(error)), loadFont: async () => undefined });
  host.frame(frame);
  await wait(1500);
  assert.ok(host.stats.loaded && host.stats.names > 0, "hoshi-stars is loaded and names are laid out");
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
  await wait(1500);
  const drawn = host.stats.renders;
  lang = "ja";
  host.frame(frame);
  assert.equal(host.stats.renders, drawn + 1, "the frame is the one draw");
  assert.equal(host.stats.lang, "ja");
  host.dispose();
});
