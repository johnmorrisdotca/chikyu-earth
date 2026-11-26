// <chikyu-track>: one satellite on chizu's flat world map. The land is chizu's. This element hands it the ground track, the point under the satellite and the night side.
// Nothing is drawn at rest, out of sight or in a hidden tab. A live clock steps every ten seconds, and only then. No WebGL. This file registers nothing: `@johnmorrisdotca/chikyu-earth/track/define` does.
import type { ChizuOverlay } from "@johnmorrisdotca/chizu";
import { ChizuMapElement, defineMap } from "@johnmorrisdotca/chizu/element";
import type { ElementSet } from "../satellites/types.ts";
import { nightSide, trackPicture, type TrackPiece } from "./track.ts";

/** How often a live clock is drawn, milliseconds. The satellite moves a little; the map is not redrawn every frame. */
const STEP_MS = 10_000;

const hidden = (): boolean => typeof document !== "undefined" && document.visibilityState === "hidden";

/**
 * The `<chikyu-track>` custom element: a small flat world map of one satellite. Import `@johnmorrisdotca/chikyu-earth/track/define` to register the tag.
 * The land, the sea and the projection are chizu's world map (no country names). This element sets chizu's overlays: the night side, the ground track and the present point.
 * `time` is `now` (the default, kept up every ten seconds) or an ISO date. `satellite` is a NORAD catalogue number; hand the elements to the `satellite` property (the same OMM `ElementSet` the passes take).
 * `span` is the window in minutes, centred on `time` (one orbit when omitted): the half already flown and the half still to come are two tones, and each is split where it crosses the date line.
 * `theme` is `light` or `dark`, passed to the map. Nothing is drawn while the element is out of sight or the tab is hidden.
 *
 * @example
 * ```ts no-run
 * import "@johnmorrisdotca/chikyu-earth/track/define";
 * import type { ChikyuTrack } from "@johnmorrisdotca/chikyu-earth/track/define";
 *
 * const track = document.createElement("chikyu-track") as ChikyuTrack;
 * track.setAttribute("span", "90");
 * track.setAttribute("theme", "dark");
 * document.body.append(track);
 * ```
 */
export class ChikyuTrack extends HTMLElement {
  static observedAttributes = ["time", "satellite", "span", "theme"];

  #set: ElementSet | null = null;
  #map: ChizuMapElement | null = null;
  #timer: ReturnType<typeof setInterval> | undefined;
  #watcher: IntersectionObserver | undefined;
  #inView = false;
  readonly #onHide = (): void => this.#paint();

  /** The elements of the satellite named by the `satellite` attribute. Setting them draws again. */
  get satellite(): ElementSet | null {
    return this.#set;
  }
  set satellite(value: ElementSet | null) {
    this.#set = value && Number.isFinite(value.NORAD_CAT_ID) ? value : null;
    if (this.#set) this.setAttribute("satellite", String(this.#set.NORAD_CAT_ID));
    this.#paint();
  }

  connectedCallback(): void {
    if (!this.shadowRoot) {
      const root = this.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = `:host{display:block;width:240px;aspect-ratio:1000/489;overflow:hidden;color-scheme:light dark;--chikyu-track-past:#8aa0b8;--chikyu-track-coming:#e6b34d;--chikyu-track-mark:#e6b34d;--chikyu-track-night:#07111f}:host([theme="light"]){--chikyu-track-past:#5d6d7e;--chikyu-track-coming:#a15c00;--chikyu-track-mark:#a15c00;--chikyu-track-night:#243656}`;
      root.append(style);
    }
    document.addEventListener("visibilitychange", this.#onHide);
    if (typeof IntersectionObserver === "function") {
      this.#watcher = new IntersectionObserver((entries) => {
        this.#inView = entries.some((entry) => entry.isIntersecting);
        this.#paint();
      });
      this.#watcher.observe(this);
    } else this.#inView = true;
    this.#paint();
  }

  disconnectedCallback(): void {
    this.#stop();
    this.#watcher?.disconnect();
    this.#watcher = undefined;
    document.removeEventListener("visibilitychange", this.#onHide);
  }

  attributeChangedCallback(): void {
    if (this.isConnected) this.#paint();
  }

  #showing(): boolean {
    return this.isConnected && this.#inView && !hidden();
  }

  #stop(): void {
    if (this.#timer !== undefined) clearInterval(this.#timer);
    this.#timer = undefined;
  }

  #paint(): void {
    if (!this.#showing()) {
      this.#stop();
      return;
    }
    const map = this.#map ?? this.#mount();
    const theme = this.getAttribute("theme");
    if (theme === "light" || theme === "dark") map.setAttribute("theme", theme);
    else map.removeAttribute("theme");
    const { ms, live } = momentOf(this.getAttribute("time"));
    const span = this.getAttribute("span");
    const minutes = span === null || span.trim() === "" ? undefined : Number(span);
    map.overlays = overlaysOf(this.#elements(), ms, Number.isFinite(minutes) ? minutes : undefined);
    if (live && this.#timer === undefined) this.#timer = setInterval(() => this.#paint(), STEP_MS);
    if (!live) this.#stop();
  }

  #elements(): ElementSet | null {
    const asked = this.getAttribute("satellite");
    if (!this.#set) return null;
    if (asked === null || asked === "" || asked === String(this.#set.NORAD_CAT_ID)) return this.#set;
    return null;
  }

  #mount(): ChizuMapElement {
    defineMap();
    const map = document.createElement("chizu-map") as ChizuMapElement;
    map.setAttribute("region", "world");
    map.setAttribute("labels", "false");
    map.setAttribute("capital", "false");
    map.setAttribute("controls", "false");
    map.setAttribute("width", "240");
    const lang = (this.getAttribute("lang") ?? document.documentElement.lang).toLowerCase().startsWith("ja");
    map.setAttribute("label", lang ? "衛星の地上軌跡" : "A satellite's ground track");
    map.addEventListener("chizu-load", () => map.shadowRoot?.querySelector(".czm-says")?.remove());
    this.shadowRoot!.append(map);
    this.#map = map;
    return map;
  }
}

/** `now`, an ISO date, or milliseconds. Anything else is the live clock. */
function momentOf(value: string | null): { ms: number; live: boolean } {
  if (value === null || value.trim() === "" || value === "now") return { ms: Date.now(), live: true };
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) return { ms: parsed, live: false };
  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) return { ms: asNumber, live: false };
  return { ms: Date.now(), live: true };
}

/** Chizu's overlays for one picture. The night is an area, each run of the track is its own line, and the present point is a mark. */
function overlaysOf(set: ElementSet | null, ms: number, span: number | undefined): ChizuOverlay[] {
  let pieces: TrackPiece[];
  try {
    pieces = set ? trackPicture(set, ms, span) : [{ kind: "night", ring: nightSide(ms) }];
  } catch {
    pieces = [{ kind: "night", ring: nightSide(ms) }];
  }
  return pieces.map((piece): ChizuOverlay => {
    if (piece.kind === "night") return { kind: "area", ring: piece.ring, color: "var(--chikyu-track-night)", opacity: 0.45, id: "night" };
    if (piece.kind === "line") return { kind: "line", points: piece.points, color: piece.part === "past" ? "var(--chikyu-track-past)" : "var(--chikyu-track-coming)", width: 2, id: piece.part };
    return { kind: "mark", at: piece.at, color: "var(--chikyu-track-mark)", size: 6, id: "now" };
  });
}
