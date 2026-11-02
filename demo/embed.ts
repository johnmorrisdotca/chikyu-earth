// The frame a page puts in an iframe. The address says what it shows, and the frame fetches nothing but its own files:
//   ?look=line|thick|realistic   the drawing (line by default; realistic needs WebGL and falls back to thick)
//   &center=lon,lat              where it is centred (0,20 by default; `me` asks the browser for the reader's place)
//   &graticule=1                 the lines of longitude and latitude
//   &turn=0|1|auto               still (default), turned by hand, or turning by itself at the Earth's own rate
//   &time=2026-06-21T12:00Z      the realistic look's moment (the real Sun at that time); now by default
//   &clouds=off &lights=off      the realistic look's layers
// It draws only when something changes, and nothing while it is out of sight or the tab is hidden.
import { createViewController, type ViewState } from "@johnmorrisdotca/kazoku-ui/view-controls";
import "../src/element.ts";
import type { ChikyuEarth } from "../src/element.ts";
import type { ChikyuEarthRealistic } from "../src/realistic/element.ts";
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
let earth: ChikyuEarth | ChikyuEarthRealistic = flat;
let real = false;

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

if (interactive) {
  frame.tabIndex = 0;
  frame.setAttribute("role", "group");
  frame.setAttribute("aria-label", "Earth view");
  let drawnAt = 0;
  const view = createViewController({
    speed: 0.004178,
    zoom: "fit",
    limits: { tiltMax: 90 },
    onChange(state: ViewState, info) {
      const detail: GlobeView = { yaw: state.yaw, tilt: state.tilt, zoom: state.zoom, panX: state.panX, panY: state.panY };
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
