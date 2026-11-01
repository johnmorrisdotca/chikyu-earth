// <chikyu-earth>: the globe as a web component. It opens centred on where you are (the `center` attribute wins over
// geolocation), and turns at the Earth's own rate. Importing this file registers the element once.
import { globe } from "./globe.ts";
import { centreRotation, rotationAt } from "./rotate.ts";
import { cleanStyle } from "./styles.ts";
import type { GeoPoint, Rotation } from "./types.ts";

const TICK_MS = 1000;

const readCentre = (value: string | null): GeoPoint | null => {
  if (!value) return null;
  const [lon, lat] = value.split(",").map((part) => Number(part.trim()));
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
  return { lon, lat };
};

export class ChikyuEarth extends HTMLElement {
  static observedAttributes = ["center", "style", "size", "graticule", "rotate"];

  #centre: GeoPoint = { lon: 0, lat: 0 };
  #start = Date.now();
  #timer: ReturnType<typeof setInterval> | undefined;

  connectedCallback(): void {
    this.#start = Date.now();
    this.#centre = readCentre(this.getAttribute("center")) ?? { lon: 0, lat: 0 };
    this.#render();
    this.#locate();
    this.#timer = setInterval(() => this.#render(), TICK_MS);
  }

  disconnectedCallback(): void {
    if (this.#timer !== undefined) clearInterval(this.#timer);
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "center") {
      this.#centre = readCentre(value) ?? { lon: 0, lat: 0 };
      this.#start = Date.now();
    }
    if (this.isConnected) this.#render();
  }

  #locate(): void {
    if (readCentre(this.getAttribute("center"))) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.#centre = { lon: position.coords.longitude, lat: position.coords.latitude };
        this.#start = Date.now();
        this.#render();
      },
      () => {},
      { timeout: 8000, maximumAge: 600000 },
    );
  }

  #rotation(): Rotation {
    if (this.getAttribute("rotate") === "off") return centreRotation(this.#centre);
    return rotationAt(this.#centre, Date.now(), this.#start);
  }

  #render(): void {
    const size = Number(this.getAttribute("size")) || 320;
    const style = cleanStyle(this.getAttribute("style"));
    const svg = globe({ size, style, rotation: this.#rotation(), graticule: this.hasAttribute("graticule") });
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    root.innerHTML = svg;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("chikyu-earth")) {
  customElements.define("chikyu-earth", ChikyuEarth);
}
