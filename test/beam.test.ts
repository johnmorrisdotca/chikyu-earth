import assert from "node:assert/strict";
import { test } from "node:test";
import { BEAM_COLOUR, BEAM_ELEVATION, beamCells, footprintAngle, footprintKm, readBeam } from "../src/beam/geometry.ts";

const R = 6371;
const DEG = 180 / Math.PI;
/** The formula written out again, the other way round: the satellite's height from the ground's angle must give the height back. */
const heightFor = (angle: number, elevation: number): number => (R * Math.cos((elevation * Math.PI) / 180)) / Math.cos(angle + (elevation * Math.PI) / 180) - R;

test("the footprint is the circle the satellite is 25 degrees above: its angle gives the height back", () => {
  for (const heightKm of [420, 550, 800, 20_200, 35_786]) {
    const angle = footprintAngle(heightKm);
    assert.ok(angle > 0 && angle < Math.PI / 2);
    assert.ok(Math.abs(heightFor(angle, BEAM_ELEVATION) - heightKm) < 1e-6, `${heightKm} km`);
    assert.equal(footprintKm(heightKm), R * angle);
  }
});

test("known footprints: the ISS, a Starlink and a geostationary satellite", () => {
  assert.ok(Math.abs(footprintAngle(420) * DEG - 6.76) < 0.01);
  assert.ok(Math.abs(footprintKm(550) - 941) < 1);
  assert.ok(Math.abs(footprintAngle(35_786) * DEG - 57.13) < 0.01);
  // a higher satellite sees further, a stricter elevation sees less
  assert.ok(footprintKm(550) > footprintKm(420));
  assert.ok(footprintKm(550, 40) < footprintKm(550, 25));
  // an elevation of 0 is the horizon: the angle whose cosine is R / (R + h)
  assert.ok(Math.abs(footprintAngle(550, 0) - Math.acos(R / (R + 550))) < 1e-12);
});

test("no footprint for a satellite on the ground or an elevation at the zenith", () => {
  assert.equal(footprintAngle(0), 0);
  assert.equal(footprintAngle(-5), 0);
  assert.equal(footprintAngle(550, 90), 0);
  assert.equal(footprintKm(Number.NaN), 0);
});

test("the cells are a hexagonal pack that fits inside the footprint", () => {
  assert.deepEqual(beamCells(0, 1000).lattice, []);
  assert.equal(beamCells(1, 1000).lattice.length, 1);
  for (const [count, rings] of [[7, 1], [19, 2], [37, 3], [91, 5]] as const) {
    const cells = beamCells(count, 1000);
    assert.equal(cells.lattice.length, count);
    const far = Math.max(...cells.lattice.map((p) => Math.hypot(p[0]!, p[1]!)));
    assert.ok(far <= rings + 1e-9, `${count}: ${far}`);
    assert.ok(far * cells.pitch + cells.radius <= 0.97 + 1e-9, "the outermost cell is inside the rim");
    assert.ok(cells.radius < cells.pitch / 2, "neighbours do not touch");
  }
  // a smaller cell than the fit is honoured, a larger one is cut to the fit
  const fit = beamCells(19, 1000);
  assert.ok(Math.abs(beamCells(19, 1000, 20).radius - 0.02) < 1e-12);
  assert.equal(beamCells(19, 1000, 900).radius, fit.radius);
  assert.equal(beamCells(500, 1000).lattice.length, 91);
});

test("the attributes: off unless set, a bare attribute is on for the chosen satellite, and every value is held to its range", () => {
  const read = (attributes: Record<string, string>) => readBeam((name) => attributes[name] ?? null);
  assert.equal(read({}).on, false);
  assert.equal(read({ beam: "off" }).on, false);
  assert.equal(read({ beam: "" }).on, true);
  assert.equal(read({ beam: "selected" }).on, true);
  assert.deepEqual({ ...read({ beam: "" }), on: true }, { on: true, elevation: 25, cells: 0, cellSize: 0, colour: BEAM_COLOUR, strength: 0.6 });
  const wild = read({ beam: "", "beam-elevation": "200", "beam-cells": "1000", "beam-strength": "7", "beam-cell-size": "-3", "beam-color": "not a colour!" });
  assert.deepEqual([wild.elevation, wild.cells, wild.strength, wild.cellSize, wild.colour], [80, 91, 1, 0, BEAM_COLOUR]);
  assert.equal(read({ "beam-color": "#ff8800" }).colour, "#ff8800");
  assert.equal(read({ "beam-elevation": "abc" }).elevation, 25);
});
