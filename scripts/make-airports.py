#!/usr/bin/env python3
"""Make src/flat/airports-data.ts, the airports of the flat map, from OurAirports' open data (see NOTICE.md).

    python3 -I scripts/make-airports.py [cache-dir]     # needs Python 3 only

Downloads airports.csv and runways.csv once from https://davidmegginson.github.io/ourairports-data/ into the cache dir (default .cache/airports, git-ignored)
and keeps the airports that are large or medium, have scheduled service and an IATA code. Each is a row [longitude, latitude, IATA code, name, ISO country, tier]:
tier 1 is a large airport, tier 2 a medium one. Rows are ordered by tier, then by the runways (the longest, and how many; most first), so a map that has room for only some shows the greater ones.
Nothing is fetched at runtime: the rows are in the package, and the element loads them only when the airports are asked for.
"""
import csv
import json
import os
import sys
import urllib.request

BASE = "https://davidmegginson.github.io/ourairports-data/"
cache = sys.argv[1] if len(sys.argv) > 1 else ".cache/airports"
os.makedirs(cache, exist_ok=True)


def fetch(name):
    path = os.path.join(cache, name)
    if not os.path.exists(path):
        urllib.request.urlretrieve(BASE + name, path)
    return path


longest = {}
count = {}
with open(fetch("runways.csv"), encoding="utf8") as handle:
    for row in csv.DictReader(handle):
        if row["closed"] == "1" or not row["length_ft"]:
            continue
        longest[row["airport_ident"]] = max(longest.get(row["airport_ident"], 0), int(float(row["length_ft"])))
        count[row["airport_ident"]] = count.get(row["airport_ident"], 0) + 1


def weight(ident):
    """A greater airport has a longer runway and more of them: the longest in feet, and 1,500 more for each runway after the first."""
    return longest.get(ident, 0) + 1500 * max(0, count.get(ident, 0) - 1)


rows = []
with open(fetch("airports.csv"), encoding="utf8") as handle:
    for row in csv.DictReader(handle):
        tier = {"large_airport": 1, "medium_airport": 2}.get(row["type"])
        if tier is None or row["scheduled_service"] != "yes" or not row["iata_code"] or not row["iso_country"]:
            continue
        rows.append((tier, -weight(row["ident"]), row["iata_code"], [round(float(row["longitude_deg"]), 2), round(float(row["latitude_deg"]), 2), row["iata_code"], row["name"], row["iso_country"], tier]))
rows.sort(key=lambda r: (r[0], r[1], r[2]))
seen = set()
out = []
for tier, _, iata, data in rows:
    if iata in seen:
        continue
    seen.add(iata)
    out.append(data)

body = ",\n".join("  " + json.dumps(row, ensure_ascii=False, separators=(",", ":")) for row in out)
header = '''// The airports of the flat map: the large and medium airports with scheduled service and an IATA code, from OurAirports (https://ourairports.com/data/, released to the public domain: the data repository
// https://github.com/davidmegginson/ourairports-data carries The Unlicense; see NOTICE.md). Made by scripts/make-airports.py; do not edit it by hand. A row is [longitude, latitude, IATA code, name, ISO country, tier],
// tier 1 a large airport and tier 2 a medium one, the greater first in each tier (by their runways). The names are OurAirports' own, in English. Loaded only when the airports are asked for.

/** One airport: `[longitude, latitude, IATA code, name, ISO 3166 country code, tier]`. */
export type AirportRow = readonly [number, number, string, string, string, 1 | 2];

export const AIRPORT_ROWS: readonly AirportRow[] = [
'''
open("src/flat/airports-data.ts", "w", encoding="utf8").write(header + body + "\n] as const;\n")
print(len(out), "airports;", sum(1 for r in out if r[5] == 1), "large")
