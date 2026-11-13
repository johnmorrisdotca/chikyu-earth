// Finer map tiles laid over the Earth's whole-Earth pictures: only the tiles in view, at the level the zoom needs, fetched a few at a time, kept in a small
// pool and freed when they leave. Nothing here draws: a tile that arrives asks for one draw (batched by the element's gate), and the draw's `sync` puts it on the sphere.
// three.js is passed in; nothing here imports it.
import type * as THREE from "three";
import type { AssetCache } from "@johnmorrisdotca/kazoku-ui/renderer";
import { gridOnEarth, type MapGridLevel } from "../door/grid.ts";
import { DEFAULT_LEVELS, tileKeyParts, tilePlace, type EarthMapSource } from "../door/map.ts";
import { TILE_FRAG, TILE_VERT } from "./shaders.ts";
import type { ThreeParts } from "./textures.ts";
import { MAX_TEXTURE, TIERS } from "./tiers.ts";
import { coveringTile, gridTilesInView, TEXEL_SLACK, tileColumns, tileLevel, tileRect, tileRows, tilesInView, type TileCamera, type TileId, type TileLayer, type VisibleTile } from "./tiles.ts";

/**
 * The most tiles held at once, day and night together, about a megabyte and a third of graphics memory each (a 512 pixel square with its mipmaps).
 *
 * @example
 * ```ts
 * import { TILE_LIMIT } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(TILE_LIMIT);
 * ```
 */
export const TILE_LIMIT = 48;

/**
 * Milliseconds a tile that is no longer wanted is kept (the view may come straight back) before it is freed.
 *
 * @example
 * ```ts
 * import { TILE_KEEP_MS } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(TILE_KEEP_MS);
 * ```
 */
export const TILE_KEEP_MS = 4000;

/**
 * The bytes of decoded tiles the view holds, all sources together: 72 MB, which is the 48 tiles it has always held (`TILE_LIMIT`, a 512 pixel square with its mipmaps is 1.4 MB). A tile that arrives when the view needs every tile it holds,
 * and does not fit, is refused and counted (`stats.refused`): the view draws what it holds.
 *
 * @example
 * ```ts
 * import { TILE_BUDGET } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(TILE_BUDGET / 1024 / 1024);
 * ```
 */
export const TILE_BUDGET = 72 * 1024 * 1024;

const IN_FLIGHT = 6;
const NEW_PER_DRAW = 8;
/** A finer tile fades in over this many milliseconds, then the loop stops. A reader who asked for less motion skips it. */
const FADE_MS = 300;
/** The package's own day pyramid, at level 5. A finer source is not asked until the view wants more than the tiles underneath, and never less than this when those tiles are not loaded yet. */
const OWN_SERVED = 32768;
const RAD = Math.PI / 180;

interface GridJob {
  layer: "day" | "finer";
  id: TileId;
  key: string;
  grid: MapGridLevel;
}
// the day mix reaches full light at 0.22: a tile whose darkest point is brighter than that never shows the night picture
const NIGHT_BELOW = 0.25;
const GRID = 16;

type Three = ThreeParts;
type Uniform<T> = { value: T };

interface Asset {
  texture: THREE.Texture;
  /** The decoded tile's size in memory, once it has arrived. */
  bytes: number;
  ready: Promise<void>;
  release(): void;
  closed: boolean;
}

interface Entry {
  key: string;
  layer: "day" | "night" | "finer";
  id: TileId;
  /** The source the tile was asked of. */
  source: EarthMapSource;
  /** Set when the tile is placed on the source's own grid, not the package's pyramid. */
  gridLevel?: MapGridLevel;
  asset: Asset;
  ready: boolean;
  integrated: boolean;
  lastWanted: number;
  /** When the tile was first put on the sphere, for the fade. */
  born?: number;
  mesh?: THREE.Mesh;
  nightRect?: Uniform<number[]>;
  nightMap?: Uniform<THREE.Texture | null>;
  cover?: Uniform<number>;
}

/** What the tiles share with the surface they are laid over. */
export interface TileShared {
  sunDir: Uniform<THREE.Vector3>;
  lights: Uniform<number>;
  boost: Uniform<number>;
  ortho: Uniform<number>;
  /** The whole-Earth water and night pictures' uniforms: their value is the picture now held. */
  water: Uniform<THREE.Texture | null>;
  night: Uniform<THREE.Texture | null>;
  /** More uniforms the surface program reads (the cloud picture and where the Sun is in the Earth's axes), shared with the sphere's own. */
  extra?: Record<string, Uniform<unknown>>;
}

/**
 * The map source each layer is drawn from now, or none: read at every draw. A layer's tiles come from its source alone, and the night tiles go with day tiles (no day source, no night tiles).
 * `finer` is laid over the day tiles, and only when the view is closer than the day tiles serve. A source with its own `grid` is placed on that grid.
 */
export type TileSources = { day?: EarthMapSource; night?: EarthMapSource; finer?: EarthMapSource };

export interface TileSetDeps {
  assets: AssetCache;
  /** The sources of the layers now (the data door's: a source a page added, else the `tiles` folder). Read at every draw; the objects are the same while nothing changed. */
  sources: () => TileSources;
  /** The bytes of decoded tiles held, all sources together: `TILE_BUDGET` where left out. */
  budgetBytes?: number;
  /** The widest picture this device holds: tiles are only used where the day picture reaches 4096. */
  cap: () => number;
  /** Ask for one draw. */
  invalidate: () => void;
  /** A reader who asked for less motion: a finer tile is shown at once, with no fade. */
  reducedMotion?: () => boolean;
  /** Told once when a tile set's manifest has been read: the finest width of each layer. */
  onManifest?: (layers: Record<string, number>) => void;
  limit?: number;
  now?: () => number;
}

/** What the tile set is doing, for a page or a test. */
export interface TileStats {
  /** A readable manifest is in hand. */
  ready: boolean;
  /** The level now wanted for the day picture, `null` when the pictures of the package are sharp enough. */
  level: number | null;
  /** Tiles held (loading, loaded, on the sphere or not), and those on the sphere in view. */
  held: number;
  shown: number;
  loading: number;
  /** Tiles that could not be fetched and are not asked for again for a while. */
  failed: number;
  /** Tile fetches made. */
  requested: number;
  /** The bytes of decoded tiles held, which never pass the budget except by tiles the view needs now, and tiles that arrived and did not fit, which are not held. */
  heldBytes: number;
  refused: number;
  /** The tiles in view that came from each source, by the source's id: what a credit line counts. */
  used: Record<string, number>;
  /** The level of the finer grid now wanted, or `null` when the view is no closer than the tiles underneath. */
  finer: number | null;
  /** True while a finer tile is still fading in. At rest, after the fade, this is false and nothing is drawn for it. */
  fading: boolean;
}

export interface TileSet {
  sync(camera: TileCamera, sun: readonly [number, number, number], night: boolean, ratio: number): void;
  readonly stats: TileStats;
  dispose(): void;
}

const keyOf = (layer: string, id: TileId): string => `${layer}/${id.level}/${id.col}/${id.row}`;

const tags = new WeakMap<object, number>();
let tagged = 0;
/** A name for a source object, so that two sources with the same id never share a tile in the page's cache. */
const tagOf = (source: object): number => {
  let tag = tags.get(source);
  if (tag === undefined) tags.set(source, (tag = tagged += 1));
  return tag;
};

/** The levels a source says it has, kept to those the pyramid's rule allows: a tile's place on the sphere would be wrong otherwise. */
function cleanLayer(given: unknown): TileLayer | undefined {
  if (typeof given !== "object" || given === null) return undefined;
  const levels: TileLayer["levels"] = [];
  for (const entry of (given as { levels?: unknown }).levels instanceof Array ? ((given as { levels: unknown[] }).levels as { level?: unknown; width?: unknown }[]) : []) {
    if (typeof entry?.level !== "number" || !Number.isInteger(entry.level) || entry.level < 0 || entry.level > 8 || entry.width !== 1024 * 2 ** entry.level) continue;
    levels.push({ level: entry.level, width: entry.width });
  }
  return levels.length > 0 ? { tileSize: 512, levels: levels.sort((a, b) => a.level - b.level) } : undefined;
}

const isTile = (tile: unknown): tile is { image: object; width: number; height: number } => {
  if (typeof tile !== "object" || tile === null) return false;
  const one = tile as { width?: unknown; height?: unknown; image?: unknown };
  return typeof one.width === "number" && one.width > 0 && Number.isFinite(one.width) && typeof one.height === "number" && one.height > 0 && Number.isFinite(one.height) && typeof one.image === "object" && one.image !== null;
};

/** A 0 to 1 grid, the same for every tile: the vertex shader puts it on the sphere. */
function patch(three: Three): THREE.BufferGeometry {
  const positions = new Float32Array((GRID + 1) * (GRID + 1) * 3);
  const uvs = new Float32Array((GRID + 1) * (GRID + 1) * 2);
  let p = 0;
  let q = 0;
  for (let j = 0; j <= GRID; j += 1) {
    for (let i = 0; i <= GRID; i += 1) {
      uvs[q++] = i / GRID;
      uvs[q++] = j / GRID;
      positions[p++] = i / GRID;
      positions[p++] = j / GRID;
      positions[p++] = 0;
    }
  }
  const index: number[] = [];
  for (let j = 0; j < GRID; j += 1) {
    for (let i = 0; i < GRID; i += 1) {
      const a = j * (GRID + 1) + i;
      const b = a + GRID + 1;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new three.BufferGeometry();
  geometry.setAttribute("position", new three.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new three.BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  return geometry;
}

/** Make the set that puts tiles on `parent`, a group that turns with the Earth. */
export function createTileSet(three: Three, parent: THREE.Group, shared: TileShared, deps: TileSetDeps): TileSet {
  const limit = deps.limit ?? TILE_LIMIT;
  const budget = deps.budgetBytes ?? TILE_BUDGET;
  const clock = deps.now ?? (() => performance.now());
  const geometry = patch(three);
  const entries = new Map<string, Entry>();
  const failed = new Map<string, number>();
  let queue: { layer: "day" | "night" | "finer"; id: TileId; key: string; grid?: MapGridLevel }[] = [];
  let wantedKeys = new Set<string>();
  /** Grid tiles in view this frame, by the key the source named. */
  let gridSeen = new Set<string>();
  let finerLevel: number | null = null;
  let fading = false;
  /** The sources the levels were read for. */
  let current: TileSources = {};
  /** Counts the times the sources changed: an answer for an earlier set of them is let go. */
  let generation = 0;
  let refused = 0;
  let manifest: { layers: Record<string, TileLayer> } | null | undefined;
  let manifestFetch: AbortController | undefined;
  let inFlight = 0;
  let requested = 0;
  let wantedLevel: number | null = null;
  let shown = 0;
  /** The tiles in view from each source, by the source's id, as of the last placing. */
  let used = new Map<string, number>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last: { camera: TileCamera } | undefined;
  let disposed = false;
  const baseDay = TIERS.day[TIERS.day.length - 1]!;
  const baseNight = TIERS.night[TIERS.night.length - 1]!;
  const reduced = (): boolean => (deps.reducedMotion ?? (() => typeof globalThis.matchMedia === "function" && globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches))();

  const accountOf = (source: EarthMapSource, key: string): string => `chikyu-earth:tile:${tagOf(source)}:${key}`;

  const take = (layer: "day" | "night" | "finer", id: TileId, source: EarthMapSource, knownKey?: string): Asset =>
    deps.assets.acquire<Asset>(
      accountOf(source, knownKey ?? keyOf(layer === "finer" ? "day" : layer, id)),
      () => {
        const texture = new three.Texture();
        texture.wrapS = three.ClampToEdgeWrapping;
        texture.wrapT = three.ClampToEdgeWrapping;
        texture.minFilter = three.LinearMipmapLinearFilter;
        texture.magFilter = three.LinearFilter;
        texture.anisotropy = 8;
        const controller = new AbortController();
        const made: Asset = { texture, bytes: 0, closed: false, ready: Promise.resolve(), release: () => undefined };
        made.ready = Promise.resolve()
          .then(() => {
            // the source names its tiles: the one for this place is the key of the pyramid's tile that matches
            const key = knownKey ?? source.need({ ...tilePlace(id), layer: layer === "finer" ? "day" : layer }, 1024 * 2 ** id.level).find((one) => {
              const parts = tileKeyParts(one);
              return parts !== undefined && parts.level === id.level && parts.col === id.col && parts.row === id.row;
            });
            if (key === undefined) throw new Error(`${keyOf(layer, id)}: the source "${source.info.id}" names no tile for this place`);
            return source.load(key, controller.signal);
          })
          .then((tile) => {
            if (!isTile(tile)) {
              (tile as { image?: { close?: () => void } } | null | undefined)?.image?.close?.();
              throw new TypeError(`${keyOf(layer, id)}: the source "${source.info.id}" gave something that is not a picture`);
            }
            const bytes = source.bytes(tile);
            if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) {
              (tile.image as { close?: () => void }).close?.();
              throw new TypeError(`${keyOf(layer, id)}: the source "${source.info.id}" gave a tile with a size that is not a number`);
            }
            if (made.closed) (tile.image as { close?: () => void }).close?.();
            else {
              made.bytes = bytes;
              texture.image = tile.image;
              texture.needsUpdate = true;
            }
          });
        made.ready.catch(() => undefined);
        made.release = () => {
          made.closed = true;
          controller.abort();
          texture.dispose();
          (texture.image as { close?: () => void } | null)?.close?.();
        };
        return made;
      },
      (value) => value.release(),
    );

  const drop = (entry: Entry): void => {
    entries.delete(entry.key);
    if (entry.mesh) {
      parent.remove(entry.mesh);
      (entry.mesh.material as THREE.ShaderMaterial).dispose();
    }
    deps.assets.release(accountOf(entry.source, entry.key));
  };

  /** The bytes of the tiles that have arrived and are held. */
  const heldBytes = (): number => {
    let sum = 0;
    for (const entry of entries.values()) if (entry.ready) sum += entry.asset.bytes;
    return sum;
  };

  const reset = (): void => {
    for (const entry of [...entries.values()]) drop(entry);
    queue = [];
    wantedKeys = new Set();
    failed.clear();
    manifestFetch?.abort();
    manifestFetch = undefined;
    manifest = undefined;
    wantedLevel = null;
    shown = 0;
    used = new Map();
    generation += 1;
  };

  /** Asks each layer's source for its levels, once, when the sources change: a source that has no `levels` has `DEFAULT_LEVELS`, and one that cannot say leaves the layer without tiles. */
  const readManifest = (set: TileSources): void => {
    manifest = undefined;
    const controller = new AbortController();
    manifestFetch = controller;
    const turn = generation;
    const ask = async (layer: "day" | "night"): Promise<TileLayer | undefined> => {
      const source = set[layer];
      if (source === undefined) return undefined;
      try {
        return cleanLayer(source.levels === undefined ? DEFAULT_LEVELS : await source.levels(layer, controller.signal));
      } catch {
        return undefined;
      }
    };
    void Promise.all([ask("day"), ask("night")]).then(([day, night]) => {
      if (disposed || generation !== turn || manifestFetch !== controller) return;
      if (day === undefined) {
        manifest = null;
        return;
      }
      const layers: Record<string, TileLayer> = night === undefined ? { day } : { day, night };
      manifest = { layers };
      deps.onManifest?.(Object.fromEntries(Object.entries(layers).map(([name, layer]) => [name, layer.levels[layer.levels.length - 1]!.width])));
      deps.invalidate();
    });
  };

  const pump = (): void => {
    while (inFlight < IN_FLIGHT && queue.length > 0) {
      const next = queue.shift()!;
      const key = next.key;
      if (entries.has(key)) continue;
      const source = next.layer === "finer" ? current.finer : current[next.layer];
      if (source === undefined) continue;
      const entry: Entry = { key, layer: next.layer, id: next.id, source, ...(next.grid ? { gridLevel: next.grid } : {}), asset: take(next.layer, next.id, source, next.grid ? key : undefined), ready: false, integrated: false, lastWanted: clock() };
      entries.set(key, entry);
      inFlight += 1;
      requested += 1;
      const settled = (): void => {
        inFlight -= 1;
        pump();
      };
      entry.asset.ready.then(
        () => {
          if (entries.get(key) === entry) {
            entry.ready = true;
            // a tile that does not fit under the budget even when everything not needed is let go is refused, and counted: the view draws what it holds
            if (heldBytes() > budget) sweep(true);
            if (heldBytes() > budget) {
              refused += 1;
              failed.set(key, clock());
              drop(entry);
            } else deps.invalidate();
          }
          settled();
        },
        () => {
          if (entries.get(key) === entry) {
            failed.set(key, clock());
            drop(entry);
          }
          settled();
        },
      );
    }
  };

  const nightLevels = (): TileLayer | undefined => {
    const layer = manifest?.layers["night"];
    const finer = layer?.levels.filter((entry) => entry.width > baseNight);
    return layer && finer && finer.length > 0 ? { tileSize: layer.tileSize, levels: finer } : undefined;
  };

  /** The night tile that goes with a day tile: the same level, or the finest the night picture has. */
  const nightFor = (tile: TileId, night: TileLayer): TileId => {
    const level = night.levels.filter((entry) => entry.level <= tile.level).reduce((top, entry) => Math.max(top, entry.level), night.levels[0]!.level);
    return coveringTile(tile, level);
  };

  const choose = (camera: TileCamera, sun: readonly [number, number, number], night: boolean, ratio: number): { level: number | null; day: VisibleTile[]; night: TileId[] } => {
    const day = manifest?.layers["day"];
    if (!day || deps.cap() < MAX_TEXTURE) return { level: null, day: [], night: [] };
    const nightLayer = night ? nightLevels() : undefined;
    let level = tileLevel(camera.radius * ratio, day, baseDay);
    while (level !== undefined) {
      const tiles = tilesInView(level, camera, sun);
      const seen = new Set<string>();
      const dark: TileId[] = [];
      if (nightLayer) {
        for (const tile of tiles) {
          if (tile.ndl >= NIGHT_BELOW) continue;
          const id = nightFor(tile, nightLayer);
          const key = keyOf("night", id);
          if (!seen.has(key)) {
            seen.add(key);
            dark.push(id);
          }
        }
      }
      if (tiles.length + dark.length <= limit) return { level, day: tiles, night: dark };
      const lower = day.levels.filter((entry) => entry.width > baseDay && entry.level < level!).pop();
      level = lower?.level;
    }
    return { level: null, day: [], night: [] };
  };

  const gridRect = (entry: Entry): [number, number, number, number] => {
    const grid = entry.source.grid;
    const level = entry.gridLevel;
    if (!grid || !level) return tileRect(entry.id);
    const span = gridOnEarth(level, entry.id.col, entry.id.row, grid.extent) ?? { lonMin: -180, lonMax: 180, latMin: -90, latMax: 90 };
    return [span.lonMin * RAD, span.latMax * RAD, span.lonMax * RAD, span.latMin * RAD];
  };

  const makeMesh = (entry: Entry): void => {
    const nightRect: Uniform<number[]> = { value: [0, 0, 1, 1] };
    const nightMap: Uniform<THREE.Texture | null> = { value: shared.night.value };
    const cover: Uniform<number> = { value: 1 };
    const material = new three.ShaderMaterial({
      vertexShader: TILE_VERT,
      fragmentShader: TILE_FRAG,
      uniforms: {
        dayMap: { value: entry.asset.texture },
        nightMap,
        waterMap: shared.water,
        sunDir: shared.sunDir,
        lights: shared.lights,
        boost: shared.boost,
        ortho: shared.ortho,
        ...shared.extra,
        nightRect,
        tileAlpha: cover,
        rect: { value: gridRect(entry) },
        // a finer level sits a little higher, so two levels at once never fight for the same depth; a grid tile sits above the package's finest. All sit above the whole-Earth sphere's flat faces
        radius: { value: entry.gridLevel ? 1.0008 : 1.0004 + 0.0001 * (entry.id.level - 3) },
      },
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      transparent: false,
      depthWrite: true,
    });
    entry.cover = cover;
    const mesh = new three.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.visible = false;
    parent.add(mesh);
    entry.mesh = mesh;
    entry.nightRect = nightRect;
    entry.nightMap = nightMap;
  };

  /** Each day tile reads the finest night tile it has, else the whole-Earth night picture. */
  const retarget = (): void => {
    const night = nightLevels();
    for (const entry of entries.values()) {
      if (!entry.mesh || !entry.nightMap || !entry.nightRect || entry.gridLevel) continue;
      let texture: THREE.Texture | null = null;
      let rect = [0, 0, 1, 1];
      if (night) {
        for (let level = entry.id.level; level >= night.levels[0]!.level && !texture; level -= 1) {
          if (!night.levels.some((l) => l.level === level)) continue;
          const id = coveringTile(entry.id, level);
          const held = entries.get(keyOf("night", id));
          if (held?.integrated && held.ready) {
            texture = held.asset.texture;
            rect = [id.col / tileColumns(id.level), id.row / tileRows(id.level), 1 / tileColumns(id.level), 1 / tileRows(id.level)];
          }
        }
      }
      entry.nightMap.value = texture ?? shared.night.value;
      entry.nightRect.value = rect;
    }
  };

  const place = (camera: TileCamera, visible: Map<number, Set<number>>): void => {
    shown = 0;
    used = new Map();
    const nightBy = new Map<THREE.Texture, Entry>();
    for (const entry of entries.values()) if (entry.layer === "night" && entry.integrated && entry.ready) nightBy.set(entry.asset.texture, entry);
    for (const entry of entries.values()) {
      if (!entry.mesh) continue;
      if (entry.gridLevel) {
        entry.mesh.visible = gridSeen.has(entry.key);
        if (entry.mesh.visible) {
          shown += 1;
          used.set(entry.source.info.id, (used.get(entry.source.info.id) ?? 0) + 1);
        }
        continue;
      }
      let set = visible.get(entry.id.level);
      if (!set) {
        set = new Set(tilesInView(entry.id.level, camera).map((tile) => tile.row * tileColumns(tile.level) + tile.col));
        visible.set(entry.id.level, set);
      }
      entry.mesh.visible = set.has(entry.id.row * tileColumns(entry.id.level) + entry.id.col);
      if (entry.mesh.visible) {
        shown += 1;
        used.set(entry.source.info.id, (used.get(entry.source.info.id) ?? 0) + 1);
        // a night tile is in view when a day tile in view reads it
        const dark = entry.nightMap?.value ? nightBy.get(entry.nightMap.value) : undefined;
        if (dark) used.set(dark.source.info.id, (used.get(dark.source.info.id) ?? 0) + 1);
      }
    }
  };

  /** Free what is no longer wanted: past its time, or the oldest first when over the limit or the budget (`all`: everything not wanted, for room). True when something on the sphere went. */
  const sweep = (all = false): boolean => {
    const now = clock();
    let changed = false;
    const unwanted = [...entries.values()].filter((entry) => !wantedKeys.has(entry.key)).sort((a, b) => a.lastWanted - b.lastWanted);
    for (const entry of unwanted) {
      if (!all && now - entry.lastWanted < TILE_KEEP_MS && entries.size <= limit && heldBytes() <= budget) continue;
      if (all && heldBytes() <= budget) break;
      if (entry.mesh?.visible || entry.integrated) changed = true;
      drop(entry);
    }
    if (changed) retarget();
    return changed;
  };

  const arm = (): void => {
    if (timer !== undefined || disposed) return;
    const unwanted = [...entries.values()].filter((entry) => !wantedKeys.has(entry.key));
    if (unwanted.length === 0) return;
    const oldest = Math.min(...unwanted.map((entry) => entry.lastWanted));
    timer = setTimeout(
      () => {
        timer = undefined;
        if (sweep()) {
          if (last) place(last.camera, new Map());
          deps.invalidate();
        }
        arm();
      },
      Math.max(50, oldest + TILE_KEEP_MS - clock() + 20),
    );
  };

  return {
    get stats(): TileStats {
      return {
        ready: manifest != null,
        level: wantedLevel,
        held: entries.size,
        shown,
        loading: [...entries.values()].filter((entry) => !entry.ready).length,
        failed: failed.size,
        requested,
        heldBytes: heldBytes(),
        refused,
        used: Object.fromEntries(used),
        finer: finerLevel,
        fading,
      };
    },
    sync(camera, sun, night, ratio) {
      if (disposed) return;
      const now = deps.sources();
      if (now.day !== current.day || now.night !== current.night || now.finer !== current.finer) {
        reset();
        current = { ...(now.day ? { day: now.day } : {}), ...(now.night ? { night: now.night } : {}), ...(now.finer ? { finer: now.finer } : {}) };
        if (current.day !== undefined && !current.day.grid) readManifest(current);
        else if (current.day?.grid) manifest = { layers: {} };
      }
      last = { camera };
      const pyramidReady = current.day !== undefined && !current.day.grid && manifest != null && manifest.layers["day"] !== undefined;
      if (current.day === undefined && current.finer === undefined) return;
      if (current.day !== undefined && !current.day.grid && manifest === undefined && current.finer === undefined) return;
      const at = clock();
      const wanted = pyramidReady ? choose(camera, sun, night, ratio) : { level: null as number | null, day: [] as VisibleTile[], night: [] as TileId[] };
      wantedLevel = wanted.level;
      const needed = (2 * Math.PI * camera.radius * ratio) / TEXEL_SLACK;
      const served = (): number | undefined => {
        if (current.day?.grid) return Math.max(...current.day.grid.levels.map((level) => level.width));
        if (current.day === undefined) return OWN_SERVED;
        if (manifest === undefined) return undefined;
        const widths = manifest?.layers["day"]?.levels.map((level) => level.width) ?? [];
        return widths.length > 0 ? Math.max(...widths) : OWN_SERVED;
      };
      const jobs: GridJob[] = [];
      const addGrid = (source: EarthMapSource, layer: "day" | "finer", minWidth: number, taken: number): number | null => {
        const grid = source.grid;
        if (!grid) return null;
        const levels = grid.levels.filter((level) => level.width > minWidth).sort((a, b) => a.width - b.width);
        if (levels.length === 0 || !(needed > minWidth)) return null;
        let index = levels.findIndex((level) => level.width >= needed);
        if (index < 0) index = levels.length - 1;
        while (index >= 0) {
          const level = levels[index]!;
          const tiles = gridTilesInView(level, grid.extent, camera, sun);
          if (taken + tiles.length <= limit) {
            for (const tile of tiles) {
              const place = gridOnEarth(level, tile.col, tile.row, grid.extent);
              if (!place) continue;
              const inset = {
                lonMin: place.lonMin + (place.lonMax - place.lonMin) * 0.25,
                lonMax: place.lonMax - (place.lonMax - place.lonMin) * 0.25,
                latMin: place.latMin + (place.latMax - place.latMin) * 0.25,
                latMax: place.latMax - (place.latMax - place.latMin) * 0.25,
                layer: "day" as const,
              };
              const key = source.need(inset, level.width).find((one) => {
                const parts = tileKeyParts(one);
                return parts !== undefined && parts.level === tile.level && parts.col === tile.col && parts.row === tile.row;
              });
              if (key) jobs.push({ layer, id: { level: tile.level, col: tile.col, row: tile.row }, key, grid: level });
            }
            return level.level;
          }
          index -= 1;
        }
        return null;
      };
      finerLevel = null;
      if (current.day?.grid) wantedLevel = addGrid(current.day, "day", baseDay, 0);
      const floor = served();
      if (current.finer?.grid && floor !== undefined) finerLevel = addGrid(current.finer, "finer", floor, wanted.day.length + wanted.night.length + jobs.length);
      gridSeen = new Set(jobs.map((job) => job.key));
      wantedKeys = new Set([...wanted.day.map((tile) => keyOf("day", tile)), ...wanted.night.map((id) => keyOf("night", id)), ...jobs.map((job) => job.key)]);
      // a tile that failed is asked for again only after it has left the view and come back (the view changed), never on a timer and never while it stays in view: at rest the door sends nothing
      for (const key of [...failed.keys()]) if (!wantedKeys.has(key)) failed.delete(key);
      for (const key of wantedKeys) {
        const entry = entries.get(key);
        if (entry) entry.lastWanted = at;
      }
      queue = [
        ...wanted.day.map((tile) => ({ layer: "day" as const, id: { level: tile.level, col: tile.col, row: tile.row }, key: keyOf("day", tile) })),
        ...wanted.night.map((id) => ({ layer: "night" as const, id, key: keyOf("night", id) })),
        ...jobs.map((job) => ({ layer: job.layer, id: job.id, key: job.key, grid: job.grid })),
      ].filter((item) => !failed.has(item.key) && !entries.has(item.key));
      pump();

      let fresh = 0;
      let waiting = false;
      for (const entry of entries.values()) {
        if (entry.integrated || !entry.ready || !wantedKeys.has(entry.key)) continue;
        if (fresh >= NEW_PER_DRAW) {
          waiting = true;
          continue;
        }
        fresh += 1;
        entry.integrated = true;
        if (entry.layer === "day" || entry.layer === "finer") makeMesh(entry);
        if (entry.gridLevel && entry.cover) {
          entry.born = at;
          const full = reduced();
          entry.cover.value = full ? 1 : 0;
          const material = entry.mesh?.material as { transparent?: boolean; depthWrite?: boolean } | undefined;
          if (material && !full) {
            material.transparent = true;
            material.depthWrite = false;
          }
        }
      }
      sweep();
      retarget();
      const visible = new Map<number, Set<number>>();
      if (wanted.level !== null) visible.set(wanted.level, new Set(wanted.day.map((tile) => tile.row * tileColumns(tile.level) + tile.col)));
      place(camera, visible);
      fading = false;
      for (const entry of entries.values()) {
        if (!entry.gridLevel || !entry.cover || !entry.integrated) continue;
        const t = reduced() ? 1 : Math.min(1, (clock() - (entry.born ?? at)) / FADE_MS);
        entry.cover.value = t;
        const material = entry.mesh?.material as { transparent?: boolean; depthWrite?: boolean } | undefined;
        if (material) {
          material.transparent = t < 1;
          material.depthWrite = t >= 1;
        }
        if (t < 1) fading = true;
      }
      if (waiting || fading) deps.invalidate();
      arm();
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      timer = undefined;
      reset();
      current = {};
      geometry.dispose();
    },
  };
}
