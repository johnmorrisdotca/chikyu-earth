// Finer map tiles laid over the Earth's whole-Earth pictures: only the tiles in view, at the level the zoom needs, fetched a few at a time, kept in a small
// pool and freed when they leave. Nothing here draws: a tile that arrives asks for one draw (batched by the element's gate), and the draw's `sync` puts it on the sphere.
// three.js is passed in; nothing here imports it.
import type * as THREE from "three";
import type { AssetCache } from "@johnmorrisdotca/kazoku-ui/renderer";
import { TILE_FRAG, TILE_VERT } from "./shaders.ts";
import type { ThreeParts } from "./textures.ts";
import { MAX_TEXTURE, TIERS } from "./tiers.ts";
import { coveringTile, parseManifest, tileColumns, tileLevel, tileRect, tileRows, tilesInView, type TileCamera, type TileId, type TileLayer, type VisibleTile } from "./tiles.ts";

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

const IN_FLIGHT = 6;
const NEW_PER_DRAW = 8;
const RETRY_MS = 30_000;
// the day mix reaches full light at 0.22: a tile whose darkest point is brighter than that never shows the night picture
const NIGHT_BELOW = 0.25;
const GRID = 16;

type Three = ThreeParts;
type Uniform<T> = { value: T };

interface Asset {
  texture: THREE.Texture;
  ready: Promise<void>;
  release(): void;
  closed: boolean;
}

interface Entry {
  key: string;
  layer: "day" | "night";
  id: TileId;
  asset: Asset;
  ready: boolean;
  integrated: boolean;
  lastWanted: number;
  mesh?: THREE.Mesh;
  nightRect?: Uniform<number[]>;
  nightMap?: Uniform<THREE.Texture | null>;
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

export interface TileSetDeps {
  assets: AssetCache;
  /** Where the tile set is, ending with a slash, or `undefined` for none. Read at every draw. */
  base: () => string | undefined;
  /** The widest picture this device holds: tiles are only used where the day picture reaches 4096. */
  cap: () => number;
  /** Ask for one draw. */
  invalidate: () => void;
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
}

export interface TileSet {
  sync(camera: TileCamera, sun: readonly [number, number, number], night: boolean, ratio: number): void;
  readonly stats: TileStats;
  dispose(): void;
}

const keyOf = (layer: string, id: TileId): string => `${layer}/${id.level}/${id.col}/${id.row}`;

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
  const clock = deps.now ?? (() => performance.now());
  const geometry = patch(three);
  const entries = new Map<string, Entry>();
  const failed = new Map<string, number>();
  let queue: { layer: "day" | "night"; id: TileId }[] = [];
  let wantedKeys = new Set<string>();
  let current: string | undefined;
  let manifest: { layers: Record<string, TileLayer> } | null | undefined;
  let manifestFetch: AbortController | undefined;
  let inFlight = 0;
  let requested = 0;
  let wantedLevel: number | null = null;
  let shown = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last: { camera: TileCamera } | undefined;
  let disposed = false;
  const baseDay = TIERS.day[TIERS.day.length - 1]!;
  const baseNight = TIERS.night[TIERS.night.length - 1]!;

  const take = (layer: "day" | "night", id: TileId, base: string): Asset =>
    deps.assets.acquire<Asset>(
      `chikyu-earth:tile:${base}${keyOf(layer, id)}`,
      () => {
        const texture = new three.Texture();
        texture.wrapS = three.ClampToEdgeWrapping;
        texture.wrapT = three.ClampToEdgeWrapping;
        texture.minFilter = three.LinearMipmapLinearFilter;
        texture.magFilter = three.LinearFilter;
        texture.anisotropy = 8;
        const controller = new AbortController();
        const made: Asset = { texture, closed: false, ready: Promise.resolve(), release: () => undefined };
        made.ready = fetch(`${base}${keyOf(layer, id)}.webp`, { signal: controller.signal })
          .then((response) => {
            if (!response.ok) throw new Error(`${keyOf(layer, id)}: ${response.status}`);
            return response.blob();
          })
          .then((blob) => createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" }))
          .then((bitmap) => {
            if (made.closed) bitmap.close();
            else {
              texture.image = bitmap;
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
    if (current !== undefined) deps.assets.release(`chikyu-earth:tile:${current}${entry.key}`);
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
  };

  const readManifest = (base: string): void => {
    manifest = undefined;
    const controller = new AbortController();
    manifestFetch = controller;
    fetch(`${base}manifest.json`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : undefined))
      .then(
        (json: unknown) => {
          if (disposed || current !== base || manifestFetch !== controller) return;
          const read = parseManifest(json);
          manifest = read ?? null;
          if (read) {
            deps.onManifest?.(Object.fromEntries(Object.entries(read.layers).map(([name, layer]) => [name, layer.levels[layer.levels.length - 1]!.width])));
            deps.invalidate();
          }
        },
        () => {
          if (!disposed && current === base && manifestFetch === controller) manifest = null;
        },
      );
  };

  const pump = (): void => {
    const base = current;
    if (base === undefined) return;
    while (inFlight < IN_FLIGHT && queue.length > 0) {
      const next = queue.shift()!;
      const key = keyOf(next.layer, next.id);
      if (entries.has(key)) continue;
      const entry: Entry = { key, layer: next.layer, id: next.id, asset: take(next.layer, next.id, base), ready: false, integrated: false, lastWanted: clock() };
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
            deps.invalidate();
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

  const makeMesh = (entry: Entry): void => {
    const nightRect: Uniform<number[]> = { value: [0, 0, 1, 1] };
    const nightMap: Uniform<THREE.Texture | null> = { value: shared.night.value };
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
        rect: { value: tileRect(entry.id) },
        // a finer level sits a little higher, so two levels at once never fight for the same depth; all sit above the whole-Earth sphere's flat faces
        radius: { value: 1.0004 + 0.0001 * (entry.id.level - 3) },
      },
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
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
      if (!entry.mesh || !entry.nightMap || !entry.nightRect) continue;
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
    for (const entry of entries.values()) {
      if (!entry.mesh) continue;
      let set = visible.get(entry.id.level);
      if (!set) {
        set = new Set(tilesInView(entry.id.level, camera).map((tile) => tile.row * tileColumns(tile.level) + tile.col));
        visible.set(entry.id.level, set);
      }
      entry.mesh.visible = set.has(entry.id.row * tileColumns(entry.id.level) + entry.id.col);
      if (entry.mesh.visible) shown += 1;
    }
  };

  /** Free what is no longer wanted: past its time, or the oldest first when over the limit. True when something on the sphere went. */
  const sweep = (): boolean => {
    const now = clock();
    let changed = false;
    const unwanted = [...entries.values()].filter((entry) => !wantedKeys.has(entry.key)).sort((a, b) => a.lastWanted - b.lastWanted);
    for (const entry of unwanted) {
      if (now - entry.lastWanted < TILE_KEEP_MS && entries.size <= limit) continue;
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
      };
    },
    sync(camera, sun, night, ratio) {
      if (disposed) return;
      const base = deps.base();
      if (base !== current) {
        reset();
        current = base;
        if (base !== undefined) readManifest(base);
      }
      last = { camera };
      if (current === undefined || !manifest) return;
      const now = clock();
      const wanted = choose(camera, sun, night, ratio);
      wantedLevel = wanted.level;
      wantedKeys = new Set([...wanted.day.map((tile) => keyOf("day", tile)), ...wanted.night.map((id) => keyOf("night", id))]);
      for (const [key, when] of failed) if (now - when >= RETRY_MS) failed.delete(key);
      for (const key of wantedKeys) {
        const entry = entries.get(key);
        if (entry) entry.lastWanted = now;
      }
      queue = [...wanted.day.map((tile) => ({ layer: "day" as const, id: { level: tile.level, col: tile.col, row: tile.row } })), ...wanted.night.map((id) => ({ layer: "night" as const, id }))].filter(
        (item) => !failed.has(keyOf(item.layer, item.id)) && !entries.has(keyOf(item.layer, item.id)),
      );
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
        if (entry.layer === "day") makeMesh(entry);
      }
      sweep();
      retarget();
      const visible = new Map<number, Set<number>>();
      if (wanted.level !== null) visible.set(wanted.level, new Set(wanted.day.map((tile) => tile.row * tileColumns(tile.level) + tile.col)));
      place(camera, visible);
      if (waiting) deps.invalidate();
      arm();
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      timer = undefined;
      reset();
      current = undefined;
      geometry.dispose();
    },
  };
}
