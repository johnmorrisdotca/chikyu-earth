// The flat map's airports: the data (large and medium airports with scheduled service and an IATA code, from OurAirports), which of them a view draws and what one is called.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CODES_FROM_ZOOM, MEDIUM_FROM_ZOOM, airportLine, placeAirports, projectFlat, type Airport, type FlatView } from "../src/flat/index.ts";
import { AIRPORT_ROWS } from "../src/flat/airports-data.ts";

const ALL: Airport[] = AIRPORT_ROWS.map(([lon, lat, iata, name, country, tier]) => ({ lon, lat, iata, name, country, tier }));
const view = (zoom: number, more: Partial<FlatView> = {}): FlatView => ({ width: 1000, height: 500, centerLon: 0, centerLat: 0, zoom, ...more });

test("the data: large airports first, then medium ones, each with a code, a place on the Earth and a country", () => {
  assert.ok(ALL.length > 3000 && ALL.length < 3600, `${ALL.length} airports`);
  const firstMedium = ALL.findIndex((one) => one.tier === 2);
  assert.ok(firstMedium > 1000 && ALL.slice(0, firstMedium).every((one) => one.tier === 1) && ALL.slice(firstMedium).every((one) => one.tier === 2), "a tier at a time");
  assert.equal(new Set(ALL.map((one) => one.iata)).size, ALL.length, "each code once");
  for (const one of ALL) {
    assert.match(one.iata, /^[A-Z0-9]{3}$/);
    assert.match(one.country, /^[A-Z]{2}$/);
    assert.ok(Math.abs(one.lat) <= 90 && Math.abs(one.lon) <= 180, one.iata);
    assert.ok(one.name.length > 2, one.iata);
  }
  const code = new Map(ALL.map((one) => [one.iata, one]));
  for (const [iata, name] of [["HND", /Haneda/], ["NRT", /Narita/], ["JFK", /Kennedy/], ["LHR", /Heathrow/], ["CDG", /Charles de Gaulle/], ["SYD", /Sydney|Kingsford/]] as const) {
    assert.match(code.get(iata)?.name ?? "", name, iata);
    assert.equal(code.get(iata)?.tier, 1, `${iata} is large`);
  }
  // the greater hubs come before the small large ones: Chicago's O'Hare is among the first hundred
  assert.ok(ALL.findIndex((one) => one.iata === "ORD") < 100);
});

test("the whole world shows the greater airports only, a zoomed map shows more, and no two share a small cell", () => {
  const world = placeAirports(view(1), ALL);
  assert.ok(world.length > 100 && world.length < 700, `${world.length} at zoom 1`);
  assert.ok(world.every((one) => one.airport.tier === 1), "no medium airport in the whole world");
  const closer = placeAirports(view(MEDIUM_FROM_ZOOM, { centerLon: 10 }), ALL);
  assert.ok(closer.some((one) => one.airport.tier === 2), "the medium ones come in at zoom 3");
  const europeNear = placeAirports(view(1, { width: 1400, height: 700 }), ALL).length;
  assert.ok(europeNear > world.length, "a bigger box has room for more");
  // the first airport of the list is kept; one beside it in a cell is not
  const cells = new Set(world.map((one) => `${Math.floor(one.x / 16)}:${Math.floor(one.y / 16)}`));
  assert.equal(cells.size, world.length, "one to a cell");
  // codes are written from zoom 4, so the airports are further apart
  const wide = placeAirports(view(CODES_FROM_ZOOM - 0.5, { centerLon: 10 }), ALL).length;
  const written = placeAirports(view(CODES_FROM_ZOOM, { centerLon: 10 }), ALL).length;
  assert.ok(written < wide * 4, `${wide} then ${written}`);
});

test("an airport is where the map puts its longitude and latitude, and the world's other turn shows it too", () => {
  const v = view(1, { width: 2000, height: 500, centerLon: 170 });
  const placed = placeAirports(v, ALL);
  const nrt = placed.find((one) => one.airport.iata === "HND" || one.airport.iata === "NRT");
  assert.ok(nrt, "Tokyo is in the box");
  const at = projectFlat(v, nrt.airport.lon, nrt.airport.lat);
  assert.ok(Math.abs(nrt.y - at.y) < 1e-9);
  assert.ok([at.x, at.x - 360 * (2000 / 360), at.x + 360 * (2000 / 360)].some((x) => Math.abs(x - nrt.x) < 1e-6));
  assert.ok(placed.every((one) => one.x >= -6 && one.x <= 2006 && one.y >= -6 && one.y <= 506), "none outside the box but its padding");
  const turns = placed.filter((one) => one.airport.iata === "HND").length;
  assert.ok(turns >= 1 && turns <= 2);
});

test("an airport is called by its name, its code and its country, in the page's language", () => {
  const narita = ALL.find((one) => one.iata === "NRT")!;
  assert.equal(airportLine(narita, "Japan", "en"), "Narita International Airport (NRT), Japan");
  assert.equal(airportLine(narita, "日本", "ja"), "Narita International Airport（NRT）、日本");
  assert.equal(airportLine(narita, null, "en"), "Narita International Airport (NRT), JP");
});
