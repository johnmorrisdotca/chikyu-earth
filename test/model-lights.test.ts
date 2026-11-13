import assert from "node:assert/strict";
import test from "node:test";
import * as three from "three";
import { stripLights } from "../src/space/model-lights.ts";

const visibleLights = (root: three.Object3D, kind: "isDirectionalLight" | "isPointLight" | "isAmbientLight"): number => {
  let found = 0;
  root.traverse((part) => {
    if ((part as unknown as Record<string, unknown>)[kind] === true && part.visible) found += 1;
  });
  return found;
};

test("a model's directional, point and spot lights are switched off and its first directional light's look is given back; an ambient light stays", () => {
  const model = new three.Group();
  const sun = new three.DirectionalLight(0xfff4e0, 3.2);
  const lamp = new three.PointLight(0xffffff, 2);
  const spot = new three.SpotLight(0xffffff, 1);
  const hemi = new three.HemisphereLight(0xffffff, 0x444444, 0.5);
  const fill = new three.AmbientLight(0x6f86a8, 0.9);
  const nested = new three.Group();
  nested.add(lamp);
  model.add(sun, nested, spot, hemi, fill);
  assert.equal(visibleLights(model, "isDirectionalLight"), 1);
  const look = stripLights(model);
  assert.deepEqual(look, { color: 0xfff4e0, intensity: 3.2 });
  assert.equal(visibleLights(model, "isDirectionalLight"), 0, "no directional light is left to count");
  assert.equal(visibleLights(model, "isPointLight"), 0, "a light deeper in the model too");
  assert.equal(spot.visible, false);
  assert.equal(hemi.visible, false);
  assert.equal(visibleLights(model, "isAmbientLight"), 1, "an ambient light does not change a program and is left");
  assert.equal(model.children.length, 5, "nothing is taken out of the model: a painter that disposes of or aims its light finds it");
});

test("a model with no light gives back nothing, and a second strip gives the same", () => {
  const model = new three.Group();
  model.add(new three.Mesh(new three.BoxGeometry(1, 1, 1), new three.MeshLambertMaterial({ color: 0xffffff })));
  assert.equal(stripLights(model), null);
  const lit = new three.Group();
  lit.add(new three.DirectionalLight(0xffffff, 2));
  assert.deepEqual(stripLights(lit), { color: 0xffffff, intensity: 2 });
  assert.deepEqual(stripLights(lit), { color: 0xffffff, intensity: 2 }, "a second strip finds the same look and leaves the light off");
  assert.equal((lit.children[0] as three.DirectionalLight).visible, false);
});
