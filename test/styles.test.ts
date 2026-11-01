import test from "node:test";
import assert from "node:assert/strict";
import { cleanStyle, DEFAULT_STYLE, STYLES } from "../src/styles.ts";

test("an unknown style falls back to the default", () => {
  assert.equal(cleanStyle("nope"), DEFAULT_STYLE);
  assert.equal(cleanStyle(undefined), DEFAULT_STYLE);
  assert.equal(cleanStyle(null), DEFAULT_STYLE);
});

test("a named style is kept, and thick really is heavier", () => {
  assert.equal(cleanStyle("thick"), "thick");
  assert.ok(STYLES.thick.outline > STYLES.line.outline);
});
