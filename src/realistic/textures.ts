// The pictures on the GPU: one texture a layer, small first, a larger one fetched when the zoom needs it and the smaller one let go, then the larger one freed
// a few seconds after the zoom drops. Shared by the Earth and the space view. three.js is passed in; nothing here imports it.
import type * as THREE from "three";
import type { AssetCache } from "@johnmorrisdotca/kazoku-ui/renderer";
import { chooseTier, TIERS, type Layer } from "./tiers.ts";

/**
 * The parts of three.js the Earth and the space view use. A page can hand over a module that re-exports just these (see `setThreeLoader`) instead of all of three.
 *
 * @example
 * ```ts no-run
 * import type { ThreeParts } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const load = (): Promise<ThreeParts> => import("three");
 * console.log(typeof load);
 * ```
 */
export type ThreeParts = Pick<
  typeof THREE,
  | "Texture" | "BufferGeometry" | "BufferAttribute" | "ShaderMaterial" | "Group" | "Mesh" | "Scene" | "OrthographicCamera" | "PerspectiveCamera" | "Vector3" | "WebGLRenderer"
  | "RepeatWrapping" | "ClampToEdgeWrapping" | "LinearMipmapLinearFilter" | "LinearFilter" | "BackSide" | "DoubleSide" | "LineLoop" | "LineBasicMaterial" | "Color"
>;

/** Milliseconds a lower texture size must be enough before the larger one is let go. */
export const DOWNGRADE_AFTER_MS = 4000;

interface TextureEntry {
  width: number;
  texture: THREE.Texture;
  ready: Promise<void>;
  release(): void;
  closed: boolean;
}

interface Slot {
  layer: Layer;
  uniform: { value: THREE.Texture | null };
  base: TextureEntry;
  baseWidth: number;
  entry: TextureEntry;
  width: number;
  loading: number | undefined;
  timer: ReturnType<typeof setTimeout> | undefined;
}

export interface TextureDeps {
  assets: AssetCache;
  /** Ends with a slash. */
  textureBase: () => string;
  /** The widest texture, 4096 at most. */
  cap: () => number;
  invalidate: () => void;
  onError?: (error: unknown) => void;
  onTier?: (layer: Layer, width: number) => void;
}

export interface TextureSet {
  /** The `{ value }` a shader uniform takes, one a layer; the value is the texture now in use. */
  readonly uniforms: Record<string, { value: THREE.Texture | null }>;
  /** Hold the width each layer needs for a disc of this many device pixels across the radius (`radiusPx[layer]`, or one number for all). */
  sync(radiusPx: number | Partial<Record<Layer, number>>): void;
  dispose(): void;
}

/** Load the base picture of each layer, then hand back the set. Rejects (after freeing what it took) if one will not load. */
export async function createTextureSet(three: ThreeParts, layers: readonly Layer[], deps: TextureDeps): Promise<TextureSet> {
  let disposed = false;
  const held: string[] = [];
  const keyOf = (layer: Layer, texels: number): string => `chikyu-earth:${layer}:${texels}`;

  const take = (layer: Layer, texels: number): TextureEntry => {
    const key = keyOf(layer, texels);
    const entry = deps.assets.acquire<TextureEntry>(
      key,
      () => {
        const texture = new three.Texture();
        texture.wrapS = three.RepeatWrapping;
        texture.wrapT = three.ClampToEdgeWrapping;
        texture.minFilter = three.LinearMipmapLinearFilter;
        texture.magFilter = three.LinearFilter;
        texture.anisotropy = 8;
        const controller = new AbortController();
        const made: TextureEntry = { width: texels, texture, closed: false, ready: Promise.resolve(), release: () => undefined };
        made.ready = fetch(`${deps.textureBase()}${layer}-${texels}.webp`, { signal: controller.signal })
          .then((response) => {
            if (!response.ok) throw new Error(`${layer}-${texels}.webp: ${response.status}`);
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
    held.push(key);
    return entry;
  };
  const letGo = (layer: Layer, texels: number): void => {
    const key = keyOf(layer, texels);
    const at = held.indexOf(key);
    if (at >= 0) held.splice(at, 1);
    deps.assets.release(key);
  };

  const slots = new Map<Layer, Slot>();
  for (const layer of layers) {
    const baseWidth = TIERS[layer][0]!;
    const base = take(layer, baseWidth);
    slots.set(layer, { layer, uniform: { value: null }, base, baseWidth, entry: base, width: baseWidth, loading: undefined, timer: undefined });
  }
  try {
    await Promise.all([...slots.values()].map((slot) => slot.base.ready));
  } catch (error) {
    for (const slot of slots.values()) letGo(slot.layer, slot.baseWidth);
    deps.onError?.(error);
    throw error;
  }
  for (const slot of slots.values()) slot.uniform.value = slot.base.texture;

  const swap = (slot: Slot, entry: TextureEntry, texels: number): void => {
    const previous = slot.entry;
    slot.entry = entry;
    slot.width = texels;
    slot.uniform.value = entry.texture;
    if (previous !== slot.base) letGo(slot.layer, previous.width);
    deps.onTier?.(slot.layer, texels);
  };

  const moveTo = (slot: Slot, texels: number): void => {
    if (disposed || texels === slot.width || slot.loading === texels) return;
    if (texels === slot.baseWidth) {
      swap(slot, slot.base, texels);
      deps.invalidate();
      return;
    }
    slot.loading = texels;
    const entry = take(slot.layer, texels);
    entry.ready.then(
      () => {
        if (disposed || slot.loading !== texels) {
          letGo(slot.layer, texels);
          return;
        }
        slot.loading = undefined;
        swap(slot, entry, texels);
        deps.invalidate();
      },
      (error: unknown) => {
        letGo(slot.layer, texels);
        if (slot.loading === texels) slot.loading = undefined;
        deps.onError?.(error);
      },
    );
  };

  let lastRadius: number | Partial<Record<Layer, number>> = 0;
  const wantedFor = (slot: Slot, radius: number | Partial<Record<Layer, number>>): number => {
    const px = typeof radius === "number" ? radius : (radius[slot.layer] ?? 0);
    return chooseTier(slot.layer, px, deps.cap());
  };

  return {
    uniforms: Object.fromEntries([...slots].map(([layer, slot]) => [layer, slot.uniform])),
    sync(radiusPx) {
      lastRadius = radiusPx;
      for (const slot of slots.values()) {
        const wanted = wantedFor(slot, radiusPx);
        if (slot.timer !== undefined && wanted >= slot.width) {
          clearTimeout(slot.timer);
          slot.timer = undefined;
        }
        if (wanted > slot.width) moveTo(slot, wanted);
        else if (wanted < slot.width && slot.timer === undefined) {
          slot.timer = setTimeout(() => {
            slot.timer = undefined;
            const now = wantedFor(slot, lastRadius);
            if (now < slot.width) moveTo(slot, now);
          }, DOWNGRADE_AFTER_MS);
        }
      }
    },
    dispose() {
      disposed = true;
      for (const slot of slots.values()) if (slot.timer !== undefined) clearTimeout(slot.timer);
      for (const key of held.splice(0)) deps.assets.release(key);
    },
  };
}
