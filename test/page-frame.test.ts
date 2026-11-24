// The build puts kazoku-ui's page frame into every demo page. The checker's comment is only the marker the build replaces.
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderBuilder, renderEmbed, renderFullscreen, renderIndex, renderKids } from "../scripts/page.ts";

test("the home page says what it is and credits its data", () => {
  const html = renderIndex();
  assert.match(html, /<kazoku-page-header/);
  assert.match(html, /<kazoku-page-credits/);
  assert.doesNotMatch(html, /<!--frame:/);
});

test("a page that already has Japanese words uses them in the frame", () => {
  const html = renderKids();
  assert.match(html, /印刷するシート/);
});

test("the embed credits its data and has no page header", () => {
  const html = renderEmbed();
  assert.match(html, /<kazoku-page-credits/);
  assert.doesNotMatch(html, /<kazoku-page-header/);
});

test("the full screen page and the code builder say what they are", () => {
  assert.match(renderFullscreen(), /<kazoku-page-header/);
  assert.match(renderBuilder(), /<kazoku-page-header/);
});
