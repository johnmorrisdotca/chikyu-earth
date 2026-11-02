// The frame a page puts in an iframe. The address says what it shows, and the frame fetches nothing but its own files:
//   ?look=line|thick|realistic|space   the drawing (line by default; realistic and space need WebGL and fall back to thick)
//   &center=lon,lat              where it is centred (0,20 by default; `me` asks the browser for the reader's place)
//   &graticule=1                 the lines of longitude and latitude
//   &turn=0|1|auto               still (default), turned by hand, or turning by itself at the Earth's own rate
//   &time=2026-06-21T12:00Z      the realistic look's moment (the real Sun at that time); now by default
//   &clouds=off &lights=off      the realistic look's layers
//   &speed=0                     the space look's clock: game seconds a second (0 holds still, the default; 1 is real time, 86400 a day a second)
//   &scale=true &orbits=off &labels=1   the space look's scale, the planets' paths, and the names beside the bodies
//   &body=Mars &zoom=moon        the space look's camera: the body it looks at, and the part of the sky it shows (earth, moon, sun, inner, solar-system)
// It draws only when something changes, and nothing while it is out of sight or the tab is hidden.
import { createViewController, type ViewState } from "@johnmorrisdotca/kazoku-ui/view-controls";
import "../src/element.ts";
import type { ChikyuEarth } from "../src/element.ts";
import type { ChikyuEarthRealistic } from "../src/realistic/element.ts";
import type { BodyName, ChikyuSpace, SpacePreset } from "../src/space/element.ts";
import type { GlobeView } from "../src/types.ts";

const query = new URLSearchParams(location.search);
const frame = document.getElementById("frame")!;
const turn = query.get("turn");
const interactive = turn === "1" || turn === "auto";
frame.dataset["turn"] = interactive ? "1" : "0";

const centre = query.get("center") ?? "0,20";
const look = query.get("look");
const AUTO_REDRAW_MS = 1000;

function mount(): ChikyuEarth | ChikyuEarthRealistic {
  const flat = document.createElement("chikyu-earth") as ChikyuEarth;
  flat.setAttribute("size", "420");
  flat.setAttribute("look", look === "thick" || look === "realistic" ? "thick" : "line");
  if (centre !== "me") flat.setAttribute("center", centre);
  if (query.get("graticule") === "1") flat.setAttribute("graticule", "");
  frame.append(flat);
  return flat;
}

const flat = mount();
let earth: ChikyuEarth | ChikyuEarthRealistic | ChikyuSpace = flat;
let real = false;
let space: ChikyuSpace | undefined;
let startZoom = 1;

if (look === "realistic") {
  const { setThreeLoader } = await import("../src/realistic/element.ts");
  setThreeLoader(() => import("./three-subset.ts"));
  const element = document.createElement("chikyu-earth-realistic") as ChikyuEarthRealistic;
  element.setAttribute("center", centre === "me" ? "0,20" : centre);
  element.setAttribute("texture-base", "textures/");
  const time = query.get("time");
  if (time && Number.isFinite(Date.parse(time))) element.setAttribute("time", time);
  if (query.get("clouds") === "off") element.setAttribute("clouds", "off");
  if (query.get("lights") === "off") element.setAttribute("lights", "off");
  element.addEventListener("chikyu-unavailable", () => {
    element.remove();
    flat.hidden = false;
    earth = flat;
    real = false;
  });
  flat.hidden = true;
  frame.append(element);
  earth = element;
  real = true;
}

if (look === "space") {
  const { setThreeLoader } = await import("../src/space/element.ts");
  setThreeLoader(() => import("./three-subset.ts"));
  const element = document.createElement("chikyu-space") as ChikyuSpace;
  element.setAttribute("center", centre === "me" ? "0,20" : centre);
  element.setAttribute("texture-base", "textures/");
  const time = query.get("time");
  if (time && Number.isFinite(Date.parse(time))) element.setAttribute("time", time);
  const speed = query.get("speed");
  element.setAttribute("speed", speed !== null && Number.isFinite(Number(speed)) ? speed : "0");
  if (query.get("scale") === "true") element.setAttribute("scale", "true");
  if (query.get("orbits") === "off") element.setAttribute("orbits", "off");
  if (query.get("labels") !== "1") element.setAttribute("labels", "off");
  element.addEventListener("chikyu-unavailable", () => {
    element.remove();
    flat.hidden = false;
    earth = flat;
    real = false;
    space = undefined;
  });
  flat.hidden = true;
  frame.append(element);
  earth = element;
  space = element;
  const body = query.get("body");
  if (body) element.body = body as BodyName;
  const preset = query.get("zoom");
  if (preset) startZoom = element.zoomFor(preset as SpacePreset);
  element.setView({ yaw: 0, tilt: 0, zoom: startZoom });
}

if (interactive) {
  frame.tabIndex = 0;
  frame.setAttribute("role", "group");
  frame.setAttribute("aria-label", "Earth view");
  let drawnAt = 0;
  const view = createViewController({
    speed: 0.004178,
    zoom: space ? startZoom : "fit",
    limits: space ? { tiltMax: 90, zoomMin: 0.000001, zoomMax: 2.5 } : { tiltMax: 90 },
    onChange(state: ViewState, info) {
      const detail: GlobeView = { yaw: state.yaw, tilt: state.tilt, zoom: state.zoom, panX: state.panX, panY: state.panY };
      if (space) {
        space.setView(detail);
        return;
      }
      if (real) {
        (earth as ChikyuEarthRealistic).setView(detail, info.final);
        return;
      }
      const now = performance.now();
      const auto = info.reason === "auto" && now - drawnAt >= AUTO_REDRAW_MS;
      if (auto) drawnAt = now;
      (earth as ChikyuEarth).setView(detail, info.final || auto);
    },
  });
  view.bind(frame);
  if (turn === "auto") view.play();
  // Nothing turns while nothing can see it.
  let seen = true;
  let shown = !document.hidden;
  let suspended = false;
  const settle = (): void => {
    const idle = !(seen && shown);
    if (idle === suspended) return;
    suspended = idle;
    if (idle) view.suspendTurn();
    else view.resumeTurn();
  };
  new IntersectionObserver((entries) => {
    seen = entries.some((entry) => entry.isIntersecting);
    settle();
  }).observe(frame);
  document.addEventListener("visibilitychange", () => {
    shown = !document.hidden;
    settle();
  });
}

document.body.dataset["ready"] = "true";
