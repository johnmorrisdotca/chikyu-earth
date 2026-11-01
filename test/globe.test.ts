import test from "node:test";
import assert from "node:assert/strict";
import { globe } from "../src/globe.ts";

test("the globe is an SVG with a rim and country outlines", () => {
  const svg = globe();
  assert.ok(svg.startsWith("<svg"));
  assert.ok(svg.includes('viewBox="0 0 320 320"'));
  assert.ok((svg.match(/<path/g) ?? []).length > 50);
});

test("it is pure: the same arguments give the same markup", () => {
  assert.equal(globe({ rotation: [10, -20] }), globe({ rotation: [10, -20] }));
});

test("turning the globe changes the drawing", () => {
  assert.notEqual(globe({ rotation: [0, 0] }), globe({ rotation: [180, 0] }));
});

test("size and style are honoured", () => {
  const svg = globe({ size: 600, style: "thick" });
  assert.ok(svg.includes('viewBox="0 0 600 600"'));
  assert.ok(svg.includes('stroke-width="2"'));
});

test("graticule is opt-in", () => {
  assert.ok(!globe().includes('stroke-opacity="0.35"'));
  assert.ok(globe({ graticule: true }).includes('stroke-opacity="0.35"'));
});
