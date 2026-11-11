// How many stars the space view's own camera shows: the picture opens with the Earth filling 90% of it, so the sky is only the corners, and a few of the 335 named stars are in view; the names asked for (12) are a most, not a count. The projection is the
// scene's own (a direction far along the sky from the camera, seen through a 35 degree camera), with three.js's camera maths, and the discs that cover the sky.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createStarNames } from "@johnmorrisdotca/hoshi-stars/sky-labels";
import * as THREE from "three";
import { DEFAULT_EARTH_SIZE, fitDistance } from "../src/space/scene.ts";

const RAD = Math.PI / 180;
const WIDTH = 600;
const HEIGHT = 600;

/** The labels laid out for a camera held over a direction of the sky, the Earth as big as `size` says. */
function named(size: number, ra: number, dec: number): { x: number; y: number; text: string }[] {
  const distance = fitDistance(size, 1);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 1000);
  camera.position.set(distance * Math.cos(dec * RAD) * Math.cos(ra * RAD), distance * Math.sin(dec * RAD), -distance * Math.cos(dec * RAD) * Math.sin(ra * RAD));
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const radius = ((HEIGHT / 2) * (1 / Math.sqrt(distance * distance - 1))) / Math.tan(17.5 * RAD);
  const covered = (x: number, y: number): boolean => (x - WIDTH / 2) ** 2 + (y - HEIGHT / 2) ** 2 <= radius * radius;
  const names = createStarNames({ count: 12, lang: "en" });
  const point = new THREE.Vector3();
  names.update(
    (rightAscension, declination, out) => {
      const r = rightAscension * RAD;
      const d = declination * RAD;
      point.set(Math.cos(d) * Math.cos(r), Math.sin(d), -Math.cos(d) * Math.sin(r)).multiplyScalar(500).add(camera.position).project(camera);
      out.x = ((point.x + 1) / 2) * WIDTH;
      out.y = ((1 - point.y) / 2) * HEIGHT;
      return point.z > -1 && point.z < 1;
    },
    { width: WIDTH, height: HEIGHT },
    covered,
  );
  return names.labels.map((label) => ({ x: label.x, y: label.y, text: label.text }));
}

const average = (size: number): { mean: number; none: number; most: number; views: number } => {
  const counts: number[] = [];
  for (let ra = 0; ra < 360; ra += 15) for (const dec of [-60, -30, 0, 30, 60]) counts.push(named(size, ra, dec).length);
  return { mean: counts.reduce((a, b) => a + b, 0) / counts.length, none: counts.filter((c) => c === 0).length, most: Math.max(...counts), views: counts.length };
};

test("at the opening size the Earth covers most of the picture: a few stars are named, and a tenth of the views have none", () => {
  const opening = average(DEFAULT_EARTH_SIZE);
  assert.ok(opening.mean > 1 && opening.mean < 3.5, `about two names on average, not twelve: ${opening.mean.toFixed(2)}`);
  assert.ok(opening.none > 0, "some views of the sky have no named star in the corners");
  assert.ok(opening.most <= 8);
});

test("a small Earth leaves the sky to the names: most views have several", () => {
  const small = average(0.25);
  assert.ok(small.mean > 6, `a small Earth: ${small.mean.toFixed(2)} names on average`);
  assert.ok(small.none <= small.views * 0.05, "almost no view is empty");
  assert.equal(small.most, 12, "and twelve are named when asked for twelve");
});

test("no name is on the Earth's disc or outside the picture", () => {
  for (const size of [0.9, 0.5, 0.25]) {
    const distance = fitDistance(size, 1);
    const radius = ((HEIGHT / 2) * (1 / Math.sqrt(distance * distance - 1))) / Math.tan(17.5 * RAD);
    for (let ra = 0; ra < 360; ra += 30) {
      for (const label of named(size, ra, 20)) {
        assert.ok((label.x - WIDTH / 2) ** 2 + (label.y - HEIGHT / 2) ** 2 > radius * radius, `${label.text} is behind the Earth`);
        assert.ok(label.x >= 0 && label.x <= WIDTH && label.y >= 0 && label.y <= HEIGHT, `${label.text} is outside the picture`);
      }
    }
  }
});
