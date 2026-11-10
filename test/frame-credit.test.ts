// The credit line of a globe frame names only the sources its picture uses, in English and Japanese.
import assert from "node:assert/strict";
import { test } from "node:test";
import { globeCreditText } from "../demo/frame-credit.ts";

test("a flat globe credits only the outlines", () => {
  assert.equal(globeCreditText({ look: null, satellites: false }, false), "Outlines: Natural Earth. All credits");
  assert.equal(globeCreditText({ look: "thick", satellites: false }, false), "Outlines: Natural Earth. All credits");
});

test("the realistic Earth adds NASA's pictures, the space view the positions and, with satellites, the orbits", () => {
  assert.match(globeCreditText({ look: "realistic", satellites: false }, false), /Pictures: NASA\./);
  const space = globeCreditText({ look: "space", satellites: false }, false);
  assert.match(space, /astronomy-engine/);
  assert.doesNotMatch(space, /CelesTrak/);
  assert.match(globeCreditText({ look: "space", satellites: true }, false), /Orbits: CelesTrak, Space-Track\.org\./);
});

test("the Japanese line names the same sources", () => {
  assert.equal(globeCreditText({ look: "realistic", satellites: false }, true), "輪郭：Natural Earth。画像：NASA。 出典一覧");
  assert.match(globeCreditText({ look: "space", satellites: true }, true), /軌道データ：CelesTrak、Space-Track\.org。/);
});
