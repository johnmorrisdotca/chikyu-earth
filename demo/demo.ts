import "@johnmorrisdotca/kazoku-ui/view-controls/define";
import { createAddressState } from "@johnmorrisdotca/kazoku-ui/address-state";
import type { ViewChangeDetail } from "@johnmorrisdotca/kazoku-ui/view-controls/element";
import "../src/element.ts";
import { attachMarkers, type MarkerEventDetail, type Markers } from "../src/markers/index.ts";
import { crowd, PLACES } from "./places.ts";
import type { ChikyuEarth } from "../src/element.ts";
import type { ChikyuEarthRealistic } from "../src/realistic/element.ts";
import { WORDS } from "./words.js";
import type { BodyInfo, BodyName, ChikyuSpace, SpacePreset } from "../src/space/element.ts";

type Look = "line" | "thick" | "realistic" | "space";

/** A word of the page in the language it is in now (the family's chooser, set by the page), English if the chooser is not there. */
const say = (key: string, values: Record<string, string | number> = {}): string => {
  const chooser = Reflect.get(globalThis, "chikyuLanguage") as { word(key: string): string | undefined } | undefined;
  return (chooser?.word(key) ?? WORDS.en[key] ?? key).replace(/\{(\w+)\}/g, (all, name: string) => String(values[name] ?? all));
};

const flat = document.querySelector<ChikyuEarth>("chikyu-earth");
const controls = document.querySelector("kazoku-view-controls");
const stage = document.querySelector<HTMLElement>("#globe");

if (flat && controls && stage) {
  const address = createAddressState({ defaults: { look: "line" } });
  const status = document.querySelector<HTMLElement>("#status");
  const realControls = document.querySelector<HTMLElement>("#real-controls");
  const timeControls = document.querySelector<HTMLElement>("#time-controls");
  const speedControls = document.querySelector<HTMLElement>("#speed-controls");
  const spaceControls = document.querySelector<HTMLElement>("#space-controls");
  const scaleNote = document.querySelector<HTMLElement>("#scale-note");
  const placesBox = document.querySelector<HTMLElement>("#places");
  const pickedNote = document.querySelector<HTMLElement>("#picked");
  let space: ChikyuSpace | null = null;
  const lookButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-style]")];
  const realisticButton = lookButtons.find((b) => b.dataset["style"] === "realistic");
  const spaceButton = lookButtons.find((b) => b.dataset["style"] === "space");
  let real: ChikyuEarthRealistic | null = null;
  let markers: Markers | null = null;
  let listening: AbortController | null = null;
  const picked = document.querySelector<HTMLElement>("#picked");
  const hiddenGroups = new Set((address.get("hide") ?? "").split(",").filter(Boolean));
  const crowded = Number(address.get("places")) || 0;

  /** Put the places on whichever look is showing. */
  const mountMarkers = (element: ChikyuEarth | ChikyuEarthRealistic): void => {
    markers?.detach();
    listening?.abort();
    listening = new AbortController();
    const { signal } = listening;
    markers = attachMarkers(element);
    markers.addAll(crowded > 0 ? [...PLACES, ...crowd(Math.min(crowded, 20000))] : PLACES);
    for (const group of hiddenGroups) markers.hideGroup(group);
    Reflect.set(globalThis, "chikyuMarkers", markers);
    const tell = (text: string): void => {
      if (picked) picked.textContent = text;
    };
    const named = (d: MarkerEventDetail): string => d.marker?.label ?? say("together", { n: d.cluster?.length ?? 0 });
    element.addEventListener("chikyu-marker-hover", (e) => {
      const d = (e as CustomEvent<MarkerEventDetail>).detail;
      if (d.marker || d.cluster) tell(say("over", { name: named(d) }));
    }, { signal });
    element.addEventListener("chikyu-marker-click", (e) => tell(say("chose", { name: named((e as CustomEvent<MarkerEventDetail>).detail) })), { signal });
    element.addEventListener("chikyu-marker-focus", (e) => tell(say("focus", { name: named((e as CustomEvent<MarkerEventDetail>).detail) })), { signal });
  };

  const notice = (text: string | null): void => {
    if (!status) return;
    status.hidden = text === null;
    status.textContent = text ?? "";
  };

  // A full orthographic redraw is costly; Auto-turn is so slow that one a second is smooth and exact.
  const AUTO_REDRAW_MS = 1000;
  let autoDrawnAt = 0;
  controls.addEventListener("kazoku-viewchange", (event) => {
    const detail = (event as CustomEvent<ViewChangeDetail>).detail;
    if (real) {
      real.setView(detail, detail.final);
      return;
    }
    if (space) {
      space.setView(detail);
      return;
    }
    const now = performance.now();
    const auto = detail.reason === "auto" && now - autoDrawnAt >= AUTO_REDRAW_MS;
    if (auto) autoDrawnAt = now;
    flat.setView(detail, detail.final || auto);
  });

  const state = (): ViewChangeDetail => Reflect.get(controls, "state") as ViewChangeDetail;

  function leave3d(): void {
    if (!real && !space) return;
    real?.remove();
    space?.remove();
    real = null;
    space = null;
    controls!.removeAttribute("zoom-min");
    controls!.removeAttribute("zoom-max");
    Reflect.get(controls!, "controller").set({ zoom: 1 }, true, "look");
    mountMarkers(flat!);
    flat!.hidden = false;
    for (const box of [realControls, timeControls, speedControls, spaceControls, scaleNote, bodyInfo]) if (box) box.hidden = true;
    if (placesBox) placesBox.hidden = false;
    if (pickedNote) pickedNote.hidden = false;
  }

  const bodyInfo = document.querySelector<HTMLElement>("#body-info");
  const bodyButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-body]")];
  /** Look at one body: it fills the view, and a line says how big it is and how far. */
  function lookAtBody(name: BodyName, info?: BodyInfo): void {
    if (!space) return;
    space.body = name;
    Reflect.get(controls!, "controller").set({ zoom: 1 }, true, "body");
    for (const b of bodyButtons) b.classList.toggle("on", b.dataset["body"] === name);
    const facts = info ?? space.bodyInfo(name);
    if (bodyInfo) {
      bodyInfo.hidden = false;
      bodyInfo.textContent = `${name}: radius ${Math.round(facts.radiusKm).toLocaleString("en")} km, ${name === "Earth" ? "where we are" : `${Math.round(facts.distanceKm).toLocaleString("en")} km from the Earth`}.`;
    }
  }
  for (const button of bodyButtons) button.addEventListener("click", () => lookAtBody((button.dataset["body"] ?? "Earth") as BodyName));

  async function enterSpace(): Promise<boolean> {
    const [{ setThreeLoader }] = await Promise.all([import("../src/space/element.ts")]);
    setThreeLoader(() => import("./three-subset.ts"));
    if (!space) {
      leave3d();
      const element = document.createElement("chikyu-space") as ChikyuSpace;
      const centre = flat!.centre;
      element.setAttribute("center", `${centre.lon},${centre.lat}`);
      element.setAttribute("texture-base", "textures/");
      const scale = address.get("scale");
      const speed = address.get("speed");
      const startTime = address.get("time");
      if (scale === "true") element.setAttribute("scale", "true");
      if (speed !== null && Number.isFinite(Number(speed))) element.setAttribute("speed", speed);
      if (address.get("orbits") === "off") element.setAttribute("orbits", "off");
      if (address.get("labels") === "off") element.setAttribute("labels", "off");
      if (startTime && Number.isFinite(Date.parse(startTime))) element.setAttribute("time", startTime);
      element.addEventListener("chikyu-unavailable", () => {
        notice("The space view needs WebGL, which this browser did not give. Showing the line globe.");
        if (spaceButton) spaceButton.disabled = true;
        void setLook("line");
      });
      element.addEventListener("chikyu-body-click", (e) => lookAtBody((e as CustomEvent<BodyInfo>).detail.name, (e as CustomEvent<BodyInfo>).detail));
      element.addEventListener("chikyu-time", (e) => {
        const ms = (e as CustomEvent<{ time: number }>).detail.time;
        if (when && document.activeElement !== when) when.value = localValue(ms);
      });
      markers?.detach();
      markers = null;
      listening?.abort();
      flat!.hidden = true;
      controls!.setAttribute("zoom-min", "0.000001");
      controls!.setAttribute("zoom-max", "2.5");
      stage!.append(element);
      space = element;
      Reflect.get(controls!, "controller").set({ zoom: 1 }, true, "look");
      element.setView(state());
    }
    if (realControls) realControls.hidden = true;
    for (const box of [timeControls, speedControls, spaceControls]) if (box) box.hidden = false;
    if (scaleNote) scaleNote.hidden = space!.scale !== "compressed";
    if (placesBox) placesBox.hidden = true;
    if (pickedNote) pickedNote.hidden = true;
    return true;
  }

  async function enterRealistic(): Promise<boolean> {
    const [{ setThreeLoader }] = await Promise.all([import("../src/realistic/element.ts")]);
    setThreeLoader(() => import("./three-subset.ts"));
    if (!real) {
      leave3d();
      const element = document.createElement("chikyu-earth-realistic") as ChikyuEarthRealistic;
      const centre = flat!.centre;
      element.setAttribute("center", `${centre.lon},${centre.lat}`);
      element.setAttribute("texture-base", "textures/");
      const clouds = address.get("clouds");
      const lights = address.get("lights");
      const when = address.get("time");
      if (clouds === "off") element.setAttribute("clouds", "off");
      if (lights === "off") element.setAttribute("lights", "off");
      if (when && Number.isFinite(Date.parse(when))) element.setAttribute("time", when);
      element.addEventListener("chikyu-unavailable", () => {
        notice(say("noWebgl"));
        if (realisticButton) realisticButton.disabled = true;
        void setLook("line");
      });
      flat!.hidden = true;
      stage!.append(element);
      real = element;
      element.setView(state(), true);
      mountMarkers(element);
    }
    if (realControls) realControls.hidden = false;
    if (timeControls) timeControls.hidden = false;
    for (const box of [speedControls, spaceControls, scaleNote]) if (box) box.hidden = true;
    return true;
  }

  async function setLook(next: Look): Promise<void> {
    if (next === "realistic") {
      notice(null);
      await enterRealistic();
    } else if (next === "space") {
      notice(null);
      await enterSpace();
    } else {
      leave3d();
      flat!.setAttribute("style", next);
      flat!.setView(state(), true);
    }
    address.set("look", next);
    for (const b of lookButtons) {
      b.classList.toggle("on", b.dataset["style"] === next);
      b.setAttribute("aria-pressed", String(b.dataset["style"] === next));
    }
  }

  for (const button of lookButtons) {
    button.addEventListener("click", () => void setLook((button.dataset["style"] ?? "line") as Look));
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>("#places [data-group]")) {
    const group = button.dataset["group"] ?? "";
    button.setAttribute("aria-pressed", String(!hiddenGroups.has(group)));
    button.addEventListener("click", () => {
      const shown = markers?.toggleGroup(group) ?? true;
      button.setAttribute("aria-pressed", String(shown));
      if (shown) hiddenGroups.delete(group);
      else hiddenGroups.add(group);
      address.set("hide", hiddenGroups.size ? [...hiddenGroups].join(",") : null);
    });
  }
  mountMarkers(flat);

  const grat = document.querySelector<HTMLButtonElement>("#grat");
  grat?.addEventListener("click", () => {
    grat.setAttribute("aria-pressed", String(flat.toggleAttribute("graticule")));
    address.set("graticule", flat.hasAttribute("graticule") ? "1" : null);
  });

  document.querySelector<HTMLButtonElement>("#locate")?.addEventListener("click", () => {
    navigator.geolocation?.getCurrentPosition((position) => {
      const centre = `${position.coords.longitude},${position.coords.latitude}`;
      flat.setAttribute("center", centre);
      real?.setAttribute("center", centre);
      space?.setAttribute("center", centre);
    });
  });

  const clouds = document.querySelector<HTMLButtonElement>("#clouds");
  const lights = document.querySelector<HTMLButtonElement>("#lights");
  const when = document.querySelector<HTMLInputElement>("#when");
  const now = document.querySelector<HTMLButtonElement>("#now");

  const toggle = (button: HTMLButtonElement | null, key: "clouds" | "lights"): void => {
    button?.addEventListener("click", () => {
      const on = button.getAttribute("aria-pressed") !== "true";
      button.setAttribute("aria-pressed", String(on));
      if (real) real[key] = on;
      address.set(key, on ? null : "off");
    });
  };
  toggle(clouds, "clouds");
  toggle(lights, "lights");

  const speedButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-speed]")];
  const markSpeed = (value: number): void => {
    for (const b of speedButtons) b.classList.toggle("on", Number(b.dataset["speed"]) === value);
    address.set("speed", value === 1 ? null : String(value));
  };
  for (const button of speedButtons) {
    button.addEventListener("click", () => {
      const value = Number(button.dataset["speed"]);
      if (space) {
        space.speed = value;
        if (value !== 1) now?.setAttribute("aria-pressed", "false");
      }
      markSpeed(value);
    });
  }
  const scaleButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-scale]")];
  for (const button of scaleButtons) {
    button.addEventListener("click", () => {
      const value = button.dataset["scale"] === "true" ? "true" : "compressed";
      if (space) space.scale = value;
      for (const b of scaleButtons) b.classList.toggle("on", b === button);
      if (scaleNote) scaleNote.hidden = value !== "compressed";
      address.set("scale", value === "true" ? "true" : null);
    });
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-jump]")) {
    button.addEventListener("click", () => {
      if (!space) return;
      space.body = "Earth";
      for (const b of bodyButtons) b.classList.toggle("on", b.dataset["body"] === "Earth");
      Reflect.get(controls, "controller").set({ zoom: space.zoomFor((button.dataset["jump"] ?? "earth") as SpacePreset) }, true, "jump");
    });
  }
  const orbits = document.querySelector<HTMLButtonElement>("#orbits");
  const names = document.querySelector<HTMLButtonElement>("#labels");
  for (const [button, key] of [[orbits, "orbits"], [names, "labels"]] as const) {
    button?.addEventListener("click", () => {
      const on = button.getAttribute("aria-pressed") !== "true";
      button.setAttribute("aria-pressed", String(on));
      if (space) space[key] = on;
      address.set(key, on ? null : "off");
    });
  }

  const localValue = (ms: number): string => {
    const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
    return d.toISOString().slice(0, 16);
  };
  when?.addEventListener("change", () => {
    const ms = new Date(when.value).getTime();
    if (!Number.isFinite(ms)) return;
    now?.setAttribute("aria-pressed", "false");
    if (real) real.time = ms;
    if (space) space.time = ms;
    address.set("time", new Date(ms).toISOString().slice(0, 16) + "Z");
  });
  now?.addEventListener("click", () => {
    now.setAttribute("aria-pressed", "true");
    if (when) when.value = localValue(Date.now());
    if (real) real.time = "now";
    if (space) {
      space.time = "now";
      space.speed = 1;
      markSpeed(1);
    }
    address.set("time", null);
  });

  // The choices in the address: ?look=realistic&graticule=1&clouds=off&lights=off&time=2026-06-21T12:00Z
  const opened = address.all();
  const start = opened["center"]?.split(",").map(Number);
  if (start && start.length === 2 && start.every(Number.isFinite)) flat.setAttribute("center", `${start[0]},${start[1]}`);
  if (opened["graticule"] === "1") {
    flat.setAttribute("graticule", "");
    grat?.setAttribute("aria-pressed", "true");
  }
  if (opened["clouds"] === "off") clouds?.setAttribute("aria-pressed", "false");
  if (opened["lights"] === "off") lights?.setAttribute("aria-pressed", "false");
  const opening = opened["time"] && Number.isFinite(Date.parse(opened["time"])) ? Date.parse(opened["time"]) : null;
  if (when) when.value = localValue(opening ?? Date.now());
  if (opening !== null) now?.setAttribute("aria-pressed", "false");
  const first = opened["look"];
  if (opened["scale"] === "true") {
    for (const b of scaleButtons) b.classList.toggle("on", b.dataset["scale"] === "true");
  }
  if (opened["speed"] !== undefined && Number.isFinite(Number(opened["speed"]))) markSpeed(Number(opened["speed"]));
  if (opened["orbits"] === "off") orbits?.setAttribute("aria-pressed", "false");
  if (opened["labels"] === "off") names?.setAttribute("aria-pressed", "false");
  if (first === "thick" || first === "realistic" || first === "space") void setLook(first);
}
