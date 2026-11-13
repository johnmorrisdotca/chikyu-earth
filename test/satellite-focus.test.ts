import test from "node:test";
import assert from "node:assert/strict";
import { applySatelliteFocus, satelliteEmphasis, satelliteGroupRows, shellRadiusOf, zoomForOrthographicShell, zoomForPerspectiveShell } from "../src/space/satellite-focus.ts";
import { newSatelliteState } from "../src/space/satellite-layer.ts";
import { createSatellites, type ElementSet } from "../src/satellites/index.ts";
import { madeUp } from "./madeup-elements.ts";

const group = (id: string, count: number) => createSatellites(madeUp(id, count, "2026-11-02T12:00:00") as unknown as ElementSet[]);

test("the choice dims, hides and restores groups without changing the shown state the page set", () => {
  const state = newSatelliteState();
  state.groups.set("stations", { satellites: group("stations", 2), color: "#fff", size: 4, orbits: false, visible: true });
  state.groups.set("gps", { satellites: group("gps", 3), color: "#9cf", size: 3, orbits: false, visible: true });
  state.groups.set("weather", { satellites: group("weather", 1), color: "#fc9", size: 3, orbits: false, visible: false });

  assert.deepEqual(satelliteEmphasis("stations", true, null), { drawn: true, dim: 0, emphasis: "plain" });
  assert.equal(applySatelliteFocus(state, "missing").ok, false);
  assert.equal(state.focus, null, "a group that is not set changes nothing");

  const dimmed = applySatelliteFocus(state, "gps", { others: "dim" });
  assert.deepEqual(dimmed, { ok: true, group: "gps", count: 3, changed: true });
  assert.deepEqual(satelliteEmphasis("gps", true, state.focus), { drawn: true, dim: 0, emphasis: "focus" });
  assert.deepEqual(satelliteEmphasis("stations", true, state.focus), { drawn: true, dim: 1, emphasis: "dim" });
  assert.deepEqual(satelliteEmphasis("weather", false, state.focus), { drawn: false, dim: 0, emphasis: "hidden" });
  assert.equal(state.groups.get("stations")?.visible, true, "dimming does not change the page's shown state");
  assert.equal(state.groups.get("weather")?.visible, false);

  const again = applySatelliteFocus(state, "gps", { others: "dim" });
  assert.equal(again.ok && again.changed, false, "the same choice does not count as a change");

  const hidden = applySatelliteFocus(state, "stations", { others: "hide" });
  assert.equal(hidden.ok && hidden.changed, true);
  assert.deepEqual(satelliteEmphasis("stations", true, state.focus), { drawn: true, dim: 0, emphasis: "focus" });
  assert.deepEqual(satelliteEmphasis("gps", true, state.focus), { drawn: false, dim: 0, emphasis: "hidden" });
  assert.equal(state.groups.get("gps")?.visible, true, "hiding does not change the page's shown state");

  state.groups.get("gps")!.visible = false;
  const cleared = applySatelliteFocus(state, null);
  assert.deepEqual(cleared, { ok: true, group: null, count: 0, changed: true });
  assert.equal(state.focus, null);
  assert.equal(state.groups.get("gps")?.visible, false, "clearing puts back the shown state, including one changed while focused");
  assert.equal(state.groups.get("stations")?.visible, true);
  const rows = satelliteGroupRows(state);
  assert.deepEqual(rows.map((row) => row.emphasis), ["plain", "plain", "plain"]);
  assert.equal(rows.find((row) => row.name === "gps")?.count, 3);
});

test("the shell is the greatest apogee, in Earth radii, and the zoom that fits it", () => {
  assert.ok(Math.abs(shellRadiusOf([{ MEAN_MOTION: 1, ECCENTRICITY: 0 }]) - 6.62) < 0.001, "one revolution a day is 6.62 Earth radii");
  const iss = shellRadiusOf(group("stations", 1).sets);
  assert.ok(iss > 1.05 && iss < 1.2, `a station's shell is just outside the Earth, not ${iss}`);
  const gps = shellRadiusOf(group("gps", 2).sets);
  assert.ok(gps > 3.5 && gps < 5, `GPS sits a few Earth radii out, not ${gps}`);
  assert.equal(shellRadiusOf([{ MEAN_MOTION: 0.2, ECCENTRICITY: 0.5 }]), 8, "one far satellite does not push the shell past 8 Earth radii");
  const near = zoomForPerspectiveShell(iss, 0.9, 16 / 9, 0.000001, 2.5);
  const far = zoomForPerspectiveShell(gps, 0.9, 16 / 9, 0.000001, 2.5);
  assert.ok(far < near && near < 1, `the farther shell is a smaller zoom (${far} against ${near})`);
  const globe = zoomForOrthographicShell(gps, 1280, 900, 0.1, 5);
  assert.ok(globe < 0.5 && globe > 0.1, `the realistic Earth zooms out for GPS, not to ${globe}`);
});
