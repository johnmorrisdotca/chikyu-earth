import test from "node:test";
import assert from "node:assert/strict";
import { loadCities } from "@johnmorrisdotca/kuni/cities";
import { cityNameText, cityRank, cityTiersFor, layoutCities, nameWidth, readCityNames, TIER_RADIUS, type CityFrame, type NamedCity } from "../src/cities/geometry.ts";
import { project } from "../src/markers/project.ts";

const city = (id: string, en: string, lon: number, lat: number, population: number | null, capital: NamedCity["capital"] = null, ja?: string): NamedCity => ({ id, name: ja ? { en, ja } : { en }, lon, lat, population, capital });

/** The view the realistic Earth gives: 400 by 400 pixels, the disc 160 in radius. */
const frameAt = (lon: number, lat: number, radius = 160): CityFrame => {
  const pose = { lon, lat, radius, cx: 200, cy: 200 };
  return {
    width: 400,
    height: 400,
    radius,
    project: (cityLon, cityLat, out) => {
      const at = project(cityLon, cityLat, pose);
      out.x = at.x;
      out.y = at.y;
      return at.z;
    },
  };
};

test("a bigger Earth shows more tiers, and none while it is small", () => {
  assert.deepEqual(cityTiersFor(TIER_RADIUS.capitals - 1), []);
  assert.deepEqual(cityTiersFor(TIER_RADIUS.capitals), ["capitals"]);
  assert.deepEqual(cityTiersFor(TIER_RADIUS["1m"]), ["capitals", "1m"]);
  assert.deepEqual(cityTiersFor(5000), ["capitals", "1m", "100k"]);
});

test("city-names: absent is off, bare is 24, a number is that many to 80", () => {
  assert.equal(readCityNames(null), null);
  assert.equal(readCityNames(""), 24);
  assert.equal(readCityNames("many"), 24);
  assert.equal(readCityNames("12"), 12);
  assert.equal(readCityNames("0"), 1);
  assert.equal(readCityNames("500"), 80);
});

test("rank: people first, and a national capital outranks a town of the same size", () => {
  assert.ok(cityRank(city("a", "A", 0, 0, 5_000_000)) > cityRank(city("b", "B", 0, 0, 1_000_000)));
  assert.ok(cityRank(city("c", "C", 0, 0, 10_000, "national")) > cityRank(city("d", "D", 0, 0, 10_000)));
  assert.ok(cityRank(city("e", "E", 0, 0, null, "subdivision")) > 0, "no figure still counts as a capital");
});

test("the name is in the page's language, and English where kuni has no Japanese", () => {
  assert.equal(cityNameText(city("a", "Osaka", 0, 0, 1, null, "大阪市"), "ja"), "大阪市");
  assert.equal(cityNameText(city("a", "Osaka", 0, 0, 1, null, "大阪市"), "en"), "Osaka");
  assert.equal(cityNameText(city("b", "Vaduz", 0, 0, 1), "ja"), "Vaduz");
  assert.equal(cityNameText({ name: { en: "Tokyo", ja: "東京都", jaShort: "東京" } }, "ja"), "東京", "the short form when kuni gives one");
});

test("a Japanese character is as wide as the text is tall", () => {
  assert.ok(nameWidth("東京", 12) > nameWidth("Tokyo", 12) - 12);
  assert.equal(nameWidth("東京", 20), 44);
});

test("cities on the far side and outside the box are left out; the near ones are named", () => {
  const cities = [city("t", "Tokyo", 139.69, 35.69, 37_000_000, "national"), city("p", "Paris", 2.35, 48.85, 11_000_000, "national"), city("s", "Sydney", 151.2, -33.87, 5_000_000)];
  const named = layoutCities(cities, frameAt(139.69, 35.69), "en", { max: 10, size: 12, dot: 3 });
  assert.deepEqual(named.map((one) => one.text), ["Tokyo", "Sydney"]);
  assert.ok(named.every((one) => one.x >= 0 && one.x <= 400 && one.y >= 0 && one.y <= 400));
  const tokyo = named[0]!;
  assert.ok(Math.abs(tokyo.x - 200) < 1e-6 && Math.abs(tokyo.y - 200) < 1e-6, "Tokyo is at the middle when the view is on it");
});

test("a city near the limb is left out, so none is crowded against the edge", () => {
  const edge = [city("x", "Edge", 85, 0, 9_000_000)];
  assert.equal(layoutCities(edge, frameAt(0, 0), "en", { max: 5, size: 12, dot: 3 }).length, 0, "5 degrees in from the limb");
  assert.equal(layoutCities([city("y", "Middle", 40, 0, 9_000_000)], frameAt(0, 0), "en", { max: 5, size: 12, dot: 3 }).length, 1);
});

test("names never overlap, the most populous keeps its name, and no more than max are shown", () => {
  const near = [city("a", "Alpha", 10, 10, 9_000_000), city("b", "Bravo", 10.2, 10.1, 8_000_000), city("c", "Charlie", 10.1, 9.9, 7_000_000), city("d", "Delta", 40, -20, 1_000_000), city("e", "Echo", -40, 30, 2_000_000)];
  const named = layoutCities(near, frameAt(0, 0, 160), "en", { max: 10, size: 12, dot: 3 });
  assert.equal(named[0]!.text, "Alpha");
  for (let i = 0; i < named.length; i += 1) {
    for (let j = i + 1; j < named.length; j += 1) {
      const a = named[i]!;
      const b = named[j]!;
      assert.ok(a.left + a.width <= b.left || b.left + b.width <= a.left || a.top + a.height <= b.top || b.top + b.height <= a.top, `${a.text} and ${b.text} do not overlap`);
    }
  }
  assert.equal(layoutCities(near, frameAt(0, 0, 160), "en", { max: 2, size: 12, dot: 3 }).length, 2);
});

test("with kuni's capitals: Tokyo is named, in Japanese on a Japanese page, and the names do not overlap", async () => {
  const world = (await loadCities("capitals")).cities;
  assert.ok(world.length > 200, "kuni has the capitals");
  const ranked = [...world].sort((a, b) => cityRank(b) - cityRank(a));
  const english = layoutCities(ranked, frameAt(139.69, 35.69, 300), "en", { max: 30, size: 12, dot: 3 });
  assert.ok(english.some((one) => one.text === "Tokyo"), "Tokyo");
  assert.ok(english.length > 3, "some capitals of Asia are named too");
  const japanese = layoutCities(ranked, frameAt(139.69, 35.69, 300), "ja", { max: 30, size: 12, dot: 3 });
  assert.ok(japanese.some((one) => /[぀-ヿ一-鿿]/.test(one.text)), "a Japanese name");
  for (let i = 0; i < english.length; i += 1) {
    for (let j = i + 1; j < english.length; j += 1) {
      const a = english[i]!;
      const b = english[j]!;
      assert.ok(a.left + a.width <= b.left || b.left + b.width <= a.left || a.top + a.height <= b.top || b.top + b.height <= a.top, `${a.text} and ${b.text} do not overlap`);
    }
  }
});
