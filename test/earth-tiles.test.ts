// scripts/make-earth-tiles.py cut a tiny made-up map into tiles: the counts, the sizes and the seams (the antimeridian too) are checked by its own selftest.
// Pillow is needed; where Python has none the test is skipped (CI installs it and runs the selftest as a step of its own).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import test from "node:test";

const script = new URL("../scripts/make-earth-tiles.py", import.meta.url).pathname;
const venv = new URL("../.cache/venv/bin/python", import.meta.url).pathname;
const python = process.env.EARTH_TILES_PYTHON ?? (existsSync(venv) ? venv : "python3");
const hasPillow = spawnSync(python, ["-I", "-c", "import PIL"]).status === 0;

test("the tile script cuts a made-up map into well formed, seamless tiles", { skip: hasPillow ? false : "Pillow is not installed for Python" }, () => {
  const run = spawnSync(python, ["-I", script, "selftest"], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /selftest: ok/);
});
