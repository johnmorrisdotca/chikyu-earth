import test from "node:test";
import assert from "node:assert/strict";
import { OWNER_COUNTRIES, ownerCountry } from "../src/satellites/owners.ts";
import { createSatellites } from "../src/satellites/track.ts";
import { parseElements } from "../src/satellites/source.ts";
import type { ElementSet } from "../src/satellites/types.ts";

test("a national owner is its country's two-letter code", () => {
  const national: Record<string, string> = {
    PRC: "CN",
    US: "US",
    PAKI: "PK",
    JPN: "JP",
    IND: "IN",
    FR: "FR",
    UK: "GB",
    ISRO: "IN",
    ROC: "TW",
    GER: "DE",
    CA: "CA",
  };
  for (const [code, country] of Object.entries(national)) assert.equal(ownerCountry(code), country, code);
  assert.equal(ownerCountry(" prc "), "CN", "case and spaces do not matter");
});

test("an organisation, several countries, an ambiguous code or an unknown code has none", () => {
  for (const code of ["ESA", "ISS", "GLOB", "SES", "ITSO", "EUME", "NATO", "AB", "ESRO", "IM"]) assert.equal(ownerCountry(code), undefined, `${code} is an organisation`);
  for (const code of ["FGER", "FRIT", "CHBZ", "PRES", "SGJP", "USBZ"]) assert.equal(ownerCountry(code), undefined, `${code} is several countries`);
  assert.equal(ownerCountry("CIS"), undefined, "the list names the former USSR, not one country");
  for (const code of ["UNK", "TBD", "XYZ", "", "toString", "__proto__"]) assert.equal(ownerCountry(code), undefined, `${code} is not known`);
  assert.equal(ownerCountry(undefined), undefined);
  assert.equal(ownerCountry(null), undefined);
});

test("the table has every code of the catalogue's owner list, each a two-letter code or none", () => {
  const codes = Object.keys(OWNER_COUNTRIES);
  assert.equal(codes.length, 132, "the 132 codes read on 2026-11-12");
  for (const [code, country] of Object.entries(OWNER_COUNTRIES)) assert.ok(country === null || /^[A-Z]{2}$/.test(country), `${code}: ${country}`);
});

const iss = (extra: Partial<ElementSet>): ElementSet => ({
  OBJECT_NAME: "ISS (ZARYA)",
  OBJECT_ID: "1998-067A",
  EPOCH: "2026-11-02T12:00:00",
  MEAN_MOTION: 15.49150046,
  ECCENTRICITY: 0.0007139,
  INCLINATION: 51.6332,
  RA_OF_ASC_NODE: 335.9757,
  ARG_OF_PERICENTER: 339.3739,
  MEAN_ANOMALY: 20.6961,
  NORAD_CAT_ID: 25544,
  BSTAR: 0.00012,
  MEAN_MOTION_DOT: 0.0001,
  MEAN_MOTION_DDOT: 0,
  ...extra,
});

test("a satellite's info has its owner's country when its elements carry an owner code", () => {
  const at = Date.parse("2026-11-02T12:00:00Z");
  const sats = createSatellites([iss({ COUNTRY_CODE: "PRC" }), iss({ NORAD_CAT_ID: 2, OWNER: "PAKI" }), iss({ NORAD_CAT_ID: 3, COUNTRY_CODE: "ISS" }), iss({ NORAD_CAT_ID: 4 }), iss({ NORAD_CAT_ID: 5, OWNER: "CIS" })]);
  assert.equal(sats.info(0, at)?.ownerCountry, "CN");
  assert.equal(sats.info(1, at)?.ownerCountry, "PK");
  assert.equal(sats.info(2, at)?.ownerCountry, undefined, "the station is no one country");
  assert.equal(sats.info(3, at)?.ownerCountry, undefined, "no owner code");
  assert.equal("ownerCountry" in (sats.info(3, at) ?? {}), false, "and no key for it");
  assert.equal(sats.info(4, at)?.ownerCountry, undefined, "the former USSR code names no one country");
});

test("parsing keeps the owner code a source serves", () => {
  const parsed = parseElements(JSON.stringify([{ ...iss({}), COUNTRY_CODE: " US " }, { ...iss({ NORAD_CAT_ID: 9 }), OWNER: "JPN" }]));
  assert.equal(parsed.sets[0]?.COUNTRY_CODE, "US");
  assert.equal(parsed.sets[1]?.OWNER, "JPN");
});
