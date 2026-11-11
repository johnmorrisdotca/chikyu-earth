// The meteor showers against the IAU Meteor Data Center: every solution of the table's 37 showers as the MDC's lists give them (test/recorded/iau-mdc-showers-2026-11-11.json, read 2026-11-11 from
// streamfulldata2026.txt and streamestablisheddata2026.txt), the table's codes, numbers, status, radiants, speeds and parent bodies held to it, and the parent links by IAU code and designation.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { IAU_MDC, METEOR_LINKS, METEOR_SHOWERS, parentBodyOf, showerSource, showersOfParent } from "../src/meteors/index.ts";

interface Solution {
  adNo: number;
  s: number;
  name: string;
  los: number | null;
  ra: number | null;
  de: number | null;
  dra: number | null;
  dde: number | null;
  vg: number | null;
  n: number;
  origin: string | null;
  established: boolean;
}
const MDC = JSON.parse(readFileSync(new URL("./recorded/iau-mdc-showers-2026-11-11.json", import.meta.url), "utf8")) as { showers: Record<string, { iauNo: number; solutions: Solution[] }> };
const link = (code: string) => METEOR_LINKS.find((entry) => entry.code === code)!;
const shower = (code: string) => METEOR_SHOWERS.find((entry) => entry.code === code)!;

const RADIANT_DEGREES = 2;
const SPEED_KMS = 2;
const WINDOW_DEGREES = 3;
const MIN_METEORS = 100;
const separation = (ra1: number, de1: number, ra2: number, de2: number): number => {
  const r = Math.PI / 180;
  const cosine = Math.sin(de1 * r) * Math.sin(de2 * r) + Math.cos(de1 * r) * Math.cos(de2 * r) * Math.cos((ra1 - ra2) * r);
  return Math.acos(Math.max(-1, Math.min(1, cosine))) / r;
};
/** The MDC solutions that count for a shower: a radiant, a speed and a longitude, of 100 meteors or more, within 3 degrees of the shower's maximum. */
const counting = (code: string): (Solution & { los: number; ra: number; de: number; vg: number })[] =>
  MDC.showers[code]!.solutions.filter((one): one is Solution & { los: number; ra: number; de: number; vg: number } => one.los !== null && one.ra !== null && one.de !== null && one.vg !== null && one.n >= MIN_METEORS && Math.abs(one.los - shower(code).peakSolarLongitude) <= WINDOW_DEGREES);
/** A solution's radiant moved by its own daily motion to the longitude of the shower's maximum. */
const radiantAtPeak = (one: { los: number; ra: number; de: number; dra: number | null; dde: number | null }, peak: number): { ra: number; de: number } => {
  const days = (peak - one.los) / 0.9856;
  return { ra: one.ra + (one.dra ?? 0) * days, de: one.de + (one.dde ?? 0) * days };
};
const agrees = (code: string, one: Solution & { los: number; ra: number; de: number; vg: number }): boolean => {
  const row = shower(code);
  const at = radiantAtPeak(one, row.peakSolarLongitude);
  return separation(row.radiant.ra, row.radiant.dec, at.ra, at.de) <= RADIANT_DEGREES && Math.abs(row.speedKmS - one.vg) <= SPEED_KMS;
};

test("the IAU MDC's terms and citation are recorded where the data is used", () => {
  assert.equal(IAU_MDC.read, "2026-11-11");
  assert.equal(IAU_MDC.cite.length, 2);
  assert.match(IAU_MDC.cite.join(" "), /Planetary and Space Science 182, 104821/);
  const notice = readFileSync(new URL("../NOTICE.md", import.meta.url), "utf8");
  assert.match(notice, /IAU Meteor Data Center/);
  assert.match(notice, /states no licence/);
  assert.match(notice, /read 2026-11-11/);
});

test("each shower's code and number are the MDC's, and the link table has one entry for each, in the table's order", () => {
  assert.deepEqual(METEOR_LINKS.map((entry) => entry.code), METEOR_SHOWERS.map((entry) => entry.code));
  for (const row of METEOR_SHOWERS) {
    const mdc = MDC.showers[row.code];
    assert.ok(mdc, `${row.code} is in the MDC's lists`);
    assert.equal(mdc.iauNo, row.iau, `${row.code}: IAU number`);
    assert.equal(link(row.code).iau, row.iau);
    assert.ok(mdc.solutions.length > 0);
    assert.ok(mdc.solutions.every((one) => one.name === mdc.solutions[0]!.name), `${row.code}: one name in the MDC`);
    assert.equal(link(row.code).iauName, mdc.solutions[0]!.name);
  }
});

test("the status is the MDC's: 34 established, and alpha-Centaurids, September Lyncids and gamma-Puppids on the working list only", () => {
  for (const row of METEOR_SHOWERS) assert.equal(link(row.code).status, MDC.showers[row.code]!.solutions.some((one) => one.established) ? "established" : "working", row.code);
  assert.deepEqual(METEOR_LINKS.filter((entry) => entry.status === "working").map((entry) => entry.code).sort(), ["ACE", "PUP", "SLY"]);
  assert.equal(METEOR_LINKS.filter((entry) => entry.status === "established").length, 34);
  assert.equal(link("PUP").iauName, "gamma-Puppids", "the IMO's Puppid-Velids are the MDC's gamma-Puppids, IAU 301");
  assert.equal(link("DRA").iauName, "October Draconids");
  assert.equal(link("MON").iauName, "December Monocerotids");
});

test("every established shower's radiant and speed agree, within 2 degrees and 2 km/s, with an MDC solution of 100 meteors or more near its maximum, and `checked` names the biggest that does", () => {
  for (const row of METEOR_SHOWERS) {
    const entry = link(row.code);
    const near = counting(row.code);
    const agreeing = near.filter((one) => agrees(row.code, one)).sort((a, b) => b.n - a.n);
    if (entry.status === "working") continue;
    if (near.length === 0) {
      assert.equal(entry.checked, null, `${row.code} has no solution to check against`);
      continue;
    }
    assert.ok(agreeing.length > 0, `${row.code}: the table's radiant ${row.radiant.ra},${row.radiant.dec} and speed ${row.speedKmS} agree with none of ${near.map((one) => `${one.ra},${one.de} ${one.vg}`).join(" | ")}`);
    assert.deepEqual(entry.checked, { adNo: agreeing[0]!.adNo, meteors: agreeing[0]!.n }, row.code);
  }
  assert.deepEqual(METEOR_LINKS.filter((entry) => entry.status === "established" && entry.checked === null).map((entry) => entry.code).sort(), ["JBO", "KCG", "PHO", "PPU"], "no solution of 100 meteors or more near the maximum");
});

test("the three rows that took the IAU's figures are the biggest solution's, rounded, and say so; every other row says it kept the IMO's", () => {
  const changed = METEOR_LINKS.filter((entry) => entry.from.radiant === "mdc" || entry.from.speed === "mdc").map((entry) => entry.code).sort();
  assert.deepEqual(changed, ["AMO", "ERI", "LYR"]);
  const biggest = (code: string) => counting(code).sort((a, b) => b.n - a.n)[0]!;
  assert.equal(shower("LYR").speedKmS, Math.round(biggest("LYR").vg));
  assert.equal(shower("LYR").speedKmS, 47, "was 49; every MDC solution of 5 meteors or more has 46.6 to 47.6");
  assert.equal(shower("AMO").speedKmS, Math.round(biggest("AMO").vg));
  assert.equal(shower("AMO").speedKmS, 62, "was 65; the MDC's three solutions have 62.1 to 63.0");
  const eri = radiantAtPeak(biggest("ERI"), shower("ERI").peakSolarLongitude);
  assert.deepEqual(shower("ERI").radiant, { ra: Math.round(eri.ra), dec: Math.round(eri.de) });
  assert.deepEqual(shower("ERI").radiant, { ra: 42, dec: -13 }, "was 41, -11");
  assert.equal(link("LYR").from.radiant, "imo");
  assert.match(showerSource(link("LYR")), /speed from IAU MDC solution 10 of April Lyrids \(IAU 6, 9980 meteors\); the IMO table's was further off/);
  assert.match(showerSource(link("PER")), /radiant and speed agree with IAU MDC solution 9 of Perseids \(IAU 7, 141256 meteors\)/);
  assert.match(showerSource(link("PER")), /dates and rate: IMO 2026 Meteor Shower Calendar, Table 5/);
  assert.match(showerSource(link("KCG")), /no IAU MDC solution of 100 meteors or more near the maximum/);
  assert.match(showerSource(link("ACE")), /working list only/);
  for (const entry of METEOR_LINKS) assert.ok(showerSource(entry).length > 60, entry.code);
});

test("the dates and the rate are the IMO's: the MDC lists no maximum date and no rate, and the table's longitudes sit among the MDC's solutions' means", () => {
  for (const row of METEOR_SHOWERS) {
    const longitudes = MDC.showers[row.code]!.solutions.map((one) => one.los).filter((los): los is number => los !== null);
    const nearest = Math.min(...longitudes.map((los) => Math.abs(los - row.peakSolarLongitude)));
    // the MDC's longitude is the mean over a solution's meteors, not the maximum, so a broad or drifting shower may be a few degrees off
    assert.ok(nearest <= 6, `${row.code}: the maximum at ${row.peakSolarLongitude} is ${nearest.toFixed(1)} degrees from the nearest MDC solution`);
  }
});

test("each parent body is the MDC's origin column's: named in a solution of the shower, a comet or an asteroid by its designation", () => {
  for (const row of METEOR_SHOWERS) {
    const entry = link(row.code);
    const origins = MDC.showers[row.code]!.solutions.map((one) => one.origin ?? "").join(" | ");
    if (entry.parent === null) {
      assert.equal(row.parent, undefined, `${row.code} has no parent in either place`);
      continue;
    }
    assert.equal(row.parent, `${entry.parent.kind} ${entry.parent.designation}`, `${row.code}: the row's line and the link say the same`);
    const bare = entry.parent.designation.replace(/^\(\d+\) /, "").replace(/ \(.*\)$/, "").toLowerCase().replace(/^([a-z]\/)?/, "");
    const key = bare.split("/")[0]!;
    assert.ok(origins.toLowerCase().includes(key), `${row.code}: "${entry.parent.designation}" is not in the MDC's origin column (${origins})`);
    assert.match(entry.parent.designation, entry.parent.kind === "comet" ? /^(\d+[PD]\/|[CDPX]\/)/ : /^(\(\d+\) )?\d{4} ?[A-Z]|^\(\d+\) /, row.code);
  }
  assert.equal(link("SDA").parent, null, "the MDC names two different bodies for the delta-Aquariids' solutions");
  assert.equal(shower("SDA").parent, undefined);
});

test("the parent links by IAU code and by designation", () => {
  assert.deepEqual(parentBodyOf("PER"), { designation: "109P/Swift-Tuttle", kind: "comet" });
  assert.deepEqual(parentBodyOf("GEM"), { designation: "(3200) Phaethon", kind: "asteroid" });
  assert.equal(parentBodyOf("COM"), null);
  assert.equal(parentBodyOf("XXX"), null);
  assert.deepEqual(showersOfParent("1P/Halley").map((one) => one.code), ["ETA", "ORI"]);
  assert.deepEqual(showersOfParent("1P").map((one) => one.code), ["ETA", "ORI"]);
  assert.deepEqual(showersOfParent("halley").map((one) => one.code), ["ETA", "ORI"]);
  assert.deepEqual(showersOfParent("2P").map((one) => one.code), ["STA", "NTA"]);
  assert.deepEqual(showersOfParent("Encke").map((one) => one.code), ["STA", "NTA"]);
  assert.deepEqual(showersOfParent("Phaethon").map((one) => one.code), ["GEM"]);
  assert.deepEqual(showersOfParent("109P/Swift-Tuttle").map((one) => one.code), ["PER"]);
  assert.deepEqual(showersOfParent(""), []);
  assert.deepEqual(showersOfParent("999P"), []);
  assert.equal(METEOR_LINKS.filter((entry) => entry.parent?.kind === "comet").length, 22);
  assert.equal(METEOR_LINKS.filter((entry) => entry.parent?.kind === "asteroid").length, 4);
  for (const entry of METEOR_LINKS) if (entry.parent) assert.ok(showersOfParent(entry.parent.designation).some((one) => one.code === entry.code), entry.code);
});
