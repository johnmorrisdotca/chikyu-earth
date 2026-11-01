// <chikyu-earth>: the globe as a web component. A shared view controller supplies its yaw, tilt, zoom and pan;
// it opens centred on where you are (the `center` attribute wins over geolocation). Importing registers it once.
import { globe } from "./globe.ts";
import { cleanStyle } from "./styles.ts";
import { HOME_VIEW } from "./view.ts";
import type { GeoPoint, GlobeView } from "./types.ts";

const readCentre = (value: string | null): GeoPoint | null => {
  if (!value) return null;
  const [lon, lat] = value.split(",").map((part) => Number(part.trim()));
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
  return { lon, lat };
};

export class ChikyuEarth extends HTMLElement {
  static observedAttributes = ["center", "style", "size", "graticule"];

  #centre: GeoPoint = { lon: 0, lat: 0 };
  #view: GlobeView = { ...HOME_VIEW };
  #drawn: GlobeView = { ...HOME_VIEW };

  connectedCallback(): void {
    this.#centre = readCentre(this.getAttribute("center")) ?? { lon: 0, lat: 0 };
    this.#render();
    this.#locate();
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "center") this.#centre = readCentre(value) ?? { lon: 0, lat: 0 };
    if (this.isConnected) this.#render();
  }

  /**
   * Apply a shared controller's camera. Every event updates the state; `final: false` makes only the cheap
   * relative transform, and `final: true` redraws the orthographic projection.
   */
  setView(view: GlobeView, final = true): void {
    this.#view = { ...view };
    if (final) this.#render();
    else this.#transform();
  }

  #locate(): void {
    if (readCentre(this.getAttribute("center"))) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.#centre = { lon: position.coords.longitude, lat: position.coords.latitude };
        this.#render();
      },
      () => {},
      { timeout: 8000, maximumAge: 600000 },
    );
  }

  #transform(): void {
    const svg = this.shadowRoot?.querySelector("svg");
    if (!svg) return;
    const zoom = this.#view.zoom / this.#drawn.zoom;
    const x = this.#view.panX - this.#drawn.panX;
    const y = this.#view.panY - this.#drawn.panY;
    svg.style.transformOrigin = "50% 50%";
    svg.style.transform = zoom === 1 && x === 0 && y === 0 ? "" : `translate(${x}px, ${y}px) scale(${zoom})`;
  }

  #render(): void {
    const size = Number(this.getAttribute("size")) || 320;
    const style = cleanStyle(this.getAttribute("style"));
    const svg = globe({ size, style, centre: this.#centre, view: this.#view, graticule: this.hasAttribute("graticule") });
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>:host{display:block}svg{display:block;width:100%;height:auto}</style>${svg}`;
    this.#drawn = { ...this.#view };
  }
}

if (typeof customElements !== "undefined" && !customElements.get("chikyu-earth")) {
  customElements.define("chikyu-earth", ChikyuEarth);
}
