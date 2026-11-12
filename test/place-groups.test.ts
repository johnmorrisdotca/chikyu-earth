// The place-groups attribute and the placeGroups property, on both elements, before the element is in the page: the property writes the attribute, and the attribute is what the property reads.
import assert from "node:assert/strict";
import test from "node:test";

class Stand {
  readonly attrs = new Map<string, string>();
  isConnected = false;
  setAttribute(name: string, value: string): void {
    this.attrs.set(name, String(value));
  }
  getAttribute(name: string): string | null {
    return this.attrs.has(name) ? this.attrs.get(name)! : null;
  }
  removeAttribute(name: string): void {
    this.attrs.delete(name);
  }
  hasAttribute(name: string): boolean {
    return this.attrs.has(name);
  }
  closest(): null {
    return null;
  }
  addEventListener(): void {}
  removeEventListener(): void {}
  dispatchEvent(): boolean {
    return true;
  }
}
Object.assign(globalThis, { HTMLElement: Stand, customElements: { define: () => undefined, get: () => undefined } });

const { ChikyuEarthRealistic } = await import("../src/realistic/element.ts");
const { ChikyuSpace } = await import("../src/space/element.ts");

for (const make of [() => new ChikyuEarthRealistic(), () => new ChikyuSpace()]) {
  test(`place-groups and placeGroups on ${make().constructor.name}`, () => {
    const earth = make();
    assert.equal(earth.placeGroups, true, "gathering is on when the attribute is absent");
    earth.setAttribute("place-groups", "off");
    assert.equal(earth.placeGroups, false);
    earth.setAttribute("place-groups", " OFF ");
    assert.equal(earth.placeGroups, false);
    earth.attributeChangedCallback("place-groups", null, "off");
    earth.placeGroups = true;
    assert.equal(earth.hasAttribute("place-groups"), false);
    assert.equal(earth.placeGroups, true);
    earth.placeGroups = false;
    assert.equal(earth.getAttribute("place-groups"), "off");
    assert.equal(earth.placeGroups, false);
  });
}
