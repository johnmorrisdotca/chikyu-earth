// The frame a page puts in an iframe. The address says what it shows, and the frame fetches nothing but its own files:
//   ?look=line|thick|realistic|space   the drawing (line by default; realistic and space need WebGL and fall back to thick)
//   &center=lon,lat              where it is centred (0,20 by default; `me` asks the browser for the reader's place)
//   &graticule=1                 the lines of longitude and latitude
//   &hands=0                     the frame is a still picture; by default it can be turned, zoomed and moved by hand (drag, pinch, Ctrl and the wheel, the keys; a plain wheel at Fit scrolls the host page)
//   &turn=auto                   it also turns by itself at the Earth's own rate
//   &time=2026-06-21T12:00Z      the realistic look's moment (the real Sun at that time); now by default
//   &clouds=off &lights=off      the realistic look's layers
//   &speed=0                     the space look's clock: game seconds a second (0 holds still, the default; 1 is real time, 86400 a day a second)
//   &light=sun|lit|boost   how the Earth is lit: the true Sun, always lit (no black night side), or the true terminator with the night side raised
//   &bodies=realistic|painted|plain   how the Sun, planets, Pluto and moons are drawn (realistic by default; plain is the sphere in the right colour)
//   &scale=true &orbits=off &labels=1   the space look's scale, the planets' paths, and the names beside the bodies
//   &satellites=stations,starlink,gps,weather ... &sat=25544   the space look's satellites (any group of the catalogue, from this site's own files, refreshed from CelesTrak's lists every few hours) and the one marked
//   &ride=iss|css|starlink|Moon|Mars &rview=follow &rlook=horizon   the space look's camera riding along with a body, from it (default) or behind it, looking down (default) or at the horizon
//   &body=Mars &zoom=moon        the space look's camera (a number is the zoom itself): the body it looks at, and the part of the sky it shows (earth, moon, sun, inner, solar-system, or Jupiter-moons, Saturn-moons ...)
//   &lang=ja                     the credit line in the corner, in Japanese
// It draws only when something changes, and nothing while it is out of sight or the tab is hidden.
import "../src/element.ts";
import type { ChikyuEarth } from "../src/element.ts";
import type { ChikyuEarthRealistic } from "../src/realistic/element.ts";
import type { BodyName, ChikyuSpace, SpacePreset } from "../src/space/element.ts";
import { globeCredit } from "./frame-credit.ts";
import { planetPainter } from "./planet-painter.ts";
import { setBodyLabelFontUrl } from "../src/realistic/body-label.ts";
setBodyLabelFontUrl("fonts/Michroma-Regular.ttf");
import { fetchGroup, GROUP_STYLE, setsOfGroup, type GroupFile } from "./groups.ts";

const query = new URLSearchParams(location.search);
const frame = document.getElementById("frame")!;
const turn = query.get("turn");
const interactive = query.get("hands") !== "0";

const centre = query.get("center") ?? "0,20";
const look = query.get("look");
// the credit comes first, so it is there whatever else the frame does
globeCredit({ look, satellites: Boolean(query.get("satellites")) || ["iss", "css", "starlink"].includes(query.get("ride") ?? "") }, query.get("lang") === "ja");

/**
 * `center=me` is the embedding page's own choice: the page asks the browser once (the elements never do by themselves) and gives the answer to every element it made, whichever look is shown.
 * Until the answer comes, or if it never does, they open on 0,20.
 */
const placed: HTMLElement[] = [];
let place: string | undefined;
const centreOn = (element: HTMLElement): void => {
  element.setAttribute("center", centre === "me" ? (place ?? "0,20") : centre);
  placed.push(element);
};
if (centre === "me") {
  navigator.geolocation?.getCurrentPosition(
    (position) => {
      place = `${position.coords.longitude},${position.coords.latitude}`;
      for (const element of placed) element.setAttribute("center", place);
    },
    () => undefined,
    { timeout: 8000, maximumAge: 600_000 },
  );
}

/** The elements carry the hands; `hands=0` takes them off with `controls="none"`. */
const still = (element: HTMLElement): void => {
  if (!interactive) element.setAttribute("controls", "none");
};

/** Turn by itself at the Earth's own rate, on the element that is showing. */
const autoTurn = (): void => {
  const view = (earth as ChikyuEarth).controller;
  if (turn !== "auto" || !view) return;
  view.speed = 0.004178;
  view.play();
};

function mount(): ChikyuEarth | ChikyuEarthRealistic {
  const flat = document.createElement("chikyu-earth") as ChikyuEarth;
  flat.setAttribute("size", "420");
  flat.setAttribute("look", look === "thick" || look === "realistic" ? "thick" : "line");
  centreOn(flat);
  if (query.get("graticule") === "1") flat.setAttribute("graticule", "");
  still(flat);
  frame.append(flat);
  return flat;
}

/** The place of a satellite in its group's file, by NORAD number (the group is in the file's order, and all of them start). */
const groupIndex = (file: GroupFile, noradId: number): number => file.rows.findIndex((row) => row[0] === noradId);

const flat = mount();
let earth: ChikyuEarth | ChikyuEarthRealistic | ChikyuSpace = flat;
let space: ChikyuSpace | undefined;
let startZoom = 1;

if (look === "realistic") {
  const { setThreeLoader } = await import("../src/realistic/element.ts");
  setThreeLoader(() => import("./three-subset.ts"));
  const element = document.createElement("chikyu-earth-realistic") as ChikyuEarthRealistic;
  centreOn(element);
  element.setAttribute("texture-base", "textures/");
  const time = query.get("time");
  if (time && Number.isFinite(Date.parse(time))) element.setAttribute("time", time);
  if (query.get("clouds") === "off") element.setAttribute("clouds", "off");
  if (query.get("lights") === "off") element.setAttribute("lights", "off");
  if (query.get("light") === "lit" || query.get("light") === "boost") element.setAttribute("light", query.get("light")!);
  element.addEventListener("chikyu-unavailable", () => {
    element.remove();
    delete document.body.dataset["look"];
    flat.hidden = false;
    earth = flat;
    autoTurn();
  });
  flat.hidden = true;
  still(element);
  frame.append(element);
  document.body.dataset["look"] = "realistic";
  earth = element;
}

if (look === "space") {
  const { setThreeLoader, setBodyPainter } = await import("../src/space/element.ts");
  setThreeLoader(() => import("./three-subset.ts"));
  // the real Sun, planets, Pluto and moons come from wakusei-planets (an optional peer); without it they are plain spheres
  if (query.get("bodies") !== "plain") {
    const planets = await planetPainter();
    if (planets) setBodyPainter(planets);
  }
  const element = document.createElement("chikyu-space") as ChikyuSpace;
  centreOn(element);
  element.setAttribute("texture-base", "textures/");
  if (query.get("bodies") === "painted") element.setAttribute("bodies", "painted");
  if (query.get("light") === "lit" || query.get("light") === "boost") element.setAttribute("light", query.get("light")!);
  const time = query.get("time");
  if (time && Number.isFinite(Date.parse(time))) element.setAttribute("time", time);
  const speed = query.get("speed");
  element.setAttribute("speed", speed !== null && Number.isFinite(Number(speed)) ? speed : "0");
  if (query.get("scale") === "true") element.setAttribute("scale", "true");
  if (query.get("orbits") === "off") element.setAttribute("orbits", "off");
  if (query.get("labels") !== "1") element.setAttribute("labels", "off");
  element.addEventListener("chikyu-unavailable", () => {
    element.remove();
    delete document.body.dataset["look"];
    flat.hidden = false;
    earth = flat;
    space = undefined;
    autoTurn();
  });
  flat.hidden = true;
  still(element);
  frame.append(element);
  document.body.dataset["look"] = "space";
  earth = element;
  space = element;
  const body = query.get("body");
  if (body) element.body = body as BodyName;
  const preset = query.get("zoom");
  if (preset?.endsWith("-moons") && !body) element.body = preset.slice(0, -6) as BodyName;
  if (preset) startZoom = Number.isFinite(Number(preset)) && Number(preset) > 0 ? Number(preset) : element.zoomFor(preset as SpacePreset);
  element.controller?.set({ zoom: startZoom });

  const listed = (query.get("satellites") ?? "").split(",").filter((name) => name in GROUP_STYLE);
  const rideKey = query.get("ride");
  const rideGroup: "stations" | "starlink" | null = rideKey === "starlink" ? "starlink" : rideKey === "iss" || rideKey === "css" ? "stations" : null;
  const groups = rideGroup && !listed.includes(rideGroup) ? [...listed, rideGroup] : listed;
  if (groups.length > 0) {
    try {
      const [{ createSatellites }, ...files] = await Promise.all([import("../src/satellites/index.ts"), ...groups.map((name) => fetchGroup(name))]);
      const fileOf = new Map(groups.map((name, i) => [name, files[i]!]));
      // The elements are a snapshot: if it is too old for the date shown (and the address did not ask for one), show the day it was downloaded.
      const retrieved = Math.min(...files.map((file) => Date.parse(file.retrieved)));
      if (!time && Math.abs(Date.now() - retrieved) > 14 * 86_400_000) element.time = retrieved;
      for (const name of groups) {
        element.setSatellites(name, createSatellites(setsOfGroup(fileOf.get(name)!)), GROUP_STYLE[name]!);
        // a group that is only there to be ridden along with is not drawn
        if (!listed.includes(name)) element.showSatellites(name, false);
      }
      const chosen = Number(query.get("sat"));
      if (chosen) {
        const home = groups.find((name) => groupIndex(fileOf.get(name)!, chosen) >= 0);
        if (home) element.selectSatellite({ group: home, index: groupIndex(fileOf.get(home)!, chosen) });
      }
      if (rideKey === "iss" || rideKey === "css") {
        const at = groupIndex(fileOf.get("stations")!, rideKey === "iss" ? 25544 : 48274);
        if (at >= 0) element.ride({ group: "stations", index: at }, { view: query.get("rview") === "follow" ? "follow" : "from", look: query.get("rlook") === "horizon" ? "horizon" : "down", smooth: false });
      } else if (rideKey === "starlink") element.ride({ group: "starlink", index: 0 }, { view: query.get("rview") === "follow" ? "follow" : "from", look: query.get("rlook") === "horizon" ? "horizon" : "down", smooth: false });
    } catch {
      // No elements: the planets are still shown.
    }
  }
}

if (look === "space" && (query.get("ride") === "Moon" || query.get("ride") === "Mars")) {
  space?.ride(query.get("ride") as BodyName, { view: query.get("rview") === "follow" ? "follow" : "from", look: query.get("rlook") === "horizon" ? "horizon" : "down", smooth: false });
}

if (interactive) {
  frame.setAttribute("role", "group");
  frame.setAttribute("aria-label", "Earth view");
  autoTurn();
}

document.body.dataset["ready"] = "true";
