import "@johnmorrisdotca/kazoku-ui/view-controls/define";
import { createAddressState } from "@johnmorrisdotca/kazoku-ui/address-state";
import type { ViewChangeDetail } from "@johnmorrisdotca/kazoku-ui/view-controls/element";
import "../src/element.ts";
import { attachMarkers, type MarkerEventDetail, type Markers } from "../src/markers/index.ts";
import { crowd, PLACES } from "./places.ts";
import type { ChikyuEarth } from "../src/element.ts";
import type { ChikyuEarthRealistic } from "../src/realistic/element.ts";

type Look = "line" | "thick" | "realistic";

const flat = document.querySelector<ChikyuEarth>("chikyu-earth");
const controls = document.querySelector("kazoku-view-controls");
const stage = document.querySelector<HTMLElement>("#globe");

if (flat && controls && stage) {
  const address = createAddressState({ defaults: { look: "line" } });
  const status = document.querySelector<HTMLElement>("#status");
  const realControls = document.querySelector<HTMLElement>("#real-controls");
  const lookButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-style]")];
  const realisticButton = lookButtons.find((b) => b.dataset["style"] === "realistic");
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
    const say = (text: string): void => {
      if (picked) picked.textContent = text;
    };
    const named = (d: MarkerEventDetail): string => d.marker?.label ?? `${d.cluster?.length ?? 0} places together`;
    element.addEventListener("chikyu-marker-hover", (e) => {
      const d = (e as CustomEvent<MarkerEventDetail>).detail;
      if (d.marker || d.cluster) say(`Over ${named(d)}`);
    }, { signal });
    element.addEventListener("chikyu-marker-click", (e) => say(`Chose ${named((e as CustomEvent<MarkerEventDetail>).detail)}`), { signal });
    element.addEventListener("chikyu-marker-focus", (e) => say(`Focus on ${named((e as CustomEvent<MarkerEventDetail>).detail)}`), { signal });
  };

  const say = (text: string | null): void => {
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
    const now = performance.now();
    const auto = detail.reason === "auto" && now - autoDrawnAt >= AUTO_REDRAW_MS;
    if (auto) autoDrawnAt = now;
    flat.setView(detail, detail.final || auto);
  });

  const state = (): ViewChangeDetail => Reflect.get(controls, "state") as ViewChangeDetail;

  function leaveRealistic(): void {
    if (!real) return;
    real.remove();
    real = null;
    mountMarkers(flat!);
    flat!.hidden = false;
    if (realControls) realControls.hidden = true;
  }

  async function enterRealistic(): Promise<boolean> {
    const [{ setThreeLoader }] = await Promise.all([import("../src/realistic/element.ts")]);
    setThreeLoader(() => import("./three-subset.ts"));
    if (!real) {
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
        say("The realistic look needs WebGL, which this browser did not give. Showing the line globe.");
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
    return true;
  }

  async function setLook(next: Look): Promise<void> {
    if (next === "realistic") {
      say(null);
      await enterRealistic();
    } else {
      leaveRealistic();
      flat!.setAttribute("style", next);
      flat!.setView(state(), true);
    }
    address.set("look", next);
    for (const b of lookButtons) b.classList.toggle("on", b.dataset["style"] === next);
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

  const localValue = (ms: number): string => {
    const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
    return d.toISOString().slice(0, 16);
  };
  when?.addEventListener("change", () => {
    const ms = new Date(when.value).getTime();
    if (!Number.isFinite(ms)) return;
    now?.setAttribute("aria-pressed", "false");
    if (real) real.time = ms;
    address.set("time", new Date(ms).toISOString().slice(0, 16) + "Z");
  });
  now?.addEventListener("click", () => {
    now.setAttribute("aria-pressed", "true");
    if (when) when.value = localValue(Date.now());
    if (real) real.time = "now";
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
  if (first === "thick" || first === "realistic") void setLook(first);
}
