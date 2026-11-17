// `estimateFar: "steady"` (MODULES-1366): beyond `maxAgeDays` from its elements a satellite keeps its usual orbit, with the air drag off, instead of sinking in the model and being left out.
// The elements are the recorded ones (20 stations and 2,232 Starlink satellites of 2 November 2026) and two made-up high orbits; nothing is fetched.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { json2satrec, sgp4 } from "satellite.js";
import { createSatellites, type ElementSet, type Satellites } from "../src/satellites/index.ts";

interface Snapshot {
  fields: string[];
  groups: Record<string, (string | number)[][]>;
}
const snapshot = JSON.parse(readFileSync(new URL("./recorded/celestrak-snapshot-2026-11-02.json", import.meta.url), "utf8")) as Snapshot;
const rows = (name: string): ElementSet[] => snapshot.groups[name]!.map((row) => Object.fromEntries(snapshot.fields.map((field, index) => [field, row[index]])) as unknown as ElementSet);
const stations = rows("stations");
const starlink = rows("starlink");
const iss = stations.find((set) => set.NORAD_CAT_ID === 25544)!;
/** A made-up transfer orbit (160 minutes to 10 hours round, low point about 300 km up) that carries a drag term: SGP4 places it with its deep-space code. Not a real satellite. */
const highWithDrag: ElementSet = { ...iss, OBJECT_NAME: "MADE-UP HIGH", OBJECT_ID: undefined, NORAD_CAT_ID: 99101, MEAN_MOTION: 2.27, ECCENTRICITY: 0.73, INCLINATION: 27, BSTAR: 0.0005 };
/** The same orbit with no drag term in its elements. */
const highNoDrag: ElementSet = { ...highWithDrag, OBJECT_NAME: "MADE-UP HIGH 2", NORAD_CAT_ID: 99102, BSTAR: 0 };
const everything = [...stations, ...starlink, highWithDrag, highNoDrag];

const DAY = 86_400_000;
const YEAR = 365.25 * DAY;
const R = 6371;
const epochOf = (set: ElementSet): number => Date.parse(`${set.EPOCH}Z`);
const one = new Float64Array(6);
/** Where satellite `index` is, in kilometres, and how fast (km/s), or null when it is not placed. */
const where = (group: Satellites, index: number, ms: number): { p: [number, number, number]; v: [number, number, number] } | null =>
  group.exact(index, ms, one) ? { p: [one[0]! * R, one[1]! * R, one[2]! * R], v: [one[3]!, one[4]!, one[5]!] } : null;
const apart = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
/** Whether a satellite is placed at 8 moments spread over one revolution from `ms`: a low point under 120 km anywhere on the orbit counts as lost. */
const placedAllRound = (group: Satellites, index: number, ms: number): boolean => {
  const period = (1440 / group.sets[index]!.MEAN_MOTION) * 60_000;
  for (let k = 0; k < 8; k += 1) if (!group.exact(index, ms + (k / 8) * period, one)) return false;
  return true;
};
/** The lowest and highest it is over one revolution from `ms`, in kilometres above the mean radius. */
const heights = (group: Satellites, index: number, ms: number): { low: number; high: number } => {
  const period = (1440 / group.sets[index]!.MEAN_MOTION) * 60_000;
  let low = Infinity;
  let high = -Infinity;
  for (let k = 0; k < 90; k += 1) {
    assert.ok(group.exact(index, ms + (k / 90) * period, one));
    const km = Math.hypot(one[0]!, one[1]!, one[2]!) * R - R;
    low = Math.min(low, km);
    high = Math.max(high, km);
  }
  return { low, high };
};

test("the choice is named: off by default, true as ever, and \"steady\" is kept and can be set", () => {
  assert.equal(createSatellites([iss]).estimateFar, false);
  assert.equal(createSatellites([iss], { estimateFar: true }).estimateFar, true);
  const group = createSatellites([iss], { estimateFar: "steady" });
  assert.equal(group.estimateFar, "steady");
  group.estimateFar = true;
  assert.equal(group.estimateFar, true);
  group.estimateFar = "steady";
  assert.equal(group.estimateFar, "steady");
  group.estimateFar = false;
  assert.equal(group.estimateFar, false);
});

test("up to 30 days from the elements steady is the same place as ever, to the last digit", () => {
  const plain = createSatellites(everything, { estimateFar: true });
  const steady = createSatellites(everything, { estimateFar: "steady" });
  for (let i = 0; i < everything.length; i += 97) {
    for (const days of [-30, -12, 0, 20, 30]) {
      const ms = epochOf(everything[i]!) + days * DAY;
      assert.deepEqual(where(steady, i, ms), where(plain, i, ms), `satellite ${i} at ${days} days`);
    }
  }
  assert.equal(steady.info(0, epochOf(everything[0]!) + 20 * DAY)!.estimated, false);
});

test("the hand-over at 30 days does not jump: a microsecond past it every satellite is within a millimetre of where its elements, drag and all, put it at that same moment, forward and back", () => {
  const steady = createSatellites(everything, { estimateFar: "steady" });
  const plain = createSatellites(everything, { estimateFar: true });
  let checked = 0;
  let down = 0;
  let worst = 0;
  let worstSpeed = 0;
  for (const side of [1, -1]) {
    for (let i = 0; i < steady.count; i += 1) {
      const set = steady.sets[i]!;
      // an element set with a launch year is not placed before it: the hand-over 30 days back is checked for those launched before 2026
      if (side === -1 && /^2026/.test(set.OBJECT_ID ?? "")) continue;
      const edge = epochOf(set) + side * 30 * DAY;
      // the two choices are the same code up to the edge, so the place with the drag left in a microsecond past it is where the satellite was going
      const going = where(plain, i, edge + side * 0.001);
      const held = where(steady, i, edge + side * 0.001);
      // a satellite its own elements have brought down by 30 days (SGP4 gives up, or it is under 120 km) is left out from there, exactly as with the drag left in
      if (going === null) {
        assert.equal(held, null, `satellite ${i} is not placed past 30 days with the drag left in, so it is not placed steady`);
        down += 1;
        continue;
      }
      // one whose drag term has run away by 30 days is not held on that orbit (STEADY_MOST_CHANGE): two Starlink satellites of the recording, drag terms 0.12 and 0.17, are 23,000 and 530,000 km up by then
      if (held === null) {
        assert.ok(Math.hypot(...going.p) - R > 5000, `satellite ${i} (${set.OBJECT_NAME}) is left out because its elements have run away`);
        down += 1;
        continue;
      }
      const jump = apart(held.p, going.p);
      const speed = apart(held.v, going.v);
      if (jump > worst) worst = jump;
      if (speed > worstSpeed) worstSpeed = speed;
      checked += 1;
    }
  }
  assert.ok(checked > 3000, `${checked} hand-overs checked`);
  assert.ok(down < 120, `${down} are left out at 30 days`);
  assert.ok(worst < 1e-6, `the furthest apart is ${(worst * 1e6).toFixed(4)} mm`);
  assert.ok(worstSpeed < 0.02, `the largest difference of speed is ${(worstSpeed * 1000).toFixed(3)} m/s`);
});

test("a high orbit with a drag term starts its steady orbit a few kilometres off, and that gap is faded out over a day, never jumped", () => {
  const steady = createSatellites([highWithDrag], { estimateFar: "steady" });
  const edge = epochOf(highWithDrag) + 30 * DAY;
  // the steady record alone, started the same way from the hand-over: without the fade it would be this far from the elements' own place
  const drag = json2satrec(highWithDrag as never);
  const before = sgp4(drag, (30 * DAY) / 60_000)!;
  const km = (p: { x: number; y: number; z: number }): [number, number, number] => [p.x, p.z, -p.y];
  const just = where(steady, 0, edge + 1)!;
  assert.ok(apart(just.p, km(before.position)) < 0.02, "a millisecond on it is within 20 m of the elements' place at 30 days (it moves up to 10 m in that time)");
  // step through the first two days: no step between two moments a second apart is more than its speed allows
  let last = where(steady, 0, edge - 1000)!;
  for (let ms = edge; ms <= edge + 2 * DAY; ms += 600_000) {
    const a = where(steady, 0, ms)!;
    const b = where(steady, 0, ms + 1000)!;
    assert.ok(Math.abs(apart(a.p, b.p) - Math.hypot(...a.v)) < 0.05, "a second's move is a second of its speed");
    last = b;
  }
  assert.ok(last);
  // and it is on the picture for good
  assert.ok(placedAllRound(steady, 0, epochOf(highWithDrag) + 5 * YEAR));
});

test("no satellite is lost: every one placed just past 30 days is still placed 1, 2, 5 and 10 years on, all round its orbit", () => {
  const steady = createSatellites(everything, { estimateFar: "steady" });
  const plain = createSatellites(everything, { estimateFar: true });
  const atEdge: number[] = [];
  for (let i = 0; i < steady.count; i += 1) if (placedAllRound(steady, i, epochOf(steady.sets[i]!) + 30 * DAY + 60_000)) atEdge.push(i);
  assert.ok(atEdge.length > 2150, `${atEdge.length} of ${steady.count} are placed just past 30 days`);
  // the same satellites as with the drag left in, but for the two whose drag term has run away by then
  const asEver = Array.from({ length: plain.count }, (_, i) => i).filter((i) => placedAllRound(plain, i, epochOf(plain.sets[i]!) + 30 * DAY + 60_000));
  assert.deepEqual(
    asEver.filter((i) => !atEdge.includes(i)).map((i) => plain.sets[i]!.OBJECT_NAME),
    ["STARLINK-34629", "STARLINK-35838"],
  );
  assert.deepEqual(atEdge.filter((i) => !asEver.includes(i)), []);
  for (const years of [1, 2, 5, 10]) {
    const lost = atEdge.filter((i) => !placedAllRound(steady, i, epochOf(steady.sets[i]!) + years * YEAR));
    assert.deepEqual(lost, [], `${years} years on, steady`);
  }
  // the same satellites with the drag left in, as ever: many have come down by 5 years
  const down = atEdge.filter((i) => !placedAllRound(plain, i, epochOf(plain.sets[i]!) + 5 * YEAR));
  assert.ok(down.length > 500, `${down.length} are left out at 5 years with the drag left in`);
});

test("the ISS keeps its height for 10 years with steady, and comes down with the drag left in", () => {
  const steady = createSatellites([iss], { estimateFar: "steady" });
  const plain = createSatellites([iss], { estimateFar: true });
  const epoch = epochOf(iss);
  const start = heights(steady, 0, epoch + 31 * DAY);
  for (const years of [1, 5, 10]) {
    const then = heights(steady, 0, epoch + years * YEAR);
    assert.ok(Math.abs((then.low + then.high) / 2 - (start.low + start.high) / 2) < 3, `${years} years on it is ${then.low.toFixed(1)} to ${then.high.toFixed(1)} km up; at 31 days ${start.low.toFixed(1)} to ${start.high.toFixed(1)}`);
    assert.ok(then.low > start.low - 15 && then.high < start.high + 15);
    assert.equal(steady.info(0, epoch + years * YEAR)!.estimated, true, "and it is still said to be an estimate");
  }
  assert.equal(plain.exact(0, epoch + 10 * YEAR, one), false, "with the drag left in it is gone by 10 years");
  // the steady orbit is the one it was on at 30 days, not one a few kilometres higher or lower that the day's fade would hide: its mean distance over a revolution, before the hand-over and after the fade
  const mean = (ms: number): number => {
    const period = (1440 / iss.MEAN_MOTION) * 60_000;
    let sum = 0;
    for (let k = 0; k < 360; k += 1) {
      assert.ok(steady.exact(0, ms + (k / 360) * period, one));
      sum += Math.hypot(one[0]!, one[1]!, one[2]!) * R;
    }
    return sum / 360;
  };
  const kept = mean(epoch + 31.5 * DAY) - mean(epoch + 29.9 * DAY);
  assert.ok(Math.abs(kept) < 0.1, `its mean distance changes by ${kept.toFixed(3)} km across the hand-over`);
});

test("the orbit's plane goes on turning: the ISS's turns west about 5 degrees a day, a year on as at the start", () => {
  const steady = createSatellites([iss], { estimateFar: "steady" });
  const normal = (ms: number): [number, number, number] => {
    const at = where(steady, 0, ms)!;
    const n: [number, number, number] = [at.p[1] * at.v[2] - at.p[2] * at.v[1], at.p[2] * at.v[0] - at.p[0] * at.v[2], at.p[0] * at.v[1] - at.p[1] * at.v[0]];
    const size = Math.hypot(...n);
    return [n[0] / size, n[1] / size, n[2] / size];
  };
  // the node's place round the Earth's axis (y is north here), from the orbit's normal
  const node = (ms: number): number => {
    const n = normal(ms);
    return (Math.atan2(n[0], n[2]) * 180) / Math.PI;
  };
  for (const days of [5, 365]) {
    const ms = epochOf(iss) + days * DAY;
    const turned = ((node(ms + DAY) - node(ms) + 540) % 360) - 180;
    assert.ok(Math.abs(Math.abs(turned) - 5) < 0.3, `${days} days on the plane turns ${turned.toFixed(2)} degrees in a day`);
  }
});

test("as ever when the choice is not made: true is SGP4 from the elements with their drag, off leaves it out, and steady is somewhere else", () => {
  const ms = epochOf(iss) + 400 * DAY;
  const raw = sgp4(json2satrec(iss as never), (400 * DAY) / 60_000)!;
  const plain = createSatellites([iss], { estimateFar: true });
  const there = where(plain, 0, ms)!;
  assert.deepEqual(there.p, [raw.position.x, raw.position.z, -raw.position.y].map((km) => (km / R) * R));
  assert.deepEqual(there.v, [raw.velocity.x, raw.velocity.z, -raw.velocity.y]);
  assert.equal(createSatellites([iss]).exact(0, ms, one), false);
  const steady = where(createSatellites([iss], { estimateFar: "steady" }), 0, ms)!;
  assert.ok(apart(steady.p, there.p) > 100, "400 days on the two are far apart along the orbit");
  // the group's own clock gives the same answer as before too
  const out = new Float32Array(3);
  plain.at(ms, out);
  assert.ok(apart([out[0]! * R, out[1]! * R, out[2]! * R], there.p) < 0.5);
});

test("elements with no drag term are already steady: the two choices give the same place however far", () => {
  const plain = createSatellites([highNoDrag], { estimateFar: true });
  const steady = createSatellites([highNoDrag], { estimateFar: "steady" });
  for (const days of [31, 400, 3650, -400]) {
    const ms = epochOf(highNoDrag) + days * DAY;
    assert.deepEqual(where(steady, 0, ms), where(plain, 0, ms));
  }
});

test("steady keeps the rules of an estimate: not before the launch, not after the decay, and one the elements bring down inside 30 days stays out", () => {
  const launched = createSatellites([{ ...iss, LAUNCH_DATE: "2026-06-01", DECAY_DATE: "2028-01-01" }], { estimateFar: "steady" });
  const epoch = epochOf(iss);
  assert.equal(launched.exact(0, epoch - 400 * DAY, one), false, "before its launch");
  assert.equal(launched.exact(0, epoch + 400 * DAY, one), true);
  assert.equal(launched.exact(0, epoch + 800 * DAY, one), false, "after its decay");
  const low: ElementSet = { ...iss, NORAD_CAT_ID: 99001, OBJECT_NAME: "LOW", MEAN_MOTION: 16.35, BSTAR: 0.02, OBJECT_ID: undefined };
  const group = createSatellites([low], { estimateFar: "steady" });
  const out = new Float32Array(3);
  group.at(epochOf(low) + 400 * DAY, out);
  assert.equal(group.visible(0), false);
  assert.equal(group.placed, 0);
  assert.deepEqual([...out], [0, 0, 0]);
});

test("the group's clock and the fast clock's pins use the steady orbit too, and changing the choice places the group again", () => {
  const group = createSatellites(stations, { estimateFar: "steady" });
  const ms = epochOf(iss) + 5 * YEAR;
  const index = group.sets.indexOf(iss);
  const out = new Float32Array(group.count * 3);
  group.at(ms, out);
  assert.equal(group.visible(index), true);
  assert.equal(group.estimated(index), true);
  const exact = where(group, index, ms)!;
  assert.ok(apart([out[index * 3]! * R, out[index * 3 + 1]! * R, out[index * 3 + 2]! * R], exact.p) < 0.5, "at() and exact() agree");
  const steadyPlaced = group.placed;
  const positions = new Float32Array(group.count * 3);
  const segments = new Float32Array(group.count * 6);
  assert.equal(group.arc(ms, 1000, positions, segments), steadyPlaced, "the streaks of a fast clock place the same satellites");
  group.estimateFar = true;
  group.at(ms, out);
  assert.ok(group.placed < steadyPlaced, `${group.placed} of ${steadyPlaced} stations are left at 5 years with the drag left in`);
  group.estimateFar = "steady";
  group.at(ms, out);
  assert.equal(group.placed, steadyPlaced);
});
