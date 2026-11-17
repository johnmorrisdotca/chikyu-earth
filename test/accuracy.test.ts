// The accuracy table in docs/guides/accuracy.md, held: the Sun's overhead point and the line between day and night against NASA/JPL Horizons, and the SGP4 places against Vallado's verification set.
// The reference values and their sources are in test/accuracy/references.ts. Each limit below is the worst error measured on 2026-11-17 plus a margin, as written beside it; a limit is never raised to make a test pass.
import assert from "node:assert/strict";
import test from "node:test";
import { checksum, elementSetOf, measureSgp4, measureSun } from "./accuracy/measure.ts";
import { SGP4, SUN } from "./accuracy/references.ts";

/** Degrees. Measured worst angle between the package's overhead Sun and Horizons': 0.0074 (2026-03-20). Limit 0.010, about a third above it. 0.010 degree is 1.1 km on the ground. */
const SUN_ANGLE_LIMIT_DEG = 0.01;
/** Degrees. Measured worst latitude (declination) difference: 0.0022 (2026-03-20). Limit 0.003. */
const SUN_LAT_LIMIT_DEG = 0.003;
/** Degrees. Measured worst longitude difference: 0.0070 (2026-03-20). Limit 0.010. */
const SUN_LON_LIMIT_DEG = 0.01;
/** Degrees. Measured worst distance of the day/night line from the line 90 degrees from Horizons' Sun: 0.0074 (2026-03-20). Limit 0.010. */
const TERMINATOR_LIMIT_DEG = 0.01;
/** Kilometres. Measured worst SGP4 distance from the published place: 0.000000008 (8 micrometres; the published places are written to 8 decimals of a kilometre). Limit 0.000001 (1 millimetre). */
const SGP4_LIMIT_KM = 0.000001;

const near = (value: number, limit: number, what: string): void => assert.ok(Math.abs(value) <= limit, `${what}: ${value} is beyond ${limit}`);

test("the reference element sets are the lines as published: 69 characters and their own check digits", () => {
  for (const c of SGP4) {
    for (const line of [c.line1, c.line2]) {
      assert.equal(line.length, 69, `${c.name}: length`);
      assert.equal(checksum(line), Number(line[68]), `${c.name}: check digit of ${line.slice(0, 2)}`);
    }
  }
});

test("the Sun's overhead point is within the stated limits of Horizons' on every date, 1950 to 2075", () => {
  const errors = measureSun();
  assert.equal(errors.length, SUN.length);
  for (const e of errors) {
    near(e.angle, SUN_ANGLE_LIMIT_DEG, `${e.utc} angle`);
    near(e.dLat, SUN_LAT_LIMIT_DEG, `${e.utc} latitude`);
    near(e.dLon, SUN_LON_LIMIT_DEG, `${e.utc} longitude`);
  }
});

test("the line between day and night is within the stated limit of the line 90 degrees from Horizons' Sun, all round", () => {
  for (const e of measureSun()) near(e.terminator, TERMINATOR_LIMIT_DEG, `${e.utc} terminator`);
});

test("SGP4 through createSatellites gives Vallado's published places within a millimetre: near Earth, strong drag and deep space", () => {
  const errors = measureSgp4();
  assert.equal(errors.length, SGP4.length);
  for (const e of errors) {
    assert.equal(e.rows, SGP4.find((c) => c.name === e.name)!.rows.length);
    near(e.worstKm, SGP4_LIMIT_KM, `${e.name} at ${e.worstAtMinutes} min`);
  }
});

test("the element sets read from the lines are the ones published (epoch, motion, drag)", () => {
  const { set, epochMs } = elementSetOf(SGP4[0]!);
  assert.equal(set.EPOCH, "2000-06-27T18:50:19.734Z");
  assert.equal(epochMs, Date.UTC(2000, 5, 27, 18, 50, 19, 734));
  assert.equal(set.MEAN_MOTION, 10.82419157);
  assert.equal(set.ECCENTRICITY, 0.1859667);
  assert.equal(set.BSTAR, 0.000028098);
  assert.equal(set.MEAN_MOTION_DOT, 0.00000023);
});
