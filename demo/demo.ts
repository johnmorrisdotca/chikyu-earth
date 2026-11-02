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
import type { SatelliteInfo, SatelliteRef, Satellites } from "../src/satellites/index.ts";

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
  const satControls = document.querySelector<HTMLElement>("#sat-controls");
  const satInfo = document.querySelector<HTMLElement>("#sat-info");
  const satNote = document.querySelector<HTMLElement>("#sat-note");
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
    for (const box of [realControls, timeControls, speedControls, spaceControls, scaleNote, bodyInfo, satControls, satInfo, satNote]) if (box) box.hidden = true;
    if (placesBox) placesBox.hidden = false;
    if (pickedNote) pickedNote.hidden = false;
  }

  const bodyInfo = document.querySelector<HTMLElement>("#body-info");
  let infoOf: { name: BodyName; facts: BodyInfo } | null = null;
  const describe = (name: BodyName, facts: BodyInfo): string => {
    const values = { name: say(`body_${name}`), radius: Math.round(facts.radiusKm).toLocaleString(say("locale")), distance: Math.round(facts.distanceKm).toLocaleString(say("locale")) };
    return say(name === "Earth" ? "bodyFactEarth" : "bodyFact", values);
  };
  /** Words that live in the element, not in the page: the names beside the bodies. */
  const speakSpace = (): void => {
    if (!space) return;
    space.bodyNames = Object.fromEntries(bodyButtons.map((b) => [b.dataset["body"], say(`body_${b.dataset["body"]}`)]));
    space.bodyHint = say("chooseBody");
    space.setAttribute("aria-label", say("spaceAria"));
    if (infoOf && bodyInfo && !bodyInfo.hidden) bodyInfo.textContent = describe(infoOf.name, infoOf.facts);
  };
  document.addEventListener("kazoku-languagechange", () => queueMicrotask(speakSpace));
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
      infoOf = { name, facts };
      bodyInfo.textContent = describe(name, facts);
    }
  }
  for (const button of bodyButtons) button.addEventListener("click", () => lookAtBody((button.dataset["body"] ?? "Earth") as BodyName));

  // --- satellites: CelesTrak's element sets of one day, in a small file of this site's own, made into groups the first time one is asked for ---------------------------------
  interface Snapshot {
    retrieved: string;
    fields: string[];
    groups: Record<string, (string | number)[][]>;
  }
  const GROUP_STYLE = { stations: { color: "#ffd54f", size: 6, orbits: true }, starlink: { color: "#7fd4ff", size: 2.5, orbits: false } } as const;
  const GROUP_ALL = 11156;
  const MAX_AGE_DAYS = 14;
  let snapshot: Promise<Snapshot> | null = null;
  const made = new Map<string, Satellites>();
  const shownGroups = new Set((address.get("sats") ?? "").split(",").filter((name) => name in GROUP_STYLE));
  const satButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-sat-group]")];

  const loadSnapshot = (): Promise<Snapshot> => (snapshot ??= fetch("celestrak-snapshot.json").then((response) => (response.ok ? (response.json() as Promise<Snapshot>) : Promise.reject(new Error(String(response.status))))));
  async function groupOf(name: keyof typeof GROUP_STYLE): Promise<Satellites> {
    const found = made.get(name);
    if (found) return found;
    const [{ createSatellites }, data] = await Promise.all([import("../src/satellites/index.ts"), loadSnapshot()]);
    const sets = data.groups[name]!.map((row) => Object.fromEntries(data.fields.map((field, index) => [field, row[index]])) as never);
    const group = createSatellites(sets, { maxAgeDays: MAX_AGE_DAYS });
    made.set(name, group);
    Reflect.set(globalThis, "chikyuSatellites", { createSatellites, groups: made });
    return group;
  }
  const ageText = (days: number): string => (Math.abs(days) < 2 ? say("satAgeHours", { n: Math.round(Math.abs(days) * 24) }) : say("satAgeDays", { n: Math.round(Math.abs(days)) }));
  const describeSatellite = (info: SatelliteInfo): string => say("satFact", { name: info.name, altitude: Math.round(info.altitudeKm), speed: info.speedKmS.toFixed(2), period: Math.round(info.periodMinutes), age: ageText(info.ageDays) });
  const showSatellite = (ref: SatelliteRef | null): void => {
    space?.selectSatellite(ref);
    const info = ref && space ? space.satelliteInfo(ref) : undefined;
    if (satInfo) {
      satInfo.hidden = !info;
      satInfo.textContent = info ? describeSatellite(info) : "";
    }
    address.set("sat", info ? String(info.noradId) : null);
  };
  const noteSatellites = async (): Promise<void> => {
    if (!satNote) return;
    const data = await loadSnapshot();
    satNote.hidden = false;
    satNote.textContent = say("satNote", { date: new Date(data.retrieved).toLocaleDateString(say("locale"), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }), stations: data.groups["stations"]!.length, starlink: data.groups["starlink"]!.length.toLocaleString(say("locale")), all: GROUP_ALL.toLocaleString(say("locale")), limit: 60 });
  };
  /** Show or hide one group on the space view; the first time, make it. The elements are a day's snapshot: if that is too old for the date shown, show the day it was downloaded instead. */
  async function toggleGroup(name: keyof typeof GROUP_STYLE, on: boolean): Promise<void> {
    if (!space) return;
    const button = satButtons.find((b) => b.dataset["satGroup"] === name);
    button?.setAttribute("aria-pressed", String(on));
    if (on) shownGroups.add(name);
    else shownGroups.delete(name);
    address.set("sats", shownGroups.size ? [...shownGroups].join(",") : null);
    if (!on) {
      space.showSatellites(name, false);
      return;
    }
    try {
      const group = await groupOf(name);
      const data = await loadSnapshot();
      const retrieved = Date.parse(data.retrieved);
      if (Math.abs(space.time - retrieved) > MAX_AGE_DAYS * 86_400_000 && address.get("time") === null) {
        space.time = retrieved;
        if (when) when.value = localValue(retrieved);
        now?.setAttribute("aria-pressed", "false");
        notice(say("satOld", { days: Math.round(Math.abs(Date.now() - retrieved) / 86_400_000), date: data.retrieved.slice(0, 10) }));
      }
      if (!space.satelliteGroups.some((one) => one.name === name)) space.setSatellites(name, group, GROUP_STYLE[name]);
      else space.showSatellites(name, true);
      void noteSatellites();
    } catch {
      notice(say("satLoadFail"));
      button?.setAttribute("aria-pressed", "false");
      shownGroups.delete(name);
    }
  }
  for (const button of satButtons) button.addEventListener("click", () => void toggleGroup(button.dataset["satGroup"] as keyof typeof GROUP_STYLE, button.getAttribute("aria-pressed") !== "true"));
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-sat-find]")) {
    button.addEventListener("click", async () => {
      if (!space) return;
      const noradId = Number(button.dataset["satFind"]);
      await toggleGroup("stations", true);
      const index = (await groupOf("stations")).sets.findIndex((set) => set.NORAD_CAT_ID === noradId);
      if (index >= 0) showSatellite({ group: "stations", index });
    });
  }

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
        notice(say("noWebglSpace"));
        if (spaceButton) spaceButton.disabled = true;
        void setLook("line");
      });
      element.addEventListener("chikyu-body-click", (e) => lookAtBody((e as CustomEvent<BodyInfo>).detail.name, (e as CustomEvent<BodyInfo>).detail));
      element.addEventListener("chikyu-satellite-click", (e) => showSatellite((e as CustomEvent<SatelliteRef>).detail));
      element.addEventListener("chikyu-satellites-unavailable", () => notice(say("satLoadFail")));
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
      speakSpace();
      Reflect.get(controls!, "controller").set({ zoom: 1 }, true, "look");
      element.setView(state());
    }
    if (realControls) realControls.hidden = true;
    for (const box of [timeControls, speedControls, spaceControls, satControls]) if (box) box.hidden = false;
    if (scaleNote) scaleNote.hidden = space!.scale !== "compressed";
    for (const b of satButtons) b.setAttribute("aria-pressed", String(shownGroups.has(b.dataset["satGroup"] ?? "")));
    for (const name of shownGroups) void toggleGroup(name as keyof typeof GROUP_STYLE, true);
    const wanted = Number(address.get("sat"));
    if (wanted) {
      void toggleGroup("stations", true).then(async () => {
        const index = (await groupOf("stations")).sets.findIndex((set) => set.NORAD_CAT_ID === wanted);
        if (index >= 0) showSatellite({ group: "stations", index });
      });
    }
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
