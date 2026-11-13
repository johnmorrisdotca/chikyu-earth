import assert from "node:assert/strict";
import test from "node:test";
import { earthHides } from "../src/space/satellite-layer.ts";
import { createPlaceLayer } from "../src/markers/place-layer.ts";

const camera = { x: 0, y: 0, z: 4 };

test("the Earth hides a satellite on the far side, not one in front, and not one at the limb", () => {
  assert.equal(earthHides(camera, { x: 0, y: 0, z: -1.2 }), true);
  assert.equal(earthHides(camera, { x: 0, y: 0, z: 1.2 }), false);
  // the line from the camera that just grazes the unit sphere, continued past the graze
  const tx = Math.sqrt(1 - (1 / 4) ** 2);
  const limb = { x: tx * 1.2, y: 0, z: 4 + 1.2 * (0.25 - 4) };
  assert.equal(earthHides(camera, limb), false);
  assert.equal(earthHides(camera, { x: 0.2, y: 0, z: -1.5 }), true);
});

interface Fake {
  className: string;
  hidden: boolean;
  textContent: string;
  dataset: Record<string, string>;
  style: { opacity: string; transform: string; setProperty(name: string, value: string): void; removeProperty(name: string): void; getPropertyValue(name: string): string };
  children: Fake[];
  ownerDocument: { createElement(tag: string): Fake };
  hasAttribute(name: string): boolean;
  [key: string]: unknown;
}

function fakeBox(): Fake {
  const doc = { createElement: (): Fake => fakeElement(doc) };
  return fakeElement(doc);
}
function fakeElement(doc: { createElement(tag: string): Fake }): Fake {
  const values = new Map<string, string>();
  const style = {
    setProperty: (name: string, value: string) => void values.set(name, value),
    removeProperty: (name: string) => void values.delete(name),
    getPropertyValue: (name: string) => values.get(name) ?? "",
    get opacity() {
      return values.get("opacity") ?? "";
    },
    set opacity(value: string) {
      values.set("opacity", value);
    },
    get transform() {
      return values.get("transform") ?? "";
    },
    set transform(value: string) {
      values.set("transform", value);
    },
  };
  const attrs = new Set<string>();
  const element: Fake = {
    className: "",
    hidden: false,
    textContent: "",
    dataset: {},
    style,
    children: [],
    ownerDocument: doc,
    setAttribute(name: string) {
      attrs.add(name);
    },
    toggleAttribute(name: string, on?: boolean) {
      if (on === false) attrs.delete(name);
      else attrs.add(name);
    },
    hasAttribute: (name: string) => attrs.has(name),
    append(...nodes: Fake[]) {
      element.children.push(...nodes);
    },
    replaceChildren() {
      element.children.length = 0;
    },
    getBoundingClientRect: () => ({ width: 40, height: 16 }),
    classList: { toggle() {} },
  };
  return element;
}

const view = { width: 400, height: 400, radius: 120, at: () => false };

test("an occluded name is dimmed and has no ring, and comes back when it is in front", () => {
  const box = fakeBox();
  const layer = createPlaceLayer(box as unknown as HTMLElement);
  const marks = [
    { id: "stations:0", label: "ISS", x: 200, y: 200, visible: false, occluded: true },
    { id: "stations:1", label: "Hubble", x: 80, y: 80, visible: true, occluded: false },
  ];
  layer.frame(view as unknown as Parameters<typeof layer.frame>[0], [], marks);
  const names = box.children.filter((child) => child.className === "pl-name" && !child.hidden);
  const rings = box.children.filter((child) => child.className === "pl-sat" && !child.hidden);
  const iss = names.find((name) => name.textContent === "ISS");
  const hubble = names.find((name) => name.textContent === "Hubble");
  assert.ok(iss, "the hidden name is still written");
  assert.equal(iss?.style.opacity, "0.45");
  assert.equal(iss.hasAttribute("data-occluded"), true);
  assert.equal(hubble?.style.opacity ?? "", "");
  assert.equal(rings.length, 1, "only the satellite in front has a ring");

  layer.dimOccluded = false;
  layer.frame(view as unknown as Parameters<typeof layer.frame>[0], [], marks);
  const left = box.children.filter((child) => child.className === "pl-name" && !child.hidden).map((name) => name.textContent);
  assert.deepEqual(left, ["Hubble"]);

  layer.dimOccluded = true;
  layer.frame(view as unknown as Parameters<typeof layer.frame>[0], [], [{ id: "stations:0", label: "ISS", x: 200, y: 200, visible: true, occluded: false }]);
  const back = box.children.find((child) => child.className === "pl-name" && !child.hidden && child.textContent === "ISS");
  assert.ok(back);
  assert.equal(back.style.opacity, "");
  assert.equal(back.hasAttribute("data-occluded"), false);
});
