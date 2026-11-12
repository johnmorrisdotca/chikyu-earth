// The star names' layer at rest: it is laid out and drawn only when the picture is (`frame`), when a setting or the language changes, and never by itself. A fake document stands in for the browser; hoshi-stars is the real one.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { SkyFrame } from "../src/sky/frame.ts";
import { pathOutside, touches } from "../src/sky/cover.ts";
import "../src/sky/cultures.ts";
import { setCultureLoaders } from "../src/sky/culture-source.ts";
import { createSkyHost } from "../src/sky/host.ts";
import { inKeep, keepBox, touchesKeep } from "../src/sky/keep-clear.ts";

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
  apart.frame({ ...frame, discs: [] });
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

test("a name lying wholly on a body is left out: hoshi-stars tests the star's point only, and the box set beside it can fall on the Earth", async () => {
  // the Earth is everything below 150 px; a name whose whole top edge is below that is on it
  const onEarth: SkyFrame = { ...frame, covered: (_x, y) => y > 150 };
  measure = (_node, index) => ({ left: index * 300, top: 180, right: index * 300 + 120, bottom: 198 });
  made = 0;
  const lying = createSkyHost({ root, attribute: (name) => (name === "star-names" ? "12" : null), language: () => "en", onError: (error) => assert.fail(String(error)), loadFont: async () => undefined });
  lying.frame(onEarth);
  for (let waited = 0; waited < 5000 && !lying.stats.loaded; waited += 20) await wait(20);
  await wait(200);
  assert.equal(lying.stats.names, 0, "names wholly on the Earth are left out");
  assert.deepEqual(lying.stats.stars, [], "and so are their stars' points");
  // the same names with their tops above the Earth's edge stay
  measure = (_node, index) => ({ left: index * 300, top: 100, right: index * 300 + 120, bottom: 118 });
  made = 0;
  const clear = createSkyHost({ root, attribute: (name) => (name === "star-names" ? "12" : null), language: () => "en", onError: (error) => assert.fail(String(error)), loadFont: async () => undefined });
  clear.frame(onEarth);
  await until(clear);
  assert.ok(clear.stats.names > 3, "names whose tops are above the Earth's edge stay (the stars on the Earth are not named at all)");
  assert.equal(clear.stats.stars.length, clear.stats.names, "each shown name has its star's point");
  assert.ok(clear.stats.stars.every((star) => star.y <= 150), "and none of those points is on the Earth");
  measure = undefined;
  lying.dispose();
  clear.dispose();
});

test("a line stops at the edge of a body and never runs over it: the pieces are outside, and the cut is at the edge", () => {
  const disc = (x: number, y: number): boolean => (x - 200) ** 2 + (y - 200) ** 2 <= 80 ** 2;
  const pieces: number[][] = [];
  let from: number[] = [];
  const path = { moveTo: (x: number, y: number) => (from = [x, y]), lineTo: (x: number, y: number) => pieces.push([...from, x, y]) };
  // across the middle: two pieces, each ending on the circle
  pathOutside(path, 0, 200, 400, 200, disc);
  assert.equal(pieces.length, 2);
  assert.ok(Math.abs(pieces[0]![2]! - 120) < 0.3 && Math.abs(pieces[1]![0]! - 280) < 0.3, `cut at 120 and 280: ${pieces.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" | ")}`);
  // wholly outside: whole, and nothing where there is no body
  pieces.length = 0;
  pathOutside(path, 0, 0, 100, 0, disc);
  assert.deepEqual(pieces, [[0, 0, 100, 0]]);
  pieces.length = 0;
  pathOutside(path, 0, 0, 100, 100, undefined);
  assert.deepEqual(pieces, [[0, 0, 100, 100]]);
  // one end under the body: the piece from the other end to the edge; wholly under: nothing
  pieces.length = 0;
  pathOutside(path, 200, 200, 200, 0, disc);
  assert.equal(pieces.length, 1);
  assert.ok(Math.abs(pieces[0]![1]! - 120) < 0.3 && pieces[0]![3] === 0);
  pieces.length = 0;
  pathOutside(path, 180, 200, 220, 200, disc);
  assert.equal(pieces.length, 0);
  // a label whose name only touches the body is on it; one clear of it is not
  const label = { x: 400, y: 50, ring: 6, leader: false, leaderX1: 0, leaderY1: 0 };
  assert.equal(touches(disc, 20, 150, 60, 170, label), false);
  assert.equal(touches(disc, 20, 150, 130, 220, label), true, "its box reaches the body");
  assert.equal(touches(disc, 300, 0, 340, 20, { ...label, x: 200, y: 125, ring: 6 }), true, "the star's ring reaches the body");
});

test("a place kept clear: no star is named in it, a list of places is read once, and clearing the list names the stars again", async () => {
  measure = undefined;
  made = 0;
  const host = createSkyHost({ root, attribute: (name) => (name === "star-names" ? "12" : null), language: () => "en", onError: (error) => assert.fail(String(error)), loadFont: async () => undefined });
  const open: SkyFrame = { ...frame, discs: [] };
  host.frame(open);
  await until(host);
  const named = host.stats.names;
  assert.ok(named > 0);
  const drawn = host.stats.renders;
  host.setKeepClear([{ x: 0, y: 0, width: 400, height: 400 }]);
  assert.equal(host.stats.names, 0, "the whole picture kept clear: no name");
  assert.equal(host.stats.renders, drawn + 1, "one draw for the new list");
  await wait(100);
  assert.equal(host.stats.renders, drawn + 1, "and none after it");
  host.setKeepClear(null);
  assert.equal(host.stats.names, named, "the list cleared: the stars are named again");
  host.dispose();
  // the helpers: a box and a point against the areas, from a rectangle and from an element
  const areas = [keepBox({ x: 10, y: 10, width: 20, height: 20 }, { left: 0, top: 0 }), keepBox({ getBoundingClientRect: () => ({ left: 105, top: 205, right: 145, bottom: 225 }) }, { left: 100, top: 200 })];
  assert.deepEqual(areas, [{ l: 10, t: 10, r: 30, b: 30 }, { l: 5, t: 5, r: 45, b: 25 }]);
  assert.equal(touchesKeep(areas, 25, 25, 60, 60), true);
  assert.equal(touchesKeep(areas, 50, 50, 60, 60), false);
  assert.equal(inKeep(areas, 40, 10), true);
  assert.equal(inKeep(areas, 60, 10), false);
});

test("a figure picked while its culture is on its way is picked when it has come, and a culture that cannot be loaded says so once and leaves the IAU's figures", async () => {
  measure = undefined;
  made = 0;
  const attribute = (culture: string) => (name: string): string | null => (name === "constellation-lines" ? "0.3" : name === "constellation-culture" ? culture : null);
  // the page sets the property at once: the culture's figures are not here yet
  const host = createSkyHost({
    root,
    attribute: attribute("japanese"),
    language: () => "en",
    onError: (error) => assert.fail(String(error)),
    loadFont: async () => undefined,
    cultures: async () => (await import("@johnmorrisdotca/hoshi-stars/cultures/japanese")).japanese,
  });
  host.frame({ ...frame, discs: [] });
  host.pick("subaru");
  for (let waited = 0; waited < 20_000 && host.picked !== "subaru"; waited += 20) await wait(20);
  assert.equal(host.picked, "subaru", "the pick was kept until the culture was here");
  assert.equal(host.stats.culture, "japanese");
  host.dispose();
  // a culture that cannot be had
  const warnings: string[] = [];
  const warn = console.warn;
  console.warn = (message: unknown) => warnings.push(String(message));
  const errors: unknown[] = [];
  try {
    const failing = createSkyHost({ root, attribute: attribute("chinese"), language: () => "en", onError: (error) => errors.push(error), loadFont: async () => undefined, cultures: async () => Promise.reject(new Error("offline")) });
    failing.frame({ ...frame, discs: [] });
    for (let waited = 0; waited < 10_000 && warnings.length === 0; waited += 20) await wait(20);
    await wait(100);
    failing.refresh();
    await wait(50);
    assert.equal(warnings.length, 1, `one warning: ${warnings.join(" | ")}`);
    assert.match(warnings[0]!, /could not be loaded/);
    assert.equal(errors.length, 1, "the page is told");
    assert.equal(failing.stats.culture, "iau", "the IAU's figures are shown instead");
    failing.dispose();
  } finally {
    console.warn = warn;
  }
});

test("in a build without cultures a culture a page asks for is the IAU's, with one warning that names only the IAU", async () => {
  measure = undefined;
  made = 0;
  const warnings: string[] = [];
  const warn = console.warn;
  console.warn = (message: unknown) => warnings.push(String(message));
  setCultureLoaders({});
  try {
    const host = createSkyHost({ root, attribute: (name) => (name === "constellation-lines" ? "0.3" : name === "constellation-culture" ? "japanese" : null), language: () => "en", onError: (error) => assert.fail(String(error)), loadFont: async () => undefined });
    host.frame({ ...frame, discs: [] });
    await wait(100);
    host.refresh();
    await wait(50);
    assert.equal(host.stats.culture, "iau");
    assert.equal(warnings.length, 1, `one warning: ${warnings.join(" | ")}`);
    assert.match(warnings[0]!, /not a sky culture here \(iau\)/);
    host.dispose();
  } finally {
    console.warn = warn;
    setCultureLoaders({
      western: async () => (await import("@johnmorrisdotca/hoshi-stars/cultures/western")).western,
      japanese: async () => (await import("@johnmorrisdotca/hoshi-stars/cultures/japanese")).japanese,
      chinese: async () => (await import("@johnmorrisdotca/hoshi-stars/cultures/chinese")).chinese,
    });
  }
});
