// The places' markers in an element: a small box for each place, moved by CSS transforms when the picture is drawn, and a name for each that has room. The pulse of a `here` place is a CSS
// animation, so the picture is never drawn again for it; it stops while the element is out of sight, and a reader who asked for less motion gets none. Names are measured as the page draws them.
import { placeLabels } from "./labels.ts";
import { layoutPlaces, PLACE_LOOKS, type Place, type PlaceLook, type PlaceView } from "./places.ts";

/** A `places-look` attribute: one of `PLACE_LOOKS`, else `beam`. */
export const readPlaceLook = (value: string | null): PlaceLook => (PLACE_LOOKS as readonly string[]).includes(value ?? "") ? (value as PlaceLook) : "beam";

/** The places' look, for the element's own style sheet. Colours: `--chikyu-place-here` and `--chikyu-place-favourite` on the element or the page. */
export const PLACE_STYLE =
  "#places{position:absolute;inset:0;overflow:hidden;pointer-events:none}" +
  ".pl-mark{position:absolute;left:0;top:0;width:0;height:0;will-change:transform,opacity;--c:var(--chikyu-place-favourite,#ffd27a)}" +
  ".pl-mark[data-kind=here]{--c:var(--chikyu-place-here,#7df9ff)}" +
  ".pl-mark[hidden],.pl-name[hidden]{display:none}" +
  ".pl-disc{position:absolute;left:calc(var(--r) * -1);top:calc(var(--r) * -1);width:calc(var(--r) * 2);height:calc(var(--r) * 2)}" +
  ".pl-ring,.pl-pulse{position:absolute;inset:0;box-sizing:border-box;border-radius:50%;border:1.5px solid var(--c)}" +
  ".pl-ring{box-shadow:0 0 6px var(--c),inset 0 0 4px var(--c);background:radial-gradient(circle,var(--c) 0 18%,transparent 22%)}" +
  ".pl-pulse{opacity:0}" +
  ".pl-mark[data-kind=here] .pl-pulse{animation:pl-pulse 2.6s ease-out infinite}" +
  "#places.pl-still .pl-pulse{animation-play-state:paused}" +
  "@keyframes pl-pulse{0%{transform:scale(1);opacity:.75}100%{transform:scale(2.8);opacity:0}}" +
  "@media (prefers-reduced-motion:reduce){.pl-mark[data-kind=here] .pl-pulse{animation:none}}" +
  ".pl-stick{position:absolute;left:-1px;bottom:0;width:2px;height:100px;transform-origin:50% 100%;background:linear-gradient(to top,var(--c),color-mix(in srgb,var(--c) 40%,transparent) 70%,transparent);box-shadow:0 0 5px var(--c);border-radius:1px}" +
  ".pl-head{position:absolute;left:-2.5px;top:-2.5px;width:5px;height:5px;border-radius:50%;background:#fff;box-shadow:0 0 6px 1px var(--c)}" +
  ".pl-mark[data-kind=favourite] .pl-stick{width:1.5px;opacity:.8}" +
  ".pl-mark[data-kind=favourite] .pl-head{opacity:.85}" +
  "#places[data-look=pin] .pl-stick{background:var(--c);box-shadow:none;width:1.5px}" +
  "#places[data-look=pin] .pl-head{left:-4px;top:-4px;width:8px;height:8px;background:var(--c);box-shadow:0 0 0 1.5px rgba(4,10,20,.75)}" +
  "#places[data-look=pin] .pl-ring{box-shadow:none;background:none;opacity:.7}" +
  "#places[data-look=ring] .pl-stick,#places[data-look=ring] .pl-head{display:none}" +
  ".pl-name{position:absolute;left:0;top:0;box-sizing:border-box;padding:1px 6px;font:600 11px/16px system-ui,-apple-system,'Segoe UI',sans-serif;letter-spacing:.04em;white-space:nowrap;color:#eefcff;background:rgba(4,10,20,.72);border:1px solid color-mix(in srgb,var(--c) 60%,transparent);border-radius:3px;will-change:transform;--c:var(--chikyu-place-favourite,#ffd27a)}" +
  ".pl-name[data-kind=here]{--c:var(--chikyu-place-here,#7df9ff);color:#fff}" +
  ".pl-name[data-kind=satellite]{--c:#cfeaff;color:#cfeaff;font-weight:500;background:rgba(4,10,20,.5);border-color:transparent}" +
  ".pl-sat{position:absolute;left:-8px;top:-8px;width:16px;height:16px;box-sizing:border-box;border:1.2px solid #cfeaff;border-radius:50%;opacity:.85;will-change:transform}" +
  ".pl-sat[hidden]{display:none}" +
  ".pl-name.pl-measure{visibility:hidden}";

/** A satellite ringed and named in the picture just drawn: its name, where it is and whether it can be seen (in the box and not behind the Earth). */
export interface SatelliteMark {
  id: string;
  label: string;
  x: number;
  y: number;
  visible: boolean;
}

/** The ring round a named satellite, in CSS pixels. */
const SATELLITE_RING = 8;

/**
 * The places' markers in one element: hand it the places and the look, and a view at each draw.
 */
export interface PlaceLayer {
  set(places: readonly Place[]): void;
  look: PlaceLook;
  /** Lay the places on the picture just drawn; `null` hides them (the Earth is not in the picture). `taken` is boxes other names use; `marks` are satellites to ring and name, after the places' names and never over them. */
  frame(view: PlaceView | null, taken?: readonly { left: number; top: number; width: number; height: number }[], marks?: readonly SatelliteMark[]): void;
  readonly stats: { places: number; shown: number; labels: number; renders: number; rings: number; satelliteNames: number };
  /** The boxes the names and the markers' heads take in the picture just drawn, for other names to keep clear of. */
  readonly boxes: readonly { left: number; top: number; width: number; height: number }[];
  dispose(): void;
}

interface Mark {
  root: HTMLElement;
  disc: HTMLElement;
  stick: HTMLElement;
  head: HTMLElement;
  kind: string;
  ring: number;
}

/**
 * Make the places' layer in a box of an element's shadow root (the box is `#places`, styled by {@link PLACE_STYLE}).
 *
 * @param box - The element's `#places` box.
 * @returns The layer.
 */
export function createPlaceLayer(box: HTMLElement): PlaceLayer {
  const doc = box.ownerDocument;
  box.setAttribute("aria-hidden", "true");
  box.dataset["look"] = "beam";
  let places: readonly Place[] = [];
  let look: PlaceLook = "beam";
  const marks: Mark[] = [];
  const names: HTMLElement[] = [];
  const sizes = new Map<string, { width: number; height: number }>();
  const stats = { places: 0, shown: 0, labels: 0, renders: 0, rings: 0, satelliteNames: 0 };
  let boxes: { left: number; top: number; width: number; height: number }[] = [];
  const rings: HTMLElement[] = [];
  let measure: HTMLElement | null = null;

  const size = (place: Pick<Place, "label" | "kind"> | { label: string; kind: "satellite" }): { width: number; height: number } | null => {
    if (!place.label) return null;
    const kind = place.kind === "here" || place.kind === "satellite" ? place.kind : "favourite";
    const key = `${kind}\n${place.label}`;
    let found = sizes.get(key);
    if (!found) {
      if (!measure) {
        measure = doc.createElement("span");
        measure.className = "pl-name pl-measure";
        box.append(measure);
      }
      measure.dataset["kind"] = kind;
      measure.textContent = place.label;
      const rect = measure.getBoundingClientRect();
      found = { width: Math.ceil(rect.width), height: Math.ceil(rect.height) };
      if (found.width === 0) return null;
      if (sizes.size > 500) sizes.clear();
      sizes.set(key, found);
    }
    return found;
  };
  // a font that arrives later draws the names wider or narrower: measure them again
  const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts;
  const refit = (): void => sizes.clear();
  fonts?.addEventListener?.("loadingdone", refit);

  const markAt = (i: number): Mark => {
    let mark = marks[i];
    if (!mark) {
      const root = doc.createElement("div");
      root.className = "pl-mark";
      const disc = doc.createElement("div");
      disc.className = "pl-disc";
      disc.innerHTML = '<i class="pl-ring"></i><i class="pl-pulse"></i>';
      const stick = doc.createElement("i");
      stick.className = "pl-stick";
      const head = doc.createElement("i");
      head.className = "pl-head";
      root.append(disc, stick, head);
      box.append(root);
      mark = { root, disc, stick, head, kind: "", ring: 0 };
      marks[i] = mark;
    }
    return mark;
  };
  const nameAt = (i: number): HTMLElement => {
    let name = names[i];
    if (!name) {
      name = doc.createElement("span");
      name.className = "pl-name";
      box.append(name);
      names[i] = name;
    }
    return name;
  };
  const hideFrom = (list: HTMLElement[], from: number): void => {
    for (let i = from; i < list.length; i += 1) if (!list[i]!.hidden) list[i]!.hidden = true;
  };

  // the pulse stops while the element is out of sight
  const watcher = typeof IntersectionObserver === "function" ? new IntersectionObserver((entries) => box.classList.toggle("pl-still", !entries.some((entry) => entry.isIntersecting))) : null;
  watcher?.observe(box);

  return {
    set(next) {
      places = next;
      stats.places = next.length;
    },
    get look() {
      return look;
    },
    set look(value) {
      look = value;
      box.dataset["look"] = value;
    },
    frame(view, taken = [], satellites = []) {
      if (!view || (places.length === 0 && satellites.length === 0)) {
        hideFrom(marks.map((m) => m.root), 0);
        hideFrom(names, 0);
        hideFrom(rings, 0);
        stats.shown = 0;
        stats.labels = 0;
        stats.rings = 0;
        stats.satelliteNames = 0;
        if (places.length > 0) stats.renders += 1;
        boxes = [];
        return;
      }
      stats.renders += 1;
      const layout = layoutPlaces(places, view, look, { size, taken });
      // favourites first, so a `here` marker is drawn over them
      const order = [...layout.shapes].sort((a, b) => (places[a.index]!.kind === "here" ? 1 : 0) - (places[b.index]!.kind === "here" ? 1 : 0));
      for (const [i, shape] of order.entries()) {
        const mark = markAt(i);
        const kind = places[shape.index]!.kind === "here" ? "here" : "favourite";
        if (mark.kind !== kind) {
          mark.kind = kind;
          mark.root.dataset["kind"] = kind;
        }
        if (mark.ring !== shape.ring) {
          mark.ring = shape.ring;
          mark.root.style.setProperty("--r", `${shape.ring}px`);
        }
        if (mark.root.hidden) mark.root.hidden = false;
        mark.root.style.transform = `translate(${shape.x.toFixed(1)}px,${shape.y.toFixed(1)}px)`;
        mark.root.style.opacity = shape.opacity >= 1 ? "" : shape.opacity.toFixed(2);
        mark.disc.style.transform = `rotate(${shape.ringAngle.toFixed(1)}deg) scale(1,${shape.squash.toFixed(3)})`;
        mark.stick.style.transform = `rotate(${shape.angle.toFixed(1)}deg) scaleY(${(shape.length / 100).toFixed(3)})`;
        mark.head.style.transform = `translate(${(shape.tipX - shape.x).toFixed(1)}px,${(shape.tipY - shape.y).toFixed(1)}px)`;
      }
      hideFrom(marks.map((m) => m.root), order.length);
      for (const [i, spot] of layout.labels.entries()) {
        const place = places[spot.index]!;
        const name = nameAt(i);
        const kind = place.kind === "here" ? "here" : "favourite";
        if (name.textContent !== place.label) name.textContent = place.label ?? "";
        if (name.dataset["kind"] !== kind) name.dataset["kind"] = kind;
        if (name.hidden) name.hidden = false;
        name.style.transform = `translate(${Math.round(spot.left)}px,${Math.round(spot.top)}px)`;
      }
      // the ringed satellites: a ring round each that can be seen, and its name where it is free of the places' names and the boxes taken
      const used = [...taken];
      for (const spot of layout.labels) {
        const found = size(places[spot.index]!);
        if (found) used.push({ left: spot.left, top: spot.top, ...found });
      }
      const seen = satellites.filter((mark) => mark.visible);
      for (const [i, mark] of seen.entries()) {
        let ring = rings[i];
        if (!ring) {
          ring = doc.createElement("i");
          ring.className = "pl-sat";
          box.append(ring);
          rings[i] = ring;
        }
        if (ring.hidden) ring.hidden = false;
        ring.style.transform = `translate(${mark.x.toFixed(1)}px,${mark.y.toFixed(1)}px)`;
      }
      hideFrom(rings, seen.length);
      const items: { x: number; y: number; r: number; w: number; h: number; priority: number }[] = [];
      const owners: SatelliteMark[] = [];
      for (const [i, mark] of seen.entries()) {
        const found = mark.label ? size({ label: mark.label, kind: "satellite" }) : null;
        if (!found) continue;
        items.push({ x: mark.x, y: mark.y, r: SATELLITE_RING + 2, w: found.width, h: found.height, priority: -i });
        owners.push(mark);
      }
      const placed = placeLabels(items, view.width, view.height, 24, 64, used);
      for (const [k, spot] of placed.entries()) {
        const mark = owners[spot.item]!;
        const name = nameAt(layout.labels.length + k);
        if (name.textContent !== mark.label) name.textContent = mark.label;
        if (name.dataset["kind"] !== "satellite") name.dataset["kind"] = "satellite";
        if (name.hidden) name.hidden = false;
        name.style.transform = `translate(${Math.round(spot.left)}px,${Math.round(spot.top)}px)`;
      }
      hideFrom(names, layout.labels.length + placed.length);
      boxes = used.slice(taken.length);
      for (const spot of placed) boxes.push({ left: spot.left, top: spot.top, width: items[spot.item]!.w, height: items[spot.item]!.h });
      for (const shape of layout.shapes) boxes.push({ left: shape.tipX - 5, top: shape.tipY - 5, width: 10, height: 10 });
      stats.shown = order.length;
      stats.labels = layout.labels.length;
      stats.rings = seen.length;
      stats.satelliteNames = placed.length;
    },
    stats,
    get boxes() {
      return boxes;
    },
    dispose() {
      watcher?.disconnect();
      fonts?.removeEventListener?.("loadingdone", refit);
      box.replaceChildren();
      marks.length = 0;
      names.length = 0;
      measure = null;
    },
  };
}
