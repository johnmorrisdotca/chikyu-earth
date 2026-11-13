// The nearest city on a "you are here" marker: which places are named, in which language, and how far is too far. kuni does the lookup; this chooses the label.
import test from "node:test";
import assert from "node:assert/strict";
import { HERE_CITY_KM, HERE_CITY_MAX_KM, HERE_CITY_TIERS, hereCityLabels, readHereCity, type HereCitySource } from "../src/markers/here-city.ts";
import { createHereCity } from "../src/markers/here-city-host.ts";

const paris = { id: "Q90", name: { en: "Paris", ja: "パリ" } };
const lyon = { id: "Q456", name: { en: "Lyon", ja: "リヨン", jaShort: "リヨン" } };

/** A stand-in for kuni's `nearest`: the closer of two cities, and none past `maxKm`. */
const source: HereCitySource = {
  nearest(point, options) {
    const km = (lat: number, lon: number): number => Math.hypot((point.lat - lat) * 111, (point.lon - lon) * 111 * Math.cos((point.lat * Math.PI) / 180));
    const hits = [
      { city: paris, km: km(48.86, 2.35) },
      { city: lyon, km: km(45.76, 4.84) },
    ].filter((hit) => options?.maxKm === undefined || hit.km <= options.maxKm);
    hits.sort((a, b) => a.km - b.km);
    return hits[0] ?? null;
  },
};

test("here-city is off unless asked, and a number is the kilometre limit", () => {
  assert.equal(readHereCity(null), false);
  assert.equal(readHereCity(undefined), false);
  assert.equal(readHereCity(""), HERE_CITY_KM);
  assert.equal(readHereCity("on"), HERE_CITY_KM);
  assert.equal(readHereCity(" ON "), HERE_CITY_KM);
  assert.equal(readHereCity("off"), false);
  assert.equal(readHereCity("40"), 40);
  assert.equal(readHereCity(" 12.5 "), 12.5);
  assert.equal(readHereCity("0"), false);
  assert.equal(readHereCity("-3"), false);
  assert.equal(readHereCity("nope"), false);
  assert.equal(readHereCity("999999"), HERE_CITY_MAX_KM);
  assert.deepEqual(HERE_CITY_TIERS, ["capitals", "1m", "100k"]);
});

test("only a here place is named, in the page's language, and not past maxKm", () => {
  const places = [
    { lon: 2.35, lat: 48.86, kind: "here" as const },
    { lon: 2.35, lat: 48.86, kind: "favourite" as const },
    { lon: 4.84, lat: 45.76, kind: "here" as const },
  ];
  const en = hereCityLabels(places, source, { lang: "en", maxKm: 100 });
  assert.deepEqual(en.map((hit) => hit.label), ["Paris", "Lyon"]);
  assert.deepEqual(en.map((hit) => hit.index), [0, 2]);
  assert.equal(hereCityLabels(places, source, { lang: "ja", maxKm: 100 })[0]?.label, "パリ");
  assert.equal(hereCityLabels([{ lon: 4.84, lat: 45.76, kind: "here" }], source, { lang: "ja", maxKm: 100 })[0]?.label, "リヨン");
  assert.equal(hereCityLabels([{ lon: 0, lat: 0, kind: "here" }], source, { lang: "en", maxKm: 50 }).length, 0);
  assert.equal(hereCityLabels([{ lon: 2.35, lat: 48.86, kind: "favourite" }], source, { lang: "en", maxKm: 100 }).length, 0);
});

test("kuni's own nearest city: Tokyo and Osaka, English and Japanese (kuni 1.6.1, read 2026-11-13)", async () => {
  const { loadCities } = await import("@johnmorrisdotca/kuni/cities");
  const world = await loadCities(...HERE_CITY_TIERS);
  const tokyo = hereCityLabels([{ lon: 139.6917, lat: 35.6895, kind: "here" }], world, { lang: "en", maxKm: HERE_CITY_KM });
  assert.equal(tokyo[0]?.label, "Tokyo");
  assert.ok((tokyo[0]?.km ?? Infinity) < 5);
  // kuni 1.6.1 stores no short Japanese name, so the Japanese name is the one it gives (東京都, 大阪市). A jaShort, when a later kuni gives one, is preferred (covered above).
  assert.equal(hereCityLabels([{ lon: 139.6917, lat: 35.6895, kind: "here" }], world, { lang: "ja", maxKm: HERE_CITY_KM })[0]?.label, "東京都");
  const osaka = hereCityLabels([{ lon: 135.5023, lat: 34.6937, kind: "here" }], world, { lang: "en", maxKm: 40 });
  assert.equal(osaka[0]?.label, "Osaka");
  assert.equal(hereCityLabels([{ lon: 135.5023, lat: 34.6937, kind: "here" }], world, { lang: "ja", maxKm: 40 })[0]?.label, "大阪市");
  assert.equal(hereCityLabels([{ lon: 170, lat: 0, kind: "here" }], world, { lang: "en", maxKm: 50 }).length, 0);
});

test("kuni is not loaded until here-city is on and a here place is set", async () => {
  let loads = 0;
  let lang: "en" | "ja" = "en";
  let release: (source: HereCitySource) => void = () => {};
  const changes: string[] = [];
  const places = [
    { id: "me", lon: 2.35, lat: 48.86, label: "You are here", kind: "here" as const },
    { id: "lyon", lon: 4.84, lat: 45.76, label: "Lyon", kind: "favourite" as const },
  ];
  const host = createHereCity({
    language: () => lang,
    load: () => {
      loads += 1;
      return new Promise((resolve) => {
        release = resolve;
      });
    },
    onChange: () => changes.push(host.named(places)[0]?.label ?? ""),
  });
  assert.equal(host.named(places)[0]?.label, "You are here");
  assert.equal(loads, 0);
  assert.equal(host.stats.on, false);
  host.setLimit(HERE_CITY_KM);
  assert.equal(host.named(places)[0]?.label, "You are here");
  assert.equal(loads, 1);
  assert.equal(host.stats.pending, true);
  host.named(places);
  assert.equal(loads, 1, "a second ask does not load again");
  release(source);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(changes, ["Paris"]);
  assert.equal(host.stats.loaded, true);
  assert.equal(host.stats.pending, false);
  assert.equal(host.named(places)[1]?.label, "Lyon", "a favourite keeps its own name");
  lang = "ja";
  host.refresh();
  await Promise.resolve();
  assert.deepEqual(changes, ["Paris", "パリ"]);
  host.setLimit(false);
  assert.equal(host.named(places)[0]?.label, "You are here");
  assert.equal(loads, 1, "turning it off does not drop the cities, and does not load them again");
  host.dispose();
});
