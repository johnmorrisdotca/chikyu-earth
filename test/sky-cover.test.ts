// Which bodies cover the sky, for a camera riding along a satellite (a 60 degree view with the Earth 70 degrees across): the cover is worked out from the ray through each pixel, and is exact where a circle on the screen is not.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { coverBody, covers } from "../src/sky/cover.ts";
import { ridePose } from "../src/space/ride.ts";

const RAD = Math.PI / 180;
const SIZE = 600;

/** A camera riding at the ISS's height with the horizon look, turned by `yaw` of the controls and tipped by `tilt`. */
function rider(yaw = 0, tilt = 0): { camera: THREE.PerspectiveCamera; cover: (x: number, y: number) => boolean; angleToNadir: (x: number, y: number) => number; discAt: (x: number, y: number) => boolean } {
  const pose = ridePose({ position: [1.066, 0, 0], velocity: [0, 0, -7.66], look: "horizon", yaw, tilt, zoom: 1 });
  const camera = new THREE.PerspectiveCamera(pose.fov, 1, 0.001, 2000);
  camera.position.set(...pose.position);
  camera.up.set(...pose.up);
  camera.lookAt(pose.position[0] + pose.forward[0], pose.position[1] + pose.forward[1], pose.position[2] + pose.forward[2]);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const earth = [coverBody([0, 0, 0], pose.position, 1)];
  const ray = new THREE.Vector3();
  const rayAt = (x: number, y: number): THREE.Vector3 => ray.set((x / SIZE) * 2 - 1, 1 - (y / SIZE) * 2, 0.5).unproject(camera).sub(camera.position).normalize();
  // the on-axis circle the screen would give: the Earth's centre projected, with its radius in pixels
  const centre = new THREE.Vector3(0, 0, 0).project(camera);
  const radius = ((SIZE / 2) * (1 / Math.sqrt(1.066 * 1.066 - 1))) / Math.tan((pose.fov / 2) * RAD);
  return {
    camera,
    cover: (x, y) => {
      const r = rayAt(x, y);
      return covers(earth, r.x, r.y, r.z);
    },
    angleToNadir: (x, y) => (Math.acos(Math.max(-1, Math.min(1, -rayAt(x, y).x))) / RAD),
    discAt: (x, y) => (x - ((centre.x + 1) / 2) * SIZE) ** 2 + (y - ((1 - centre.y) / 2) * SIZE) ** 2 <= radius * radius,
  };
}

test("the Earth covers a pixel exactly when the ray through it is within the Earth's angular radius of the way down", () => {
  const view = rider();
  const horizon = Math.asin(1 / 1.066) / RAD;
  for (const x of [60, 300, 540]) {
    let flips = 0;
    let was = view.cover(x, 0);
    for (let y = 1; y < SIZE; y += 1) {
      const now = view.cover(x, y);
      if (now !== was) {
        flips += 1;
        const angle = view.angleToNadir(x, y);
        assert.ok(Math.abs(angle - horizon) < 0.4, `at column ${x} the edge is ${angle.toFixed(2)} degrees from straight down, the horizon is ${horizon.toFixed(2)}`);
      }
      was = now;
    }
    assert.equal(flips, 1, `one edge down column ${x}`);
    assert.equal(view.cover(x, SIZE - 1), true, "the bottom is the Earth");
    assert.equal(view.cover(x, 0), false, "the top is the sky");
  }
});

test("a circle on the screen is wrong at the edges of a wide view, and the ray's cover is not", () => {
  const view = rider();
  // the pixels the circle and the ray disagree on, at the sides of the picture
  let wrong = 0;
  for (let y = 0; y < SIZE; y += 4) for (const x of [10, 590]) if (view.discAt(x, y) !== view.cover(x, y)) wrong += 1;
  assert.ok(wrong > 0, "the on-axis circle is not the Earth's edge at the sides of a 60 degree view");
});

test("looking round on the spot the cover stays the Earth: the same horizon in every heading", () => {
  const horizon = Math.asin(1 / 1.066) / RAD;
  for (const degrees of [0, 90, 180, 270]) {
    const view = rider(degrees / (1.5 * (60 / 180)), 0);
    for (let y = 1; y < SIZE; y += 1) {
      if (view.cover(300, y) !== view.cover(300, y - 1)) assert.ok(Math.abs(view.angleToNadir(300, y) - horizon) < 0.4, `the edge at ${degrees} degrees`);
    }
  }
});

test("a camera inside a body is covered everywhere, and a far one covers only its own disc", () => {
  const inside = [coverBody([0, 0, 0], [0.5, 0, 0], 1)];
  assert.equal(covers(inside, 0, 1, 0), true);
  const far = [coverBody([0, 0, 0], [10, 0, 0], 1)];
  assert.equal(covers(far, -1, 0, 0), true, "straight at it");
  assert.equal(covers(far, -Math.cos(10 * RAD), Math.sin(10 * RAD), 0), false, "10 degrees off, past its 5.7 degree radius");
  assert.equal(covers(far, -Math.cos(5 * RAD), Math.sin(5 * RAD), 0), true, "5 degrees off, inside it");
});
