// The Space Shuttle missions: the facts against the source list read from NASA's pages (test/recorded/nasa-sts-2026-11-08.json), the element files against Space-Track's catalogue dates, and a replay's ground track against a
// second, independent propagator written below (two-body motion with the J2 drift and its own sidereal time and geodetic conversion), on the element sets Space-Track kept at the time. No test makes a request.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { missionElements, missionOf, missionPosition, missions, type Mission, type MissionFile } from "../src/satellites/index.ts";
import type { ElementSet } from "../src/satellites/types.ts";
import { utcOf, type NasaFlight } from "../scripts/missions.ts";

const NASA = JSON.parse(readFileSync(new URL("./recorded/nasa-sts-2026-11-08.json", import.meta.url), "utf8")) as { read: string; flights: NasaFlight[] };
const DIR = new URL("../demo/missions/", import.meta.url);
const fileOf = (id: string): MissionFile | undefined => (existsSync(new URL(`${id}.json`, DIR)) ? (JSON.parse(readFileSync(new URL(`${id}.json`, DIR), "utf8")) as MissionFile) : undefined);
const epochOf = (set: ElementSet): number => Date.parse(`${set.EPOCH}Z`);
const DAY = 86_400_000;

test("there are 135 flights, in the order they launched, with the orbiters' real totals and the six Hubble visits", () => {
  const all = missions();
  assert.equal(all.length, 135);
  assert.equal(new Set(all.map((one) => one.id)).size, 135);
  assert.equal(all[0]!.name, "STS-1");
  assert.equal(all.at(-1)!.name, "STS-135");
  const launches = all.map((one) => Date.parse(one.launch));
  assert.deepEqual(launches, [...launches].sort((a, b) => a - b));
  const flown = (name: string): number => all.filter((one) => one.orbiter === name).length;
  assert.deepEqual(["Columbia", "Challenger", "Discovery", "Atlantis", "Endeavour"].map(flown), [28, 10, 39, 33, 25]);
  assert.deepEqual(all.filter((one) => one.hubble).map((one) => `${one.name} ${one.hubble}`), ["STS-31 deployment", "STS-61 SM1", "STS-82 SM2", "STS-103 SM3A", "STS-109 SM3B", "STS-125 SM4"]);
  for (const one of all) {
    assert.ok(one.payload.length > 3 && one.payloadJa.length > 3, `${one.name} has a payload in both languages`);
    assert.equal(one.url, `https://www.nasa.gov/mission/${one.id}/`);
  }
});

test("missionOf finds a flight by its name or number, and nothing else", () => {
  for (const key of ["STS-31", "sts-31", "31", 31, "STS31"]) assert.equal(missionOf(key)?.id, "sts-31");
  assert.equal(missionOf("STS-41B")?.orbiter, "Challenger");
  assert.equal(missionOf("STS-51-L")?.id, "sts-51l");
  assert.equal(missionOf("51l")?.landing, null);
  assert.equal(missionOf(136), undefined);
  assert.equal(missionOf("STS-10"), undefined);
});

test("every fact is NASA's: orbiter, crew, and the liftoff and landing times, flight for flight against the pages read on 2026-11-08", () => {
  assert.equal(NASA.read, "2026-11-08");
  assert.equal(NASA.flights.length, 135);
  for (const [index, source] of NASA.flights.entries()) {
    const ours = missions()[index]!;
    assert.equal(ours.id, `sts-${source.id}`);
    assert.equal(ours.url, source.url);
    assert.equal(ours.orbiter, source.orbiter, ours.name);
    assert.equal(ours.crew, source.crew, ours.name);
    assert.equal(ours.launch, utcOf(source.launched), `${ours.name} liftoff`);
    // STS-107 broke up on the way home: NASA's page gives the story, not a time ("at about 9 a.m. EST", 2003-02-01), and STS-51L has no landing.
    if (ours.id === "sts-107") assert.equal(ours.landing, "2003-02-01T14:00:00Z");
    else if (ours.id === "sts-51l") assert.equal(ours.landing, null);
    else assert.equal(ours.landing, utcOf(source.landed), `${ours.name} landing`);
  }
});

test("the flights' catalogue numbers and dates are Space-Track's: each element file agrees with its flight to within a day", () => {
  const files = readdirSync(DIR).filter((name) => name.startsWith("sts-"));
  assert.equal(files.length, 134, "every flight but STS-51L has a file");
  for (const one of missions()) {
    if (one.id === "sts-51l") {
      assert.equal(one.noradId, null);
      continue;
    }
    const file = fileOf(one.id)!;
    assert.equal(file.id, one.id);
    assert.equal(file.source, "Space-Track.org (USSPACECOM)");
    assert.ok(String(one.noradId) in file.objects, `${one.name} is filed under ${one.noradId}`);
    const catalogue = (file as MissionFile & { catalogue: { launch: string; decay: string } }).catalogue;
    assert.ok(Math.abs(Date.parse(one.launch) - Date.parse(catalogue.launch)) <= 1.2 * DAY, `${one.name} liftoff against the catalogue`);
    assert.ok(Math.abs(Date.parse(one.landing!) - Date.parse(catalogue.decay)) <= 1.2 * DAY, `${one.name} landing against the catalogue`);
    if (one.hubble) assert.ok("20580" in file.objects, `${one.name} carries the Hubble telescope's sets`);
    else assert.deepEqual(Object.keys(file.objects), [String(one.noradId)]);
  }
});

test("the element sets are small, in time order, inside the flight, and a Hubble visit holds the telescope's sets for its days", () => {
  let sets = 0;
  let bytes = 0;
  for (const one of missions()) {
    const file = fileOf(one.id);
    if (!file) continue;
    bytes += readFileSync(new URL(`${one.id}.json`, DIR)).length;
    for (const [number, list] of Object.entries(missionElements(file))) {
      sets += list.length;
      const epochs = list.map(epochOf);
      assert.deepEqual(epochs, [...epochs].sort((a, b) => a - b), `${one.name} ${number} is in time order`);
      assert.ok(list.every((set) => set.NORAD_CAT_ID === Number(number) && Number.isFinite(set.MEAN_MOTION) && set.INCLINATION > 20 && set.INCLINATION < 100), `${one.name} ${number} has real numbers`);
      if (Number(number) === one.noradId && list.length) {
        assert.ok(epochs[0]! >= Date.parse(one.launch) - 3_600_000, `${one.name}: no element set before liftoff`);
        assert.ok(epochs.at(-1)! <= Date.parse(one.landing!) + 2 * DAY, `${one.name}: none long after landing`);
      }
      if (Number(number) === 20580) assert.ok(list.length >= 3 && epochs[0]! >= Date.parse(one.launch) - 2 * DAY, `${one.name} Hubble`);
    }
  }
  assert.ok(sets > 2800 && sets < 3600, `${sets} sets`);
  assert.ok(bytes < 600_000, `${bytes} bytes`);
});

// --- a second propagator ----------------------------------------------------------------------------------------------------------------------------------

const MU = 398600.4418;
const RE = 6378.137;
const J2 = 1.08262668e-3;
const RAD = Math.PI / 180;
/** Greenwich mean sidereal time in radians (IAU 1982), written here and not taken from satellite.js. */
const gmst = (ms: number): number => {
  const days = ms / DAY + 2440587.5 - 2451545.0;
  const t = days / 36525;
  const degrees = 280.46061837 + 360.98564736629 * days + 0.000387933 * t * t;
  return ((degrees % 360) + 360) % 360 * RAD;
};
function kepler(set: ElementSet, ms: number): { latitude: number; longitude: number; altitudeKm: number } {
  const n0 = (set.MEAN_MOTION * 2 * Math.PI) / 86400;
  const e = set.ECCENTRICITY;
  const i = set.INCLINATION * RAD;
  const a = Math.cbrt(MU / (n0 * n0));
  const p = a * (1 - e * e);
  const dt = (ms - epochOf(set)) / 1000;
  const factor = 1.5 * J2 * (RE / p) ** 2 * n0;
  const raan = set.RA_OF_ASC_NODE * RAD - factor * Math.cos(i) * dt;
  const argp = set.ARG_OF_PERICENTER * RAD + 0.5 * factor * (5 * Math.cos(i) ** 2 - 1) * dt;
  const n = n0 * (1 + 1.5 * J2 * (RE / p) ** 2 * Math.sqrt(1 - e * e) * (1 - 1.5 * Math.sin(i) ** 2));
  const m = set.MEAN_ANOMALY * RAD + n * dt;
  let big = m;
  for (let k = 0; k < 20; k += 1) big = m + e * Math.sin(big);
  const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(big / 2), Math.sqrt(1 - e) * Math.cos(big / 2));
  const r = (a * (1 - e * e)) / (1 + e * Math.cos(nu));
  const u = argp + nu;
  const x = r * (Math.cos(raan) * Math.cos(u) - Math.sin(raan) * Math.sin(u) * Math.cos(i));
  const y = r * (Math.sin(raan) * Math.cos(u) + Math.cos(raan) * Math.sin(u) * Math.cos(i));
  const z = r * Math.sin(u) * Math.sin(i);
  const theta = gmst(ms);
  const earthX = x * Math.cos(theta) + y * Math.sin(theta);
  const earthY = -x * Math.sin(theta) + y * Math.cos(theta);
  const longitude = Math.atan2(earthY, earthX);
  const rho = Math.hypot(earthX, earthY);
  const f = 1 / 298.257223563;
  const e2 = f * (2 - f);
  let latitude = Math.atan2(z, rho);
  let height = 0;
  for (let k = 0; k < 8; k += 1) {
    const sin = Math.sin(latitude);
    const c = RE / Math.sqrt(1 - e2 * sin * sin);
    height = rho / Math.cos(latitude) - c;
    latitude = Math.atan2(z, rho * (1 - (e2 * c) / (c + height)));
  }
  return { latitude: latitude / RAD, longitude: longitude / RAD, altitudeKm: height };
}
const apart = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number =>
  6371 * Math.acos(Math.min(1, Math.sin(a.latitude * RAD) * Math.sin(b.latitude * RAD) + Math.cos(a.latitude * RAD) * Math.cos(b.latitude * RAD) * Math.cos((a.longitude - b.longitude) * RAD)));

test("a replay's ground track follows a second propagator to within 60 km for the 90 minutes either side of each element set, on five flights", () => {
  let checked = 0;
  let worst = 0;
  for (const id of ["sts-1", "sts-31", "sts-61", "sts-88", "sts-125"]) {
    const flight = missionOf(id)!;
    const file = fileOf(id)!;
    const sets = missionElements(file)[flight.noradId!]!;
    assert.ok(sets.length > 3 || id === "sts-61", `${id} has element sets`);
    for (const set of sets.slice(0, 12)) {
      for (const minutes of [-90, -45, 0, 45, 90]) {
        const ms = epochOf(set) + minutes * 60_000;
        if (ms < Date.parse(flight.launch) || ms > Date.parse(flight.landing!)) continue;
        const ours = missionPosition([set], ms)!;
        const theirs = kepler(set, ms);
        const km = apart(ours, theirs);
        worst = Math.max(worst, km);
        assert.ok(km < 60, `${id} ${set.EPOCH} ${minutes} min: ${km.toFixed(1)} km apart`);
        assert.ok(Math.abs(ours.altitudeKm - theirs.altitudeKm) < 25, `${id} ${set.EPOCH} height`);
        checked += 1;
      }
    }
  }
  assert.ok(checked > 60, `${checked} places checked (worst ${worst.toFixed(1)} km)`);
});

test("a replay of a whole flight stays on the globe: always between the orbiter's inclination north and south, at orbit height, near 7.7 km a second", () => {
  const flight = missionOf("STS-1")!;
  const sets = missionElements(fileOf("sts-1")!)[flight.noradId!]!;
  let before: ReturnType<typeof missionPosition>;
  let count = 0;
  for (let ms = Date.parse(flight.launch) + 600_000; ms <= Date.parse(flight.landing!) - 600_000; ms += 60_000) {
    const place = missionPosition(sets, ms, flight);
    assert.ok(place, new Date(ms).toISOString());
    assert.ok(Math.abs(place.latitude) <= 41, `latitude ${place.latitude}`);
    assert.ok(place.altitudeKm > 150 && place.altitudeKm < 350, `height ${place.altitudeKm}`);
    assert.ok(place.speedKmS > 7.5 && place.speedKmS < 8, `speed ${place.speedKmS}`);
    if (before) assert.ok(apart(before, place) < 520, `a minute moves it ${apart(before, place)} km`);
    before = place;
    count += 1;
  }
  assert.ok(count > 2000);
});

test("outside the flight there is no place: not before liftoff, not after landing, and not when the elements are days away", () => {
  const flight = missionOf("STS-1")!;
  const sets = missionElements(fileOf("sts-1")!)[flight.noradId!]!;
  assert.equal(missionPosition(sets, Date.parse(flight.launch) - 1000, flight), undefined);
  assert.equal(missionPosition(sets, Date.parse(flight.landing!) + 1000, flight), undefined);
  assert.ok(missionPosition(sets, Date.parse(flight.launch) + 3_600_000, flight));
  assert.equal(missionPosition(sets, Date.parse(flight.launch) + 30 * DAY), undefined);
  assert.equal(missionPosition([], Date.now()), undefined);
  const hubble = missionElements(fileOf("sts-125")!)[20580]!;
  const sm4 = missionOf("STS-125")!;
  assert.ok(missionPosition(hubble, Date.parse(sm4.launch) + DAY, sm4), "the telescope is placed for the days of the visit");
});

test("Hubble and the orbiter meet on the servicing mission: at the grapple of STS-125 they are placed within 400 km of each other, at the telescope's height", () => {
  const flight = missionOf("STS-125")!;
  const all = missionElements(fileOf("sts-125")!);
  const grab = Date.UTC(2009, 4, 13, 17, 14);
  const orbiter = missionPosition(all[flight.noradId!]!, grab, flight)!;
  const telescope = missionPosition(all[20580]!, grab)!;
  assert.ok(apart(orbiter, telescope) < 400, `${apart(orbiter, telescope).toFixed(0)} km apart at the grapple (the old sets leave a gap)`);
  assert.ok(telescope.altitudeKm > 520 && telescope.altitudeKm < 600, `the telescope was at ${telescope.altitudeKm.toFixed(0)} km`);
  const first = missions().find((one) => one.hubble === "deployment") as Mission;
  assert.equal(first.name, "STS-31");
});
