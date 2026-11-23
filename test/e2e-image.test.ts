import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { scripts: Record<string, string> };

test("pnpm test:e2e:image runs the demo in CI's Playwright image at 4 CPUs", () => {
  const script = pkg.scripts["test:e2e:image"];
  assert.equal(typeof script, "string", "package.json needs a test:e2e:image script");
  assert.match(script, /^kazoku-ci-image --cpus 4 -- test$/);
});
