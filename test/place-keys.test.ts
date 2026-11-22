import test from "node:test";
import assert from "node:assert/strict";
import { cleanPlaces, orthoView } from "../src/markers/index.ts";
import { createPlaceLayer } from "../src/markers/place-layer.ts";
import { bindPlaceKeys, placeKeyWords } from "../src/markers/place-keys.ts";

// Just enough of a page for the layer and the keys: elements that take children, a style and a size, and a host that hears keys.
interface Fake {
  className: string;
  hidden: boolean;
  textContent: string;
  lang: string;
  dataset: Record<string, string>;
  style: Record<string, unknown>;
  children: Fake[];
  [key: string]: unknown;
}
function fakeElement(doc: { createElement(tag: string): Fake }): Fake {
  const values = new Map<string, string>();
  const style: Record<string, unknown> = { setProperty: (n: string, v: string) => void values.set(n, v), removeProperty: (n: string) => void values.delete(n), getPropertyValue: (n: string) => values.get(n) ?? "" };
  for (const name of ["transform", "opacity"]) Object.defineProperty(style, name, { get: () => values.get(name) ?? "", set: (v: string) => void values.set(name, v) });
  const element: Fake = {
    className: "",
    hidden: false,
    textContent: "",
    lang: "",
    dataset: {},
    style,
    children: [],
    setAttribute() {},
    toggleAttribute() {},
    append(...nodes: Fake[]) {
      element.children.push(...nodes);
    },
    replaceChildren() {
      element.children.length = 0;
    },
    getBoundingClientRect: () => ({ width: 40, height: 16 }),
    classList: { toggle() {} },
    ownerDocument: doc,
  };
  return element;
}
const fakeBox = (): Fake => {
  const doc = { createElement: (): Fake => fakeElement(doc) };
  return fakeElement(doc);
};
const ring = (box: Fake): Fake | undefined => box.children.find((child) => child.className === "pl-current");

const TOKYO = { lon: 139.69, lat: 35.69 };
const view = () => orthoView({ lon: TOKYO.lon, lat: TOKYO.lat, radius: 200, cx: 210, cy: 210, width: 420, height: 420 });
const PLACES = cleanPlaces([
  { id: "osaka", lon: 135.5, lat: 34.69, label: "Osaka" },
  { id: "seoul", lon: 126.98, lat: 37.57, label: "Seoul" },
  { id: "here", lon: TOKYO.lon, lat: TOKYO.lat, label: "Tokyo", kind: "here" },
  { id: "behind", lon: TOKYO.lon + 180, lat: 0, label: "Behind" },
]);

test("the keys step through the places in sight from the left, wrap round, and start at either end", () => {
  const box = fakeBox();
  const layer = createPlaceLayer(box as unknown as HTMLElement);
  assert.equal(layer.step(1), null, "nothing before a picture");
  layer.set(PLACES);
  layer.frame(view());
  assert.deepEqual(layer.reachable().map((item) => item.place.id), ["seoul", "osaka", "here"], "left to right, the far side left out");
  assert.equal(layer.current, null);
  const first = layer.step(1)!;
  assert.deepEqual([first.place.id, first.position, first.total], ["seoul", 1, 3]);
  assert.equal(layer.step(1)!.place.id, "osaka");
  assert.equal(layer.step(1)!.place.id, "here");
  assert.equal(layer.step(1)!.place.id, "seoul", "round to the first");
  assert.equal(layer.step(-1)!.place.id, "here", "back round to the last");
  layer.current = null;
  assert.equal(layer.step(-1)!.place.id, "here", "the last, when none is current and the step is back");
});

test("the current place is ringed where it is, the ring follows the picture and goes with the picture and with the place", () => {
  const box = fakeBox();
  const layer = createPlaceLayer(box as unknown as HTMLElement);
  layer.set(PLACES);
  layer.frame(view());
  assert.equal(ring(box), undefined, "no ring until a place is current");
  layer.step(1);
  const at = layer.where(layer.current!)!;
  assert.equal(ring(box)!.hidden, false);
  assert.equal(ring(box)!.style["transform"], `translate(${at.x.toFixed(1)}px,${at.y.toFixed(1)}px)`);

  layer.frame(orthoView({ lon: TOKYO.lon + 4, lat: TOKYO.lat, radius: 200, cx: 210, cy: 210, width: 420, height: 420 }));
  const moved = layer.where(layer.current!)!;
  assert.notEqual(moved.x, at.x);
  assert.equal(ring(box)!.style["transform"], `translate(${moved.x.toFixed(1)}px,${moved.y.toFixed(1)}px)`, "turned with the Earth");

  layer.frame(orthoView({ lon: TOKYO.lon + 180, lat: 0, radius: 200, cx: 210, cy: 210, width: 420, height: 420 }));
  assert.equal(layer.where(layer.current!), null, "on the far side");
  assert.equal(ring(box)!.hidden, true);
  assert.equal(layer.current?.id, "seoul", "still the place the keys are on");

  layer.frame(view());
  assert.equal(ring(box)!.hidden, false);
  layer.set(PLACES.filter((place) => place.id !== "seoul"));
  assert.equal(layer.current as unknown, null, "a place taken out of the list is let go");
  assert.equal(ring(box)!.hidden, true);

  layer.frame(view());
  layer.step(1);
  layer.layers = {};
  layer.set(PLACES);
  assert.equal((layer.current as { id: string } | null)?.id, "osaka", "a list set again keeps the place by its id");
  layer.frame(null);
  assert.equal(ring(box)!.hidden, true, "no picture, no ring");
});

test("a crowd's places are reachable only where each stands alone", () => {
  const layer = createPlaceLayer(fakeBox() as unknown as HTMLElement);
  layer.set(cleanPlaces(Array.from({ length: 400 }, (_, i) => ({ id: `p${i}`, lon: TOKYO.lon - 8 + (i % 20) * 0.8, lat: TOKYO.lat - 6 + Math.floor(i / 20) * 0.6 }))));
  layer.frame(view());
  assert.ok(layer.stats.groups > 0);
  const reachable = layer.reachable();
  assert.ok(reachable.length < 400, "the places gathered in a ring with a count are not each one a stop");
  assert.ok(reachable.every((item) => item.place.id.startsWith("p")));
});

test("the words say the place and its turn in English and Japanese", () => {
  assert.equal(placeKeyWords("en", "at", { name: "Osaka", n: 2, total: 5 }), "Osaka, 2 of 5");
  assert.equal(placeKeyWords("ja", "at", { name: "大阪", n: 2, total: 5 }), "大阪、5か所のうち2番目");
  assert.equal(placeKeyWords("en", "none"), "No places in view");
  assert.equal(placeKeyWords("ja", "none"), "見えている場所はありません");
  assert.equal(placeKeyWords("en", "hidden", { name: "Osaka" }), "Osaka is not in view");
  assert.equal(placeKeyWords("ja", "hidden", { name: "大阪" }), "大阪は見えていません");
});

class FakeHost extends EventTarget {
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>([["role", "img"]]);
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  contains(): boolean {
    return false;
  }
}
const press = (host: FakeHost, key: string, init: { shiftKey?: boolean; ctrlKey?: boolean; repeat?: boolean } = {}): Event & { key: string } => {
  const event = Object.assign(new Event("keydown", { cancelable: true }), { key, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, repeat: false, composedPath: () => [], ...init });
  host.dispatchEvent(event);
  return event;
};

test("P and Shift+P move between places and say the name, Enter sends chikyu-place-click, Escape lets go, and other keys are left alone", () => {
  Object.assign(globalThis, { HTMLElement: class {} });
  const layer = createPlaceLayer(fakeBox() as unknown as HTMLElement);
  layer.set(PLACES);
  layer.frame(view());
  const host = new FakeHost();
  const live = { textContent: "", lang: "" };
  let language: "en" | "ja" = "en";
  const keys = bindPlaceKeys(host as unknown as HTMLElement, () => layer, () => live as unknown as HTMLElement, () => language, true);
  const told: { id: string; kind: string; label?: string; x: number; y: number }[] = [];
  host.addEventListener("chikyu-place-click", (event) => told.push((event as CustomEvent).detail));

  assert.equal(press(host, "Enter").defaultPrevented, false, "Enter with no place current is the page's");
  assert.equal(told.length, 0);
  for (const key of ["ArrowLeft", "ArrowUp", "+", "-", "0", "Home", " ", "c", "w"]) assert.equal(press(host, key).defaultPrevented, false, `${key} is not taken`);
  assert.equal(press(host, "p", { ctrlKey: true }).defaultPrevented, false, "Ctrl+P is the browser's");

  assert.equal(press(host, "p").defaultPrevented, true);
  assert.equal(live.textContent, "Seoul, 1 of 3");
  assert.equal(live.lang, "en");
  press(host, "P", { shiftKey: true });
  assert.equal(live.textContent, "Tokyo, 3 of 3", "Shift+P goes back, round to the last");
  press(host, "P", { shiftKey: true });
  assert.equal(layer.current?.id, "osaka");
  language = "ja";
  press(host, "p");
  assert.equal(live.textContent, "Tokyo、3か所のうち3番目");
  assert.equal(live.lang, "ja");

  assert.equal(press(host, "Enter").defaultPrevented, true);
  assert.equal(told.length, 1);
  const foot = layer.where(layer.current!)!;
  assert.deepEqual(told[0], { id: "here", kind: "here", label: "Tokyo", lon: TOKYO.lon, lat: TOKYO.lat, x: foot.x, y: foot.y });
  press(host, "Enter", { repeat: true });
  assert.equal(told.length, 1, "a held Enter is one press");

  layer.frame(orthoView({ lon: TOKYO.lon + 180, lat: 0, radius: 200, cx: 210, cy: 210, width: 420, height: 420 }));
  press(host, "Enter");
  assert.equal(told.length, 1, "a place out of sight is not pressed");
  assert.equal(live.textContent, "Tokyoは見えていません");

  press(host, "Escape");
  assert.equal(layer.current, null);
  assert.equal(live.textContent, "");
  assert.equal(press(host, "Escape").defaultPrevented, false, "Escape with nothing current is the page's");

  press(host, "p");
  assert.equal(live.textContent, "見えている場所はありません");

  host.dataset["state"] = "lost";
  for (const key of ["p", "Enter", "Escape"]) assert.equal(press(host, key).defaultPrevented, false, `${key} waits while the context is lost`);
  assert.equal(layer.current, null);
  press(host, "P", { shiftKey: true });
  assert.equal(layer.current, null, "no step while lost");
  assert.equal(told.length, 1, "no event while lost");
  host.dataset["state"] = "live";
  layer.frame(view());
  press(host, "p");
  assert.equal((layer.current as { id: string } | null)?.id, "seoul", "the keys work again once the view is back");
  layer.current = null;

  keys.stop();
  layer.frame(view());
  press(host, "p");
  assert.equal(layer.current, null, "after stop the keys do nothing");
});

test("an element with places is a group for a screen reader, and back to an image with none; a role the page set is kept", () => {
  const host = new FakeHost();
  const keys = bindPlaceKeys(host as unknown as HTMLElement, () => undefined, () => null, () => "en", true);
  keys.sync(0);
  assert.equal(host.getAttribute("role"), "img");
  keys.sync(3);
  assert.equal(host.getAttribute("role"), "group");
  keys.sync(0);
  assert.equal(host.getAttribute("role"), "img");
  keys.sync(2);
  keys.stop();
  assert.equal(host.getAttribute("role"), "img", "stopped: as it was");

  const own = new FakeHost();
  own.setAttribute("role", "img");
  bindPlaceKeys(own as unknown as HTMLElement, () => undefined, () => null, () => "en", false).sync(5);
  assert.equal(own.getAttribute("role"), "img", "the page's own role is left alone");
});
