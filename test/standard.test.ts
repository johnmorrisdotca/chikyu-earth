// The family's must-have list for a package (spx-stats docs/package-work.md, "The must-have list"; kazoku-ui docs/package-standard.md), as a check that fails when an item is missing.
// scripts/check-standard.mjs is kazoku-ui's templates/check-standard.mjs (kazoku-ui main, commit 3f218ab: after the v0.9.1 tag, so in its next release), copied unchanged and held to one recorded hash.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const standard = (await import(new URL("../scripts/check-standard.mjs", import.meta.url).href)) as { STANDARD_VERSION: string; standardProblems(root: string): string[] };

const RECORDED = { version: "2026-11-02", sha256: "86924cfad66b2ef036f531a1eec35d23c90c6bffa059163ea82437a4e0b0d9e3" };

test("the check is kazoku-ui's, byte for byte", () => {
  assert.equal(standard.STANDARD_VERSION, RECORDED.version);
  assert.equal(createHash("sha256").update(readFileSync("scripts/check-standard.mjs")).digest("hex"), RECORDED.sha256);
});

test("this package has every item of the family's must-have list", () => {
  assert.deepEqual(standard.standardProblems("."), []);
});
