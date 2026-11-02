// The realistic Earth as a scene for kazoku-ui's shared renderer: a sphere with a day, a night and a water picture, a cloud
// layer, and an atmosphere's glow, lit by the Sun where it really stands. It draws only when asked (`invalidate`), and holds only
// the texture sizes the zoom needs. three.js is the page's own: this file takes it as an argument and never imports it.
import type * as THREE from "three";
import type { AssetCache, BuildContext, Item3D, Scene3D } from "@johnmorrisdotca/kazoku-ui/renderer";
import type { GeoPoint, GlobeView } from "../types.ts";
import { HOME_VIEW, lookAt } from "../view.ts";
import { ATMOSPHERE_FRAG, ATMOSPHERE_VERT, CLOUD_FRAG, SURFACE_FRAG, SURFACE_VERT } from "./shaders.ts";
import { subsolarPoint, unitVector } from "./sun.ts";
import { chooseTier, TIERS, type Layer } from "./tiers.ts";

/**
 * The parts of three.js the Earth uses. A page can hand over a module that re-exports just these (see `setThreeLoader`) instead of all of three.
 *
 * @example
 * ```ts no-run
 * import type { ThreeParts } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const load = (): Promise<ThreeParts> => import("three");
 * console.log(typeof load);
 * ```
 */
export type ThreeParts = {
  [Name in
    | "Texture" | "BufferGeometry" | "BufferAttribute" | "ShaderMaterial" | "Group" | "Mesh" | "Scene" | "OrthographicCamera" | "Vector3" | "WebGLRenderer"
    | "RepeatWrapping" | "ClampToEdgeWrapping" | "LinearMipmapLinearFilter" | "LinearFilter" | "BackSide"]: (typeof THREE)[Name];
};
type Three = ThreeParts;
const RAD = Math.PI / 180;
/**
 * The glow reaches this many radii from the centre; the globe at 1x is drawn to fit inside it.
 *
 * @example
 * ```ts
 * import { ATMOSPHERE_OUTER } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(ATMOSPHERE_OUTER);
 * ```
 */
export const ATMOSPHERE_OUTER = 1.08;
const CLOUD_RADIUS = 1.006;
const LAYERS: Layer[] = ["day", "night", "clouds", "water"];
/** Milliseconds a lower texture size must be enough before the larger one is let go. */
const DOWNGRADE_AFTER_MS = 4000;

/** What the scene reads at each draw; the element changes it and asks for a draw. */
export interface EarthModel {
  /** The home centre; the shared controls' yaw and tilt are added to it as in the flat globe. */
  centre: GeoPoint;
  view: GlobeView;
  /** The moment shown, in milliseconds since the epoch: it fixes where the Sun is and how far the clouds have drifted. */
  time: number;
  clouds: boolean;
  lights: boolean;
  /** Where the camera looked at the last draw (the element decides from it whether a new draw is worth it). */
  drawn: { view: GlobeView; time: number; radius: number; centre: GeoPoint } | null;
  /** The pixel ratio the textures are chosen for. */
  ratio(): number;
}

export interface EarthDeps {
  assets: AssetCache;
  /** Ends with a slash. */
  textureBase: () => string;
  /** The widest texture, 4096 at most. */
  cap: () => number;
  /** Clouds' eastward drift against the ground, degrees an hour. */
  drift: number;
  invalidate: () => void;
  onError?: (error: unknown) => void;
  onTier?: (layer: Layer, width: number) => void;
  /** Told at every draw where the disc is, for what is laid over it (markers). */
  onPose?: (pose: { lon: number; lat: number; radius: number; cx: number; cy: number; width: number; height: number }) => void;
}

export const newModel = (): EarthModel => ({
  centre: { lon: 0, lat: 0 },
  view: { ...HOME_VIEW },
  time: Date.now(),
  clouds: true,
  lights: true,
  drawn: null,
  ratio: () => Math.min(globalThis.devicePixelRatio || 1, 2),
});

/**
 * The disc's radius in CSS pixels in a box of `width` x `height` at `zoom`: it fits the glow in the box at 1x.
 *
 * @param width - The box's width in CSS pixels.
 * @param height - The box's height in CSS pixels.
 * @param zoom - The view's zoom, 1 at Fit.
 * @returns The radius in CSS pixels, at least 1.
 *
 * @example
 * ```ts
 * import { discRadius } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(discRadius(400, 400, 1).toFixed(1));
 * ```
 */
export const discRadius = (width: number, height: number, zoom: number): number => Math.max(1, (Math.min(width, height) / 2 / ATMOSPHERE_OUTER - 1) * zoom);

export { lookAt };

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

/** An equirectangular sphere: +z is longitude 0 on the equator, +x east, +y north; v is 0 at the north pole (the top row of the picture). */
function sphere(three: Three, columns: number, rows: number): THREE.BufferGeometry {
  const positions = new Float32Array((columns + 1) * (rows + 1) * 3);
  const uvs = new Float32Array((columns + 1) * (rows + 1) * 2);
  let p = 0;
  let q = 0;
  for (let j = 0; j <= rows; j += 1) {
    const lat = (0.5 - j / rows) * Math.PI;
    for (let i = 0; i <= columns; i += 1) {
      const lon = (i / columns - 0.5) * 2 * Math.PI;
      positions[p++] = Math.cos(lat) * Math.sin(lon);
      positions[p++] = Math.sin(lat);
      positions[p++] = Math.cos(lat) * Math.cos(lon);
      uvs[q++] = i / columns;
      uvs[q++] = j / rows;
    }
  }
  const index: number[] = [];
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < columns; i += 1) {
      const a = j * (columns + 1) + i;
      const b = a + columns + 1;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new three.BufferGeometry();
  geometry.setAttribute("position", new three.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new three.BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  return geometry;
}

export function createEarthItem(model: EarthModel, deps: EarthDeps): Item3D<Three> {
  return {
    key: "chikyu-earth:realistic",
    async build({ three, width, height }: BuildContext<Three>): Promise<Scene3D> {
      let size = { width, height };
      let disposed = false;
      const held: string[] = [];

      const makeTexture = (layer: Layer, texels: number): TextureEntry => {
        const key = `chikyu-earth:${layer}:${texels}`;
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
        const key = `chikyu-earth:${layer}:${texels}`;
        const at = held.indexOf(key);
        if (at >= 0) held.splice(at, 1);
        deps.assets.release(key);
      };

      const slots = new Map<Layer, Slot>();
      for (const layer of LAYERS) {
        const baseWidth = TIERS[layer][0]!;
        const base = makeTexture(layer, baseWidth);
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

      const sunDir = { value: new three.Vector3(1, 0, 0) };
      const grid = sphere(three, 128, 64);
      const surface = new three.ShaderMaterial({
        vertexShader: SURFACE_VERT,
        fragmentShader: SURFACE_FRAG,
        uniforms: { dayMap: slots.get("day")!.uniform, nightMap: slots.get("night")!.uniform, waterMap: slots.get("water")!.uniform, sunDir, lights: { value: 1 } },
      });
      const cloudShift = { value: 0 };
      const cloudMaterial = new three.ShaderMaterial({
        vertexShader: SURFACE_VERT,
        fragmentShader: CLOUD_FRAG,
        uniforms: { cloudMap: slots.get("clouds")!.uniform, sunDir, shift: cloudShift, opacity: { value: 0.9 } },
        transparent: true,
        depthWrite: false,
      });
      const atmosphere = new three.ShaderMaterial({
        vertexShader: ATMOSPHERE_VERT,
        fragmentShader: ATMOSPHERE_FRAG,
        uniforms: { sunDir, outer: { value: ATMOSPHERE_OUTER } },
        transparent: true,
        depthWrite: false,
        side: three.BackSide,
      });

      const turned = new three.Group();
      const earth = new three.Mesh(grid, surface);
      const clouds = new three.Mesh(grid, cloudMaterial);
      clouds.scale.setScalar(CLOUD_RADIUS);
      clouds.renderOrder = 2;
      turned.add(earth, clouds);
      const glow = new three.Mesh(grid, atmosphere);
      glow.scale.setScalar(ATMOSPHERE_OUTER);
      glow.renderOrder = 1;
      glow.frustumCulled = false;
      const scene = new three.Scene();
      scene.add(turned, glow);
      const camera = new three.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
      camera.position.set(0, 0, 5);

      const setUniformTexture = (slot: Slot, entry: TextureEntry, texels: number): void => {
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
          setUniformTexture(slot, slot.base, texels);
          deps.invalidate();
          return;
        }
        slot.loading = texels;
        const entry = makeTexture(slot.layer, texels);
        entry.ready.then(
          () => {
            if (disposed || slot.loading !== texels) {
              letGo(slot.layer, texels);
              return;
            }
            slot.loading = undefined;
            setUniformTexture(slot, entry, texels);
            deps.invalidate();
          },
          (error: unknown) => {
            letGo(slot.layer, texels);
            if (slot.loading === texels) slot.loading = undefined;
            deps.onError?.(error);
          },
        );
      };

      const syncTiers = (radiusCssPx: number): void => {
        const radius = radiusCssPx * model.ratio();
        for (const slot of slots.values()) {
          const wanted = chooseTier(slot.layer, radius, deps.cap());
          if (slot.timer !== undefined && wanted >= slot.width) {
            clearTimeout(slot.timer);
            slot.timer = undefined;
          }
          if (wanted > slot.width) moveTo(slot, wanted);
          else if (wanted < slot.width && slot.timer === undefined) {
            slot.timer = setTimeout(() => {
              slot.timer = undefined;
              const now = chooseTier(slot.layer, discRadius(size.width, size.height, model.view.zoom) * model.ratio(), deps.cap());
              if (now < slot.width) moveTo(slot, now);
            }, DOWNGRADE_AFTER_MS);
          }
        }
      };

      return {
        scene,
        camera,
        update() {
          const view = model.view;
          const look = lookAt(model.centre, view);
          turned.rotation.set(look.lat * RAD, -look.lon * RAD, 0, "XYZ");
          const [sx, sy, sz] = unitVector(subsolarPoint(model.time));
          sunDir.value.set(sx, sy, sz).applyEuler(turned.rotation);
          cloudShift.value = -(((model.time / 3_600_000) * deps.drift) % 360) / 360;
          clouds.visible = model.clouds;
          surface.uniforms["lights"]!.value = model.lights ? 1 : 0;
          const radius = discRadius(size.width, size.height, view.zoom);
          camera.left = (-size.width / 2 - view.panX) / radius;
          camera.right = (size.width / 2 - view.panX) / radius;
          camera.top = (size.height / 2 + view.panY) / radius;
          camera.bottom = (-size.height / 2 + view.panY) / radius;
          camera.updateProjectionMatrix();
          model.drawn = { view: { ...view }, time: model.time, radius, centre: { ...model.centre } };
          syncTiers(radius);
          deps.onPose?.({ lon: look.lon, lat: look.lat, radius, cx: size.width / 2 + view.panX, cy: size.height / 2 + view.panY, width: size.width, height: size.height });
          return false;
        },
        resize(next, nextHeight) {
          size = { width: next, height: nextHeight };
        },
        dispose() {
          disposed = true;
          for (const slot of slots.values()) if (slot.timer !== undefined) clearTimeout(slot.timer);
          for (const key of held.splice(0)) deps.assets.release(key);
          grid.dispose();
          surface.dispose();
          cloudMaterial.dispose();
          atmosphere.dispose();
        },
      };
    },
  };
}
