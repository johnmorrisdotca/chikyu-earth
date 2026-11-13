// The package's own drawing of a satellite by kind (MODULES-1306): every part of every kind is inside the radius-1 disc the scene scales it by, so nothing of it can be drawn outside the box the scene reports, and the kind is told from the name.
import assert from "node:assert/strict";
import test from "node:test";
import * as three from "three";
import { genericSatellite, satelliteKind, type SatelliteKind } from "../src/space/generic-satellite.ts";
import { ABOVE_MODEL_KM, ABOVE_MODEL_SHARE, aboveModelShare, MODEL_FADE_FROM_KM, MODEL_FADE_TO_KM } from "../src/space/satellite-model.ts";

const KINDS: SatelliteKind[] = ["bus", "communications", "flat", "station", "cubesat"];

test("every part of every kind lies inside the unit sphere", () => {
  for (const kind of KINDS) {
    const drawing = genericSatellite(three as never, kind);
    drawing.object.updateMatrixWorld(true);
    let farthest = 0;
    let meshes = 0;
    drawing.object.traverse((part) => {
      const mesh = part as three.Mesh;
      if (!mesh.isMesh) return;
      meshes += 1;
      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox!;
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const corner = new three.Vector3(x, y, z).applyMatrix4(mesh.matrixWorld);
        farthest = Math.max(farthest, corner.length());
      }
    });
    assert.ok(meshes >= 3, `${kind} is made of parts`);
    assert.ok(farthest <= 1, `${kind}: its farthest corner is ${farthest.toFixed(3)} from the middle`);
    assert.ok(farthest > 0.4, `${kind}: it fills a good part of its disc`);
    drawing.dispose();
  }
});

test("the kind comes from the name", () => {
  assert.equal(satelliteKind("FLOCK 4G-28"), "cubesat");
  assert.equal(satelliteKind("LEMUR-2-JOHN"), "cubesat");
  assert.equal(satelliteKind("SPIRE LEMUR"), "cubesat");
  assert.equal(satelliteKind("DOVE 1234"), "cubesat");
  assert.equal(satelliteKind("STARLINK-1007"), "flat");
  assert.equal(satelliteKind("ISS (ZARYA)"), "station");
  assert.equal(satelliteKind("INTELSAT 39"), "communications");
  assert.equal(satelliteKind("NOAA 19"), "bus");
});

test("the model's share of the picture is never more than at the lowest height, falls with height, and is nothing from far up", () => {
  assert.equal(aboveModelShare(ABOVE_MODEL_KM), ABOVE_MODEL_SHARE);
  assert.equal(aboveModelShare(40), ABOVE_MODEL_SHARE, "nearer than the lowest height it does not grow");
  let last = Infinity;
  for (let km = 100; km <= 8000; km += 25) {
    const share = aboveModelShare(km);
    assert.ok(share <= last + 1e-12, `${km} km: it does not rise`);
    assert.ok(share <= ABOVE_MODEL_SHARE);
    last = share;
  }
  assert.ok(aboveModelShare(MODEL_FADE_FROM_KM) < aboveModelShare(ABOVE_MODEL_KM) / 5);
  assert.equal(aboveModelShare(MODEL_FADE_TO_KM), 0);
  assert.equal(aboveModelShare(6000), 0);
  // no pop: a step of one kilometre changes the share by under 0.15 per cent of the picture's height
  for (let km = 100; km < 3000; km += 1) assert.ok(Math.abs(aboveModelShare(km + 1) - aboveModelShare(km)) < 0.0015, `${km} km`);
});

test("given the scene's own Sun light, a drawing makes none of its own and points that one: the scene has the same lights whether or not a drawing is in it (MODULES-1293)", () => {
  const countLights = (root: three.Object3D): number => {
    let found = 0;
    root.traverse((part) => {
      if ((part as three.DirectionalLight).isDirectionalLight) found += 1;
    });
    return found;
  };
  const scene = new three.Scene();
  const sun = new three.DirectionalLight(0xfff4e0, 0);
  scene.add(sun);
  assert.equal(countLights(scene), 1, "one light with nothing drawn");
  const drawing = genericSatellite(three as never, "bus", { sun });
  scene.add(drawing.object);
  assert.equal(countLights(scene), 1, "still one with the drawing in the scene");
  drawing.light?.([0, 1, 0]);
  assert.deepEqual(sun.position.toArray(), [0, 1, 0], "the scene's light points to the Sun in the scene's axes");
  assert.ok(sun.intensity > 0, "and is on");
  scene.remove(drawing.object);
  drawing.dispose();
  assert.equal(countLights(scene), 1, "the drawing's going takes no light with it");
  // a drawing made as a page makes one (no shared light) still brings its own
  const alone = genericSatellite(three as never, "bus");
  assert.equal(countLights(alone.object), 1);
  alone.dispose();
});
