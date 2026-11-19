import assert from "node:assert/strict";
import test from "node:test";
import { CLOUD_FADE_DEFAULT, CLOUD_FADE_START, CLOUD_WIDTH, cloudFade, readCloudFade } from "../src/realistic/cloud-fade.ts";
import { TEXEL_SLACK, tileLevel } from "../src/realistic/tiles.ts";

const KM = 6371;
/** The Earth's radius in device pixels for a pixel this many kilometres of ground wide. */
const radiusFor = (kmPerPixel: number): number => KM / kmPerPixel;

test("the clouds are whole while the whole Earth is in view, and the cloud picture is 2048 across", () => {
  assert.equal(CLOUD_WIDTH, 2048);
  // a 1000 pixel globe on a 2x screen: radius 900 device pixels, a texel under 3 pixels
  assert.equal(cloudFade(900, CLOUD_FADE_DEFAULT), 1);
  assert.equal(cloudFade(400, CLOUD_FADE_DEFAULT), 1);
});

test("they go from whole at a quarter of the width to gone at the width, and only go down as the view closes", () => {
  const texel = (px: number): number => (px * CLOUD_WIDTH) / (2 * Math.PI);
  assert.equal(cloudFade(texel(CLOUD_FADE_DEFAULT * CLOUD_FADE_START), CLOUD_FADE_DEFAULT), 1);
  assert.ok(Math.abs(cloudFade(texel((CLOUD_FADE_DEFAULT * (1 + CLOUD_FADE_START)) / 2), CLOUD_FADE_DEFAULT) - 0.5) < 1e-9, "half way between");
  assert.equal(cloudFade(texel(CLOUD_FADE_DEFAULT), CLOUD_FADE_DEFAULT), 0);
  let last = 1;
  for (let radius = 100; radius <= 20000; radius *= 1.1) {
    const now = cloudFade(radius, CLOUD_FADE_DEFAULT);
    assert.ok(now <= last && now >= 0 && now <= 1, `radius ${radius}: ${now}`);
    last = now;
  }
});

test("it is the ground a pixel that decides: whole at 5 km and 2.4 km a pixel, on its way at 1.2 km, gone at 0.6 km", () => {
  assert.equal(cloudFade(radiusFor(5), CLOUD_FADE_DEFAULT), 1, "5 km a pixel");
  assert.equal(cloudFade(radiusFor(2.45), CLOUD_FADE_DEFAULT), 1, "2.4 km a pixel: a texel is 8 pixels");
  assert.ok(cloudFade(radiusFor(1.22), CLOUD_FADE_DEFAULT) < 1 && cloudFade(radiusFor(1.22), CLOUD_FADE_DEFAULT) > 0, "1.2 km a pixel (level 5 ground): on its way");
  assert.ok(cloudFade(radiusFor(0.6), CLOUD_FADE_DEFAULT) < 0.01, "0.6 km a pixel");
  // a ride 486 km up with a 35 degree view 900 CSS pixels tall on a 2x screen: about 0.17 km a pixel at the nearest ground
  const focal = 900 / 2 / Math.tan((35 / 2) * (Math.PI / 180));
  const radiusPx = (focal / (486 / KM)) * 2;
  assert.ok(KM / radiusPx < 0.2, `${KM / radiusPx} km a pixel`);
  assert.equal(cloudFade(radiusPx, CLOUD_FADE_DEFAULT), 0);
});

test("it reads the same radius the tiles do: whole where the tiles first start, on its way where their finest day level is wanted", () => {
  const day = { tileSize: 512, levels: [{ level: 3, width: 8192 }, { level: 4, width: 16384 }, { level: 5, width: 32768 }] };
  // the radius at which the tiles want level 5: texels 32768 wide at a texel about a pixel (1.25 slack)
  const radius = (32768 * TEXEL_SLACK) / (2 * Math.PI);
  assert.equal(tileLevel(radius, day, 4096), 5);
  assert.ok(cloudFade(radius, CLOUD_FADE_DEFAULT) > 0 && cloudFade(radius, CLOUD_FADE_DEFAULT) < 1);
  // and where the tiles first start (a texel 4096 across is a pixel), the clouds are still whole
  assert.equal(cloudFade((4096 * TEXEL_SLACK) / (2 * Math.PI), CLOUD_FADE_DEFAULT), 1);
});

test("a width of 8 fades sooner than 16, and 0 turns the fade off", () => {
  const radius = radiusFor(3);
  assert.ok(cloudFade(radius, 8) < cloudFade(radius, 16));
  for (const radiusPx of [100, 5000, 1e6]) {
    assert.equal(cloudFade(radiusPx, 0), 1);
    assert.equal(cloudFade(radiusPx, -3), 1);
    assert.equal(cloudFade(radiusPx, Number.NaN), 1);
  }
});

test("a different cloud picture width moves the fade with it", () => {
  const radius = radiusFor(3);
  assert.ok(cloudFade(radius, 16, 1024) < cloudFade(radius, 16, 2048), "a coarser picture fades sooner");
});

test("the cloud-fade attribute: off, 0 or a number from 1 to 1000, else the default", () => {
  assert.equal(readCloudFade(null), CLOUD_FADE_DEFAULT);
  assert.equal(readCloudFade("off"), 0);
  assert.equal(readCloudFade(" off "), 0);
  assert.equal(readCloudFade("8"), 8);
  assert.equal(readCloudFade("2.5"), 2.5);
  assert.equal(readCloudFade("0"), 0);
  assert.equal(readCloudFade("0.2"), 1);
  assert.equal(readCloudFade("5000"), 1000);
  for (const bad of ["", "  ", "on", "abc", "NaN", "Infinity", "-4"]) assert.equal(readCloudFade(bad), CLOUD_FADE_DEFAULT, JSON.stringify(bad));
});
