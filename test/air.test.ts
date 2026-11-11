import assert from "node:assert/strict";
import { test } from "node:test";
import { AIR_QUALITY, AIR_THICKNESS_DEFAULT, AIR_THICKNESS_MAX, AIR_TOP, airFor, airFrag, airTop, readAirThickness } from "../src/realistic/air.ts";
import { airNoteText, setAirNote } from "../src/realistic/air-note.ts";
import { ATMOSPHERE_OUTER } from "../src/realistic/earth.ts";

test("the air is a shell 100 km thick on the Earth's 6,371", () => {
  assert.ok(Math.abs((AIR_TOP - 1) * 6371 - 100) < 1e-6);
});

test("the light quality takes fewer samples than the full one, and the program says how many", () => {
  assert.ok(AIR_QUALITY.light.view < AIR_QUALITY.full.view);
  assert.ok(AIR_QUALITY.light.light < AIR_QUALITY.full.light);
  for (const quality of ["full", "light"] as const) {
    const source = airFrag(AIR_QUALITY[quality]);
    assert.ok(source.includes(`#define N_VIEW ${AIR_QUALITY[quality].view}\n`));
    assert.ok(source.includes(`#define N_LIGHT ${AIR_QUALITY[quality].light}\n`));
  }
});

test("the program differs between the qualities only by its two sample counts, and sums scattering rather than drawing a ring", () => {
  const source = airFrag(AIR_QUALITY.full);
  assert.ok(source.includes("BETA_R") && source.includes("BETA_M"));
  assert.ok(source.includes("phaseR") && source.includes("phaseM"));
  assert.equal(airFrag(AIR_QUALITY.light).replace(/#define N_(VIEW|LIGHT) \d+/g, ""), source.replace(/#define N_(VIEW|LIGHT) \d+/g, ""));
});

test("the page's air attribute decides, and only full and light are words", () => {
  assert.equal(airFor("full"), "full");
  assert.equal(airFor("light"), "light");
  assert.ok(["full", "light"].includes(airFor(null)));
  assert.ok(["full", "light"].includes(airFor("rich")));
});

test("the air is drawn 3 times its real thickness when a page says nothing, and the attribute chooses from 1 (true) to 5", () => {
  assert.equal(AIR_THICKNESS_DEFAULT, 3);
  assert.equal(readAirThickness(null), 3);
  assert.equal(readAirThickness(""), 3);
  assert.equal(readAirThickness("very"), 3);
  assert.equal(readAirThickness("1"), 1);
  assert.equal(readAirThickness("2.5"), 2.5);
  assert.equal(readAirThickness("0"), 1);
  assert.equal(readAirThickness("-4"), 1);
  assert.equal(readAirThickness("99"), AIR_THICKNESS_MAX);
});

test("the shell's top grows with the thickness: 100 km at 1 (the true size), 300 km at 3, and the largest still fits inside the box the element is fitted to", () => {
  assert.equal(airTop(1), AIR_TOP);
  assert.ok(Math.abs((airTop(3) - 1) * 6371 - 300) < 1e-6);
  assert.ok(airTop(AIR_THICKNESS_MAX) < ATMOSPHERE_OUTER);
});

test("the program takes the thickness as a uniform, so one program serves every setting, and stretches the shell and both scale heights by it", () => {
  const source = airFrag(AIR_QUALITY.full);
  assert.ok(source.includes("uniform float thick;"));
  assert.ok(source.includes("#define TOP (1.0 + (TOP1 - 1.0) * thick)"));
  assert.ok(source.includes("#define HR (HR1 * thick)") && source.includes("#define HM (HM1 * thick)"));
  // the same amount of air, so the same colours: what each unit of length holds shrinks as the shell grows
  assert.ok(source.includes("#define DENS (1.0 / thick)"));
});

test("the line says how many times: 3 plainly, 2.5 with its decimal, in English and in Japanese, and it is shown only above 1 and without air-label=off", () => {
  assert.equal(airNoteText("en", 3), "The air is drawn 3 times its real thickness so it can be seen.");
  assert.ok(airNoteText("en", 2.5).includes("2.5 times"));
  assert.ok(airNoteText("ja", 3).includes("3倍"));
  const host = (label: string | null, lang: string): HTMLElement => ({ closest: () => ({ getAttribute: () => lang }), getAttribute: (name: string) => (name === "air-label" ? label : null) }) as unknown as HTMLElement;
  const note = {} as HTMLElement;
  setAirNote(note, host(null, "en"), 3);
  assert.equal(note.hidden, false);
  assert.equal(note.lang, "en");
  setAirNote(note, host(null, "ja-JP"), 3);
  assert.equal(note.lang, "ja");
  assert.ok(note.textContent!.includes("3倍"));
  setAirNote(note, host(null, "en"), 1);
  assert.equal(note.hidden, true);
  setAirNote(note, host("off", "en"), 3);
  assert.equal(note.hidden, true);
});
