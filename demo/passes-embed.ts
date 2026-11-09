// The frame a page puts in an iframe: the passes of the ISS, Tiangong and Hubble over a place, as `<chikyu-passes>` draws them. The address says what it shows, and the frame fetches nothing but this site's own file
// of orbit data (elements/bright.json), once:
//   ?lat=35.69&lon=139.69      the place (Tokyo by default)
//   &sat=iss|css|hst|all       the satellite (the ISS by default)
//   &days=3|5|7|10             how many days (5 by default)
//   &tz=Asia/Tokyo             the time zone (the longitude's own offset when missing)
//   &show=all                  every pass, not only the visible ones
//   &sky=nautical              the lightest sky a pass may be seen in
//   &lang=ja                   the words
//   &from=2026-11-09T12:00Z    the first moment (now by default)
import "../src/passes/element.ts";
import type { ChikyuPasses } from "../src/passes/element.ts";
import { CREDIT, PASS_SATELLITES, type PassSat } from "./passes-code.ts";

const query = new URLSearchParams(location.search);
const number = (name: string, fallback: number, min: number, max: number): number => {
  const n = Number(query.get(name));
  return query.get(name) !== null && query.get(name) !== "" && Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};
const lat = number("lat", 35.69, -90, 90);
const lon = number("lon", 139.69, -180, 180);
const sat = (["iss", "css", "hst", "all"].includes(query.get("sat") ?? "") ? query.get("sat") : "iss") as PassSat;
const lang = query.get("lang") === "ja" ? "ja" : "en";
document.documentElement.lang = lang;

const element = document.createElement("chikyu-passes") as ChikyuPasses;
element.setAttribute("latitude", String(lat));
element.setAttribute("longitude", String(lon));
element.setAttribute("days", String(Math.round(number("days", 5, 1, 14))));
element.setAttribute("lang", lang);
if (sat !== "all") element.setAttribute("satellite", String(PASS_SATELLITES[sat]));
if (query.get("show") === "all") element.setAttribute("show", "all");
if (query.get("sky") === "nautical" || query.get("sky") === "astronomical" || query.get("sky") === "night") element.setAttribute("sky", query.get("sky")!);
const zone = query.get("tz");
if (zone) element.setAttribute("time-zone", zone);
else element.setAttribute("utc-offset", String(Math.round(lon / 15)));
const from = query.get("from");
if (from && Number.isFinite(Date.parse(from))) element.setAttribute("from", from);
element.setAttribute("credit", CREDIT);
element.setAttribute("elements-src", new URL("elements/bright.json", location.href).href);
document.getElementById("frame")!.append(element);
element.addEventListener("chikyu-passes", () => {
  document.body.dataset["ready"] = "true";
});
