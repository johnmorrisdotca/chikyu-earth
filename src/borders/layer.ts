// The borders drawn on the Earth's sphere: the countries' as one batch of lines, and the regions' (provinces, states, prefectures) as another once the Earth is large enough on the screen to tell them
// apart. The shapes are loaded only when a set is switched on: the countries from chizu's `world-geo`, the regions from the page's own loader. Nothing is drawn here: the scene draws when asked,
// and this asks for a draw only when a set of shapes has arrived.
import type * as THREE from "three";
import type { ThreeParts } from "../realistic/textures.ts";
import { BORDER_REGIONS_RADIUS, codesNear, shapeBoxes, sharedEdges, type BorderShapes } from "./lines.ts";

/** The lines sit this far above the ground (in Earth radii): over the map tiles and the sphere's flat facets, and under the clouds. */
const BORDER_RADIUS = 1.0015;
const COUNTRY_LOOK = { color: "#ffd75e", opacity: 0.85 } as const;
const REGION_LOOK = { color: "#ffd75e", opacity: 0.6 } as const;

/**
 * Where the borders' shapes come from. `countries` gives the countries (chizu's `world-geo`, Natural Earth 1:110m, when left out); `regions` gives one country's regions by its code, or `null`
 * for a country with none, and draws no regions when left out. Each is a set of shapes in longitude and latitude.
 *
 * @example
 * ```ts no-run
 * import type { BorderData } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const data: BorderData = { regions: async (code) => (code === "JP" ? (await fetch("/regions/jp.json")).json() : null) };
 * console.log(typeof data.regions);
 * ```
 */
export interface BorderData {
  countries?: () => Promise<BorderShapes>;
  regions?: (code: string) => Promise<BorderShapes | null>;
}

/**
 * What the borders have done: how many segments each set has, whether each was drawn at the last draw, the countries whose regions have arrived, how many times a set's lines were made, and whether
 * a set could not be loaded.
 *
 * @example
 * ```ts no-run
 * import type { BorderStats } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const empty: BorderStats = { countries: 0, regions: 0, shown: { countries: false, regions: false }, loaded: [], builds: 0, failed: false };
 * console.log(empty);
 * ```
 */
export interface BorderStats {
  countries: number;
  regions: number;
  shown: { countries: boolean; regions: boolean };
  loaded: string[];
  builds: number;
  failed: boolean;
}

/** What the element and the scene share: the sets switched on, where the shapes come from, and what the layer did. */
export interface BorderState {
  countries: boolean;
  regions: boolean;
  data: BorderData;
  onError?: (error: unknown) => void;
  stats: BorderStats;
}

export const newBorderState = (): BorderState => ({ countries: false, regions: false, data: {}, stats: { countries: 0, regions: 0, shown: { countries: false, regions: false }, loaded: [], builds: 0, failed: false } });

/** Places the view shows, how far round the sphere the view reaches from each (degrees), and the Earth's radius on the screen (CSS pixels). */
export interface BorderView {
  points: readonly { lon: number; lat: number }[];
  angle: number;
  radius: number;
}

export interface BorderLayer {
  sync(view: BorderView): void;
  dispose(): void;
}

const worldGeo = async (): Promise<BorderShapes> => (await import("@johnmorrisdotca/chizu/world-geo")).default as unknown as BorderShapes;

/**
 * Makes the layer under `parent` (the group that turns with the Earth). It loads what the sets switched on need, the first time `sync` asks.
 *
 * @param three - The page's three.js; it must have `LineSegments`.
 * @param parent - The Earth's own group.
 * @param state - The model's borders.
 * @param invalidate - Asks for a draw (when shapes arrive).
 * @param order - The render order: after the clouds, before the air.
 * @returns The layer.
 */
export function createBorderLayer(three: ThreeParts, parent: THREE.Object3D, state: BorderState, invalidate: () => void, order: number): BorderLayer {
  const Lines = three.LineSegments;
  if (!Lines) throw new Error("the three.js handed over has no LineSegments, which the borders need");
  let disposed = false;
  let asked = false;
  let boxes: Map<string, [number, number, number, number]> | null = null;
  const regionAsked = new Set<string>();
  const regionLines = new Map<string, Float32Array>();
  const stats = state.stats;

  const make = (look: { color: string; opacity: number }): THREE.LineSegments => {
    const geometry = new three.BufferGeometry();
    const material = new three.LineBasicMaterial({ color: look.color, transparent: true, opacity: look.opacity, depthWrite: false });
    const lines = new Lines(geometry, material);
    lines.scale.setScalar(BORDER_RADIUS);
    lines.renderOrder = order;
    lines.visible = false;
    parent.add(lines);
    return lines;
  };
  const countries = make(COUNTRY_LOOK);
  const regions = make(REGION_LOOK);
  const fill = (lines: THREE.LineSegments, positions: Float32Array): void => {
    lines.geometry.dispose();
    const geometry = new three.BufferGeometry();
    geometry.setAttribute("position", new three.BufferAttribute(positions, 3));
    lines.geometry = geometry;
    stats.builds += 1;
  };
  const fail = (error: unknown): void => {
    if (disposed) return;
    stats.failed = true;
    state.onError?.(error);
  };

  const loadCountries = (): void => {
    if (asked) return;
    asked = true;
    let loading: Promise<BorderShapes>;
    try {
      loading = (state.data.countries ?? worldGeo)();
    } catch (error) {
      fail(error);
      return;
    }
    loading.then((shapes) => {
      if (disposed) return;
      const positions = sharedEdges(shapes);
      fill(countries, positions);
      stats.countries = positions.length / 6;
      boxes = shapeBoxes(shapes);
      invalidate();
    }, fail);
  };

  const loadRegions = (codes: readonly string[]): void => {
    const loader = state.data.regions;
    if (!loader) return;
    for (const code of codes) {
      if (regionAsked.has(code)) continue;
      regionAsked.add(code);
      let loading: Promise<BorderShapes | null>;
      try {
        loading = loader(code);
      } catch (error) {
        fail(error);
        continue;
      }
      loading.then((shapes) => {
        if (disposed || !shapes) return;
        regionLines.set(code, sharedEdges(shapes));
        // one batch for every country's regions that has arrived
        let total = 0;
        for (const one of regionLines.values()) total += one.length;
        const all = new Float32Array(total);
        let at = 0;
        for (const one of regionLines.values()) {
          all.set(one, at);
          at += one.length;
        }
        fill(regions, all);
        stats.regions = total / 6;
        stats.loaded = [...regionLines.keys()];
        invalidate();
      }, fail);
    }
  };

  return {
    sync(view) {
      if (state.countries || state.regions) loadCountries();
      const close = view.radius >= BORDER_REGIONS_RADIUS;
      if (state.regions && close && boxes) {
        const near = boxes;
        loadRegions([...new Set(view.points.flatMap((point) => codesNear(near, point.lon, point.lat, view.angle)))]);
      }
      countries.visible = state.countries && stats.countries > 0;
      regions.visible = state.regions && close && stats.regions > 0;
      stats.shown = { countries: countries.visible, regions: regions.visible };
    },
    dispose() {
      disposed = true;
      for (const lines of [countries, regions]) {
        parent.remove(lines);
        lines.geometry.dispose();
        (lines.material as THREE.Material).dispose();
      }
      regionLines.clear();
      stats.shown = { countries: false, regions: false };
    },
  };
}
