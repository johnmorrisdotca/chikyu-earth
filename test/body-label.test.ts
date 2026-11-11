// The name written on the Earth: the family's attribute names mean what the family says, and the text follows the page's language.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BODY_LABEL_ATTRIBUTES, bodyLabelText, newBodyLabelState, readBodyLabel } from "../src/realistic/body-label.ts";

const attributes = (values: Record<string, string>) => (name: string): string | null => values[name] ?? null;

test("the family's attributes are the seven the family names, in its order", () => {
  assert.deepEqual([...BODY_LABEL_ATTRIBUTES], ["body-label", "body-label-strength", "body-label-repeat", "body-label-latitude", "body-label-facing", "body-label-font", "body-label-fallback-font"]);
});

test("absent, there is no label; present, it is the family's default: painted, half strength, once, on the equator, not facing, Michroma", () => {
  assert.equal(readBodyLabel(attributes({})), null);
  assert.deepEqual(readBodyLabel(attributes({ "body-label": "" })), { look: "painted", strength: 0.5, repeat: "once", latitude: 0, facing: false });
  assert.deepEqual(readBodyLabel(attributes({ "body-label": "painted" })), readBodyLabel(attributes({ "body-label": "" })));
});

test("each look, strength, repeat, latitude, facing and font is read as the family says; nonsense falls back to the default and a strength is held to 0 to 1", () => {
  for (const look of ["painted", "etched", "outline", "burned"]) assert.equal(readBodyLabel(attributes({ "body-label": look }))!.look, look);
  assert.equal(readBodyLabel(attributes({ "body-label": "sparkly" }))!.look, "painted");
  const set = readBodyLabel(attributes({ "body-label": "etched", "body-label-strength": "0.8", "body-label-repeat": "both", "body-label-latitude": "55", "body-label-facing": "", "body-label-font": " Orbitron ", "body-label-fallback-font": "Noto Sans JP" }))!;
  assert.deepEqual(set, { look: "etched", strength: 0.8, repeat: "both", latitude: 55, facing: true, font: "Orbitron", fallbackFont: "Noto Sans JP" });
  assert.equal(readBodyLabel(attributes({ "body-label": "", "body-label-strength": "7" }))!.strength, 1);
  assert.equal(readBodyLabel(attributes({ "body-label": "", "body-label-strength": "-1" }))!.strength, 0);
  assert.equal(readBodyLabel(attributes({ "body-label": "", "body-label-strength": "soft" }))!.strength, 0.5);
  assert.equal(readBodyLabel(attributes({ "body-label": "", "body-label-repeat": "thrice" }))!.repeat, "once");
  assert.equal(readBodyLabel(attributes({ "body-label": "", "body-label-latitude": "north" }))!.latitude, 0);
  assert.equal(readBodyLabel(attributes({ "body-label": "", "body-label-facing": "off" }))!.facing, false);
});

test("the text is the Earth's own name in capitals, in the page's language", () => {
  assert.equal(bodyLabelText("en"), "EARTH");
  assert.equal(bodyLabelText("ja"), "地球");
  assert.deepEqual(newBodyLabelState(), { settings: null, text: "EARTH", drawn: { made: false, showing: false } });
});
