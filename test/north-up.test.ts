// North at the top of the view above a satellite: the turn that puts it there, the pole rule and where north is in a picture.
import assert from "node:assert/strict";
import { test } from "node:test";
import { aboveAxes, localNorth, NORTH_UP_BLEND_DEG, NORTH_UP_POLE_DEG, northUpYaw, screenAngle, type Vec3 } from "../src/space/index.ts";

const RAD = Math.PI / 180;
const near = (a: number, b: number, tol: number, what: string): void => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** A place at a latitude and longitude, in the scene's axes (y north, longitude increasing towards -z), and the east and north unit vectors there. */
const at = (lat: number, lon: number, r = 1.066) => {
  const p: Vec3 = [r * Math.cos(lat * RAD) * Math.cos(lon * RAD), r * Math.sin(lat * RAD), -r * Math.cos(lat * RAD) * Math.sin(lon * RAD)];
  return { p, east: [-Math.sin(lon * RAD), 0, -Math.cos(lon * RAD)] as Vec3, north: [-Math.sin(lat * RAD) * Math.cos(lon * RAD), Math.cos(lat * RAD), Math.sin(lat * RAD) * Math.sin(lon * RAD)] as Vec3 };
};
const scaled = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k];

test("local north is level with the ground, points towards the pole, and is not defined at the pole", () => {
  for (const [lat, lon] of [[0, 0], [30, 100], [-45, -120], [80, 10]] as const) {
    const place = at(lat, lon);
    const north = localNorth(place.p)!;
    near(Math.hypot(...north), 1, 1e-12, "unit");
    near(dot(north, place.p), 0, 1e-9, "level");
    near(dot(north, place.north), 1, 1e-9, "the same as the formula for north");
    assert.ok(north[1] > 0, "towards the north pole");
  }
  assert.equal(localNorth([0, 1.07, 0]), null);
  assert.equal(localNorth([0, -1.07, 0]), null);
  assert.equal(localNorth([0, 0, 0]), null);
});

test("going north, north is already at the top: no turn", () => {
  const place = at(10, 20);
  const turn = northUpYaw(place.p, scaled(place.north, 7.6));
  near(turn.yaw, 0, 1e-9, "yaw");
  assert.equal(turn.weight, 1);
});

test("going east, north is on the left, a quarter turn; going west, on the right; going south, half a turn", () => {
  const place = at(10, 20);
  near(northUpYaw(place.p, scaled(place.east, 7.6)).yaw, 90 * RAD, 1e-9, "east");
  near(northUpYaw(place.p, scaled(place.east, -7.6)).yaw, -90 * RAD, 1e-9, "west");
  near(Math.abs(northUpYaw(place.p, scaled(place.north, -7.6)).yaw), 180 * RAD, 1e-9, "south");
});

test("the ISS going south-east: the picture is turned so north is at the top and the satellite's way is 128 degrees round", () => {
  const place = at(20, 30);
  // 128 degrees from north, clockwise: east by sin, north by cos
  const heading = 128 * RAD;
  const velocity: Vec3 = [0, 1, 2].map((i) => 7.66 * (Math.sin(heading) * place.east[i]! + Math.cos(heading) * place.north[i]!)) as Vec3;
  const { yaw, weight } = northUpYaw(place.p, velocity);
  assert.equal(weight, 1);
  // aboveAxes turns the top by yaw from the way it is going: with this yaw the top is north
  const view = aboveAxes(place.p, velocity, yaw, 0);
  near(dot(view.up, place.north), 1, 1e-9, "the top of the picture is north");
  // and the way it goes is 128 degrees clockwise from the top, in the picture (looking down at the ground, east to the right)
  const travel = (() => {
    const unit = scaled(velocity, 1 / Math.hypot(...velocity));
    const right = dot(unit, place.east);
    const up = dot(unit, view.up);
    return ((Math.atan2(right, up) / RAD) + 360) % 360;
  })();
  near(travel, 128, 1e-6, "travel");
  // a drag adds to it: 30 degrees of yaw turns the top 30 degrees off north
  const dragged = aboveAxes(place.p, velocity, yaw + 30 * RAD, 0);
  near(Math.acos(dot(dragged.up, place.north)) / RAD, 30, 1e-6, "dragged");
});

test("the pole rule: travel-up within 3 degrees of a pole, north-up from 6, a smooth mix between", () => {
  assert.equal(NORTH_UP_POLE_DEG, 3);
  assert.equal(NORTH_UP_BLEND_DEG, 3);
  const weightAt = (lat: number): number => {
    const place = at(lat, 0);
    return northUpYaw(place.p, scaled(place.east, 7.6)).weight;
  };
  assert.equal(weightAt(89), 0);
  assert.equal(weightAt(87.5), 0);
  assert.equal(weightAt(-88), 0);
  assert.equal(weightAt(84), 1);
  assert.equal(weightAt(0), 1);
  assert.equal(weightAt(-84), 1);
  const middle = weightAt(85.5);
  near(middle, 0.5, 1e-9, "half way is half");
  let last = 1;
  for (let lat = 84; lat <= 87; lat += 0.25) {
    const w = weightAt(lat);
    assert.ok(w <= last + 1e-12, `falls as the pole nears: ${lat} ${w}`);
    last = w;
  }
  // the pole itself (and a satellite not moving) has nothing to turn to
  assert.deepEqual(northUpYaw([0, 1.07, 0], [0.1, 0, 7]), { yaw: 0, weight: 0 });
  assert.deepEqual(northUpYaw([1.07, 0, 0], [0, 0, 0]), { yaw: 0, weight: 0 });
});

test("a polar orbit over the pole: the turn is held at 0 weight there, so the picture does not spin", () => {
  // a satellite going over the pole at 90 degrees inclination: the heading changes by half a turn across it
  const before = at(85.5, 0);
  const after = at(85.5, 180);
  const a = northUpYaw(before.p, scaled(before.north, 7.5));
  const b = northUpYaw(after.p, scaled(after.north, -7.5));
  near(a.weight, 0.5, 1e-9, "before");
  near(b.weight, 0.5, 1e-9, "after");
  assert.equal(northUpYaw(at(89.9, 0).p, scaled(at(89.9, 0).north, 7.5)).weight, 0);
});

test("where north is in a picture", () => {
  // an unturned camera: up is +y, right is +x
  near(screenAngle([0, 0, 0, 1], [0, 1, 0])!, 0, 1e-9, "up");
  near(screenAngle([0, 0, 0, 1], [1, 0, 0])!, 90, 1e-9, "right");
  near(screenAngle([0, 0, 0, 1], [0, -1, 0])!, 180, 1e-9, "down");
  near(screenAngle([0, 0, 0, 1], [-1, 0, 0])!, 270, 1e-9, "left");
  assert.equal(screenAngle([0, 0, 0, 1], [0, 0, 1]), null, "along the line of sight");
  // a camera turned a quarter turn about its line of sight (z), counter-clockwise: the world's +y is now along the camera's +x, to the right of its picture
  const s = Math.SQRT1_2;
  near(screenAngle([0, 0, s, s], [0, 1, 0])!, 90, 1e-9, "quarter turn");
  // a quarter turn about y leaves +y where it was
  near(screenAngle([0, s, 0, s], [0, 1, 0])!, 0, 1e-9, "about y");
});
