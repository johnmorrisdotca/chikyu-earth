import assert from "node:assert/strict";
import { test } from "node:test";
import { CLOUD_RADIUS, GRID_COLUMNS } from "../src/realistic/earth.ts";
import { CLOUD_SHELL_FAR, CLOUD_SHELL_NEAR, CLOUD_SHELL_REACH, cloudShell } from "../src/space/cloud-shell.ts";

const KM = 6371;
/** How far above the ground's own edge a shell stands at the Earth's edge, in degrees, seen from `distance` Earth radii. */
const edgeLift = (shell: number, distance: number): number => ((shell - 1) / Math.sqrt(distance * distance - 1)) * (180 / Math.PI);

test("from a low orbit the clouds stand under a third of a degree above the Earth's edge", () => {
  for (const km of [400, 640, 2000, 12000, 40000]) {
    const distance = 1 + km / KM;
    assert.ok(edgeLift(cloudShell(distance), distance) < 0.33, `${km} km: ${edgeLift(cloudShell(distance), distance).toFixed(3)} degrees`);
  }
  // the far shell at 640 km is the lump that was seen: more than half a degree
  assert.ok(edgeLift(CLOUD_SHELL_FAR, 1 + 640 / KM) > 0.5);
});

test("the near shell clears the finer map tiles' shells by more than its flat faces dip", () => {
  const dip = 1 - Math.cos((Math.PI / 96)); // the space view's sphere has 96 columns: a face's middle is this far under its corners
  assert.ok(CLOUD_SHELL_NEAR * (1 - dip) > 1.0008, `${CLOUD_SHELL_NEAR * (1 - dip)}`);
});

test("the far shell is used only where the change is under half a pixel", () => {
  assert.equal(cloudShell(CLOUD_SHELL_REACH), CLOUD_SHELL_FAR);
  assert.equal(cloudShell(CLOUD_SHELL_REACH - 0.01), CLOUD_SHELL_NEAR);
  // a canvas at most 4096 pixels tall, a field of view of 35 degrees: the Earth's radius in pixels at the reach, times the change of the shell
  const radiusPx = 4096 / 2 / Math.tan((35 / 2) * (Math.PI / 180)) / CLOUD_SHELL_REACH;
  assert.ok(radiusPx * (CLOUD_SHELL_FAR - CLOUD_SHELL_NEAR) < 0.5, `${radiusPx * (CLOUD_SHELL_FAR - CLOUD_SHELL_NEAR)}`);
});

test("the realistic look's clouds sit on the near shell, clear of the finer map tiles, and stand a few pixels at most above the edge of a 4096 pixel globe", () => {
  assert.equal(CLOUD_RADIUS, CLOUD_SHELL_NEAR);
  const dip = 1 - Math.cos(Math.PI / GRID_COLUMNS);
  assert.ok(CLOUD_RADIUS * (1 - dip) > 1.0008, `${CLOUD_RADIUS * (1 - dip)}`);
  // an orthographic globe at most 4096 pixels across: the lump is the shell's height in pixels (it was 12 pixels at 1.006)
  const radiusPx = 4096 / 2;
  assert.ok(radiusPx * (CLOUD_RADIUS - 1) < 3.5, `${radiusPx * (CLOUD_RADIUS - 1)}`);
  assert.ok(radiusPx * (CLOUD_SHELL_FAR - 1) > 10);
});
