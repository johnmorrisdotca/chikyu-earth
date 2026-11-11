import { BODY_LABEL_ATTRIBUTES, bodyLabelText, readBodyLabel } from "@johnmorrisdotca/chikyu-earth/realistic";

// The family's plain attributes: absent, no name; present, the family's own default (painted, half strength, once, on the equator).
const none = readBodyLabel(() => null);
const plain = readBodyLabel((name) => (name === "body-label" ? "" : null));
console.log(none, JSON.stringify(plain));

// A page's own choices, and the name in its language.
const mine = { "body-label": "etched", "body-label-strength": "0.8", "body-label-repeat": "both", "body-label-latitude": "55" };
console.log(JSON.stringify(readBodyLabel((name) => mine[name] ?? null)));
console.log(bodyLabelText("en"), bodyLabelText("ja"), BODY_LABEL_ATTRIBUTES.length);
