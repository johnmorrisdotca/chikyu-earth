# The reference for the passes' accuracy test (test/passes.test.ts): the same element sets and places run through Skyfield (https://rhodesmill.org/skyfield/, MIT, by Brandon Rhodes) and the
# Python `sgp4` package (the reference SGP4 code by the same author, from Vallado's C++), which share nothing with satellite.js or this package's own search. Dev only: run it by hand, never in CI.
#
#   python3 -m venv .venv-reference && .venv-reference/bin/pip install skyfield sgp4
#   .venv-reference/bin/python scripts/passes-reference.py > test/recorded/passes-skyfield-2026-11-09.json
#
# Skyfield's find_events gives the rise, culmination and set at 10 degrees; each event also carries the azimuth, altitude, range, the Sun's altitude from NASA's DE421 planetary ephemeris, and
# whether the satellite is in sunlight. (The first run downloads de421.bsp, 17 MB, from NASA's JPL into the current folder; it is not kept in the repository.)
import json, sys
from pathlib import Path
from sgp4.api import Satrec, WGS72
from sgp4 import omm
from skyfield.api import load, wgs84, EarthSatellite

root = Path(__file__).resolve().parent.parent
sets = json.loads((root / "test/recorded/passes-elements-2026-11-09.json").read_text())["sets"]
ts = load.timescale()
eph = load("de421.bsp")
sun, earth = eph["sun"], eph["earth"]

PLACES = [
    ("London", 51.5074, -0.1278, 10),
    ("Sydney", -33.8688, 151.2093, 20),
    ("Quito", -0.1807, -78.4678, 2850),
    ("Tokyo", 35.6762, 139.6503, 40),
]
CASES = [(25544, "London"), (25544, "Sydney"), (25544, "Quito"), (25544, "Tokyo"), (48274, "Tokyo"), (20580, "Sydney")]
START, END = (2026, 11, 9), (2026, 11, 19)

def satellite(row):
    fields = dict(row)
    fields["EPOCH"] = fields["EPOCH"]
    fields["EPHEMERIS_TYPE"] = 0
    fields["CLASSIFICATION_TYPE"] = "U"
    fields["ELEMENT_SET_NO"] = 999
    fields["REV_AT_EPOCH"] = 0
    rec = Satrec()
    omm.initialize(rec, fields)
    return EarthSatellite.from_satrec(rec, ts)

def utc(t):
    return t.utc_iso(places=3)

out = {"tool": "Skyfield 1.55 with sgp4 2.27 and JPL DE421", "minAltitude": 10, "window": {"from": "2026-11-09T00:00:00Z", "to": "2026-11-19T00:00:00Z"}, "cases": []}
for norad, name in CASES:
    row = next(s for s in sets if s["NORAD_CAT_ID"] == norad)
    place = next(p for p in PLACES if p[0] == name)
    sat = satellite(row)
    here = wgs84.latlon(place[1], place[2], elevation_m=place[3])
    t0, t1 = ts.utc(*START), ts.utc(*END)
    times, events = sat.find_events(here, t0, t1, altitude_degrees=10.0)
    diff = sat - here
    passes, current = [], {}
    for t, e in zip(times, events):
        alt, az, dist = diff.at(t).altaz()
        obs = (earth + here).at(t)
        sun_alt = obs.observe(sun).apparent().altaz()[0].degrees
        lit = bool(sat.at(t).is_sunlit(eph))
        point = {"time": utc(t), "altitude": round(alt.degrees, 4), "azimuth": round(az.degrees, 4), "rangeKm": round(dist.km, 3), "sunAltitude": round(sun_alt, 3), "sunlit": lit}
        key = ["start", "highest", "end"][int(e)]
        if key == "start":
            current = {}
        current[key] = point
        if key == "end" and len(current) == 3:
            passes.append(current)
    out["cases"].append({"norad": norad, "place": name, "latitude": place[1], "longitude": place[2], "heightM": place[3], "passes": passes})
json.dump(out, sys.stdout, separators=(",", ":"))
