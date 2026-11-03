# Satellite data: which sources chikyu-earth may use, and for what

Research note, rewritten 2026-11-03 for MODULES-261 (the first note, 2026-11-02, covered Starlink and launches). Every source's terms were read on 2026-11-03 from the page named; the quotes are
from those pages. Tiers follow the spx-stats rules: **green** (the terms allow storing and reuse; clause and date recorded; only John makes a source green), **grey** (no reuse terms found:
a polite, capped, credited use only), **red-confirm** (read to confirm, never stored) and **red** (barred or unusable). Nothing here is legal advice, and a source can change its terms: each row says when it was read.

Two different things are wanted, and they are different problems:

- **Where a satellite is now:** a few numbers per satellite (orbital elements, "GP" data in JSON as CCSDS OMM, or a TLE). SGP4 in the browser turns them into a position for any moment, so the
  positions are computed, never fetched. The elements go stale: after a few days a low satellite is some kilometres out, so the age is always shown.
- **What a satellite is:** its name, number, group, orbit and a line on what it does. Facts, written here in our own words.

## Where each kind of data may go

Three places a source's data can end up, and three different answers:

- **(a) Fetched by the visitor's own browser.** The page the visitor opened asks the source directly. Nothing of ours stores it.
- **(b) Snapshotted on the demo site.** A scheduled build downloads the lists and publishes them next to the demo, credited, with their age.
- **(c) Redistributed in the npm package.** The package's files carry the data to everyone who installs it. The package ships **no orbital elements** and, until John says otherwise, never will.

| Source | Terms found (read 2026-11-03) | Tier | (a) own browser | (b) demo snapshot | (c) in the npm package |
|---|---|---|---|---|---|
| **CelesTrak** GP data (celestrak.org, T.S. Kelso; the U.S. Space Force's 18th Space Defense Squadron's elements and, for Starlink and some others, operator-supplied "SupGP") | The usage policy (written 2026-05-15, updated 05-22) states no licence, redistribution or credit rule. It states how to fetch: "For GP data, updates are once every 2 hours." "Only download the data you need, when you are going to use it, and only download data once per update." "M2M (machine-to-machine) software should immediately stop querying when it receives any non-HTTP 200 responses" and "Repeatedly ignoring them will end up sending your IP address to the firewall." Directory queries: "Please don't query these more than once per hour." It is "starting to enforce some of those limits for larger data sets, like the Active list for GP data and the Starlink list for GP & SupGP data." The GP page adds: "CelesTrak only checks for new GP data once every 2 hours." | **Grey** (no reuse clause; polite use is plainly invited) | **Yes.** The answer carries `access-control-allow-origin: *` (checked 2026-11-03), so a page may ask it. A page that does must follow the rules above (one ask per list per 2 hours, stop on any answer that is not 200). The package never does it for the page. | **Yes, with a credit and a cap.** One scheduled build, one download of each list every 6 hours at most, a pause between lists, stop at the first answer that is not 200, the retrieval time shown with the data. This is what the demo has done since 0.9. | **No.** No clause lets anyone pass the data on, so the package ships none. |
| **Space-Track** (space-track.org, U.S. Space Command) | User Agreement: the user "agrees not to transfer any data or technical information received from this website" without prior approval, **but** "USSPACECOM has provided express blanket approval for transfer/redistribution of basic SSA data", which is Two-Line Elements, Orbital Mean-element Messages, the SATCAT and decay data, "conditioned on appropriate citation". API rules: "Limit API queries to less than 30 requests per 1 minute(s) and 300 requests per 1 hour(s)". An account is needed. | **Grey, a green candidate** (the first note called it red; the blanket approval for basic data changes that). A source with an account and an Actions secret: John's decision. | **No.** It needs the account's login; a page cannot hold it. | **Possible, after John's yes**: a build with a read-only account's login as a repository secret, citing "U.S. Space Command, via Space-Track.org". | **Possible in principle** (the approval covers basic data) **but not recommended**: a snapshot in a package is stale the day it ships. Only with John's yes. |
| **SatNOGS DB** (db.satnogs.org, Libre Space Foundation) | "All data are public and freely distributed under the Creative Commons Atribution-Share Alike v4.0 license." API at `/api/tle/` and `/api/satellites/`; no rate limit stated on the pages read. No `access-control-allow-origin` header on the TLE answer (checked 2026-11-03). Its TLEs come from a named source per row (for the ISS, "CalPoly"). | **Green candidate** (an explicit open licence, share-alike and credit); John's yes makes it green. | **No** (no CORS header: the browser blocks it). | **Yes after John's yes**, with the credit "SatNOGS DB, CC BY-SA 4.0" and a link. Best for amateur satellites' names, status and frequencies. | **Not recommended**: share-alike would reach the package's own licence story. Names and numbers we write ourselves are fine. |
| **N2YO** (n2yo.com) | API: "the caller must be identified and authorized by a license key (API key)"; limits per hour (tle 1000, positions 1000, passes 100); users are asked "not to abuse the system" or "use multiple license keys". Site terms: "n2yo.com is an authorized redistributor and the license is renewed annually"; "All Content is copyrighted as a collective work"; its elements come from Space-Track ("AFSPC does not make any warranties as to the accuracy or completeness of the data"). No API clause on storing or redistributing the data was found. | **Red for us**: a key per user and no stated right to store or show the data. Unnecessary: SGP4 on the same government elements does the same. | No (key). | No. | No. |
| **AMSAT** (amsat.org Keplerian elements resources) | "Copyright 2026 Radio Amateur Satellite Corporation. All Rights Reserved." No licence or redistribution terms. Its bulletin is built from the government elements; the page itself says CelesTrak provides TLEs "for selected spacecraft". | **Grey at best**; unnecessary, since CelesTrak's `amateur` list covers the same satellites. A link to AMSAT in the guide is fine. | Only as the visitor's own choice of a URL (the 0.14 bring-your-own helper), never a default. | No. | No. |
| **NASA and ESA mission pages** | NASA content "generally are not subject to copyright in the United States"; "NASA should be acknowledged as the source of the material"; the insignia and logotype "are not in the public domain" (nasa.gov media guidelines, read 2026-11-02). ESA pages were not read for a licence. | **Green for facts** (a mission's launch year, orbit and job are facts); nothing copied, no logo, no picture. | n/a | n/a | **Facts only, in our own words**, in the catalogue. |
| **Wikidata and Wikipedia** | Wikidata CC0; Wikipedia CC BY-SA 4.0 (already green in spx-stats). | **Green** | n/a | n/a | Names, numbers and orbit types as facts, our own words for the lines. No Wikipedia text copied. |

## Lists the demo needs, and the CelesTrak list behind each

All from CelesTrak's `gp.php?GROUP=...&FORMAT=json`, which is the OMM JSON the package already reads. GEO satellites sit still over one point of the equator (one turn a day, the
same as the Earth), so the demo says so on the group; JWST is not in Earth orbit (it circles the Sun at L2, 1.5 million km out) and is not in any list.

| Demo group | CelesTrak list | Size on 2026-11-03 | Notes |
|---|---|---|---|
| Stations | `stations` | 20 | The ISS, Tiangong and the craft docked to them |
| Famous | single `CATNR` asks: Vanguard 1 (5), LAGEOS 1 (8820), Hubble (20580), Chandra (25867), Envisat (27386) | 5 | Five asks, a pause between each |
| Science | `science` | 46 | Hubble, Swift, Fermi, XMM-Newton, MMS; Chandra is on a 64-hour orbit |
| Earth observation | `resource` | 167 | Landsat 8 and 9, Sentinel-1 to -6, Terra, Aqua |
| Weather | `weather` | 74 | NOAA-20 and -21, Metop, Suomi NPP, Fengyun; the GOES, Himawari, Meteosat and Fengyun 2/4 ones are geostationary |
| Geostationary | `geo` | 569 | Sit still: one turn a day |
| GPS, GLONASS, Galileo, BeiDou | `gps-ops`, `glo-ops`, `galileo`, `beidou` | 32, 26, 32, 53 | About 20,000 km up (GLONASS 19,100; BeiDou also has geostationary and inclined ones) |
| Amateur radio | `amateur` | 98 | FUNcube-1, SO-50, RS-44, the Fox satellites |
| OneWeb | `oneweb` | 651 | 1,200 km polar orbit |
| Iridium | `iridium-NEXT` | 80 | 780 km, near polar |
| Starlink | `starlink` | 11,156 on 2026-11-02 | The demo keeps every fifth |

Read in a single download of each on 2026-11-03: most lists had every element set under three days old. The oldest were GLONASS (up to 19 days), Galileo (8) and BeiDou (7), which is why the demo
shows each satellite's age and dims one that is past 14 days.

## What the package does and does not do

1. **The package fetches nothing by itself.** It takes elements the page passes in (`createSatellites`) and, from 0.12, a **catalogue** of names, numbers and our own words (`CATALOGUE`, `SATELLITE_GROUPS`).
2. **Bring your own source** (0.14): a helper that reads OMM JSON or TLE text from a URL the *page's author* chooses, in the visitor's browser, refusing to ask more often than the rules above and stopping on any answer that is not 200. The page owns the choice of source and its terms.
3. **The demo site** refreshes its snapshot with a scheduled build (0.13), within CelesTrak's rules, and shows each satellite's age.

## Decisions for John

1. **CelesTrak stays grey.** The package fetches nothing from it by itself and ships none of its data; the demo keeps a credited snapshot. To make it green, ask T.S. Kelso (ts.kelso@celestrak.org) for the reuse terms in writing. Nothing built now needs it.
2. **Space-Track: yes or no to a read-only account** as a second source for the scheduled build (the blanket approval covers basic data with a citation). It needs an account and an Actions secret, which John makes.
3. **SatNOGS DB: yes or no to green.** It has an explicit CC BY-SA 4.0 licence. Wanted only if the amateur group should carry status and frequencies.

Filed as one ticket on the `modules` board. Nothing built waits for the answers.

## Launch data (from the first note, 2026-11-02, unchanged)

| Source | Terms found | Tier |
|---|---|---|
| **r/SpaceX API** (api.spacexdata.com) | Code Apache-2.0, data no stated licence; the repository was archived by its owner on 2026-06-06 and the API did not answer. | **Red** (not available) |
| **SpaceX itself** | No public API; the terms pages could not be read. | **Red** until John reads the terms |
| **Launch Library 2** (ll.thespacedevs.com) | "up to 15 non-authenticated requests per hour"; no reuse clause found. | **Grey** (a stored copy refreshed by a job, never from a visitor) |
| **Wikipedia and Wikidata** | CC BY-SA 4.0 and CC0. | **Green** |

This page is a research note, not a decision: no data from these sources is in the package.
