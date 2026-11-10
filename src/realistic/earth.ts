// The realistic Earth as a scene for kazoku-ui's shared renderer: a sphere with a day, a night and a water picture, a cloud
// layer, and an atmosphere's glow, lit by the Sun where it really stands. It draws only when asked (`invalidate`), and holds only
// the texture sizes the zoom needs. three.js is the page's own: this file takes it as an argument and never imports it.
import type * as THREE from "three";
import type { AssetCache, BuildContext, Item3D, Scene3D } from "@johnmorrisdotca/kazoku-ui/renderer";
import type { GeoPoint, GlobeView } from "../types.ts";
import { HOME_VIEW, lookAt } from "../view.ts";
import { ATMOSPHERE_FRAG, ATMOSPHERE_VERT, CLOUD_FRAG, SURFACE_FRAG, SURFACE_VERT } from "./shaders.ts";
import { subsolarPoint, unitVector } from "./sun.ts";
import type { Layer } from "./tiers.ts";
import { createTextureSet, type ThreeParts } from "./textures.ts";
import { createTileSet, type TileSet } from "./tile-set.ts";
import { createMeteorLayer, newMeteorState, type MeteorLayer, type MeteorState } from "../meteors/layer.ts";
export type { ThreeParts };

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

/** What the scene reads at each draw; the element changes it and asks for a draw. */
/**
 * How the Earth is lit: `sun` (the true light, with the night side dark and the city lights on it), `lit` (always lit, as if by daylight from the camera's side, the day picture and no city lights: the night side is never a black frame)
 * or `boost` (the true terminator, with the night side raised so the land and coasts read).
 *
 * @example
 * ```ts
 * import type { LightMode } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const modes: LightMode[] = ["sun", "lit", "boost"];
 * console.log(modes.join(", "));
 * ```
 */
export type LightMode = "sun" | "lit" | "boost";

export interface EarthModel {
  /** The home centre; the shared controls' yaw and tilt are added to it as in the flat globe. */
  centre: GeoPoint;
  view: GlobeView;
  /** The moment shown, in milliseconds since the epoch: it fixes where the Sun is and how far the clouds have drifted. */
  time: number;
  clouds: boolean;
  lights: boolean;
  /** How the Earth is lit (see `LightMode`). */
  light: LightMode;
  /** Where the camera looked at the last draw (the element decides from it whether a new draw is worth it). */
  drawn: { view: GlobeView; time: number; radius: number; centre: GeoPoint } | null;
  /** The map tiles laid over the pictures while the scene is built: what they are doing, for a page or a test. */
  tiles: TileSet | null;
  /** The pixel ratio the textures are chosen for. */
  ratio(): number;
  /** Meteors seen from space (src/meteors/layer.ts): off unless the element switches them on. */
  meteors: MeteorState;
}

export interface EarthDeps {
  assets: AssetCache;
  /** Ends with a slash. */
  textureBase: () => string;
  /** The widest texture, 4096 at most. */
  cap: () => number;
  /** Where the finer map tiles are (a URL ending with a slash), or `undefined`: the Earth then keeps the package's own pictures. */
  tiles?: () => string | undefined;
  /** Told once when the tile set has been read: the width in pixels of the finest level of each of its layers. */
  onTiles?: (layers: Record<string, number>) => void;
  /** Clouds' eastward drift against the ground, degrees an hour. */
  drift: number;
  invalidate: () => void;
  onError?: (error: unknown) => void;
  onTier?: (layer: Layer, width: number) => void;
  /** Told at the start of every draw, before anything is read for it. */
  onDraw?: () => void;
  /** Told at every draw where the disc is, for what is laid over it (markers). */
  onPose?: (pose: { lon: number; lat: number; radius: number; cx: number; cy: number; width: number; height: number }) => void;
}

export const newModel = (): EarthModel => ({
  centre: { lon: 0, lat: 0 },
  view: { ...HOME_VIEW },
  time: Date.now(),
  clouds: true,
  lights: true,
  light: "sun",
  drawn: null,
  tiles: null,
  ratio: () => Math.min(globalThis.devicePixelRatio || 1, 2),
  meteors: newMeteorState(),
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

/** An equirectangular sphere: +z is longitude 0 on the equator, +x east, +y north; v is 0 at the north pole (the top row of the picture). */
export function sphere(three: Three, columns: number, rows: number): THREE.BufferGeometry {
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
      const textures = await createTextureSet(three, LAYERS, {
        assets: deps.assets,
        textureBase: deps.textureBase,
        cap: deps.cap,
        invalidate: deps.invalidate,
        ...(deps.onError ? { onError: deps.onError } : {}),
        ...(deps.onTier ? { onTier: deps.onTier } : {}),
      });
      const uniform = textures.uniforms as Record<Layer, { value: THREE.Texture | null }>;

      const sunDir = { value: new three.Vector3(1, 0, 0) };
      const grid = sphere(three, 128, 64);
      const surface = new three.ShaderMaterial({
        vertexShader: SURFACE_VERT,
        fragmentShader: SURFACE_FRAG,
        uniforms: { dayMap: uniform.day, nightMap: uniform.night, waterMap: uniform.water, sunDir, lights: { value: 1 }, boost: { value: 0 }, ortho: { value: 1 } },
      });
      const cloudShift = { value: 0 };
      const cloudMaterial = new three.ShaderMaterial({
        vertexShader: SURFACE_VERT,
        fragmentShader: CLOUD_FRAG,
        uniforms: { cloudMap: uniform.clouds, sunDir, shift: cloudShift, opacity: { value: 0.9 } },
        transparent: true,
        depthWrite: false,
      });
      const atmosphere = new three.ShaderMaterial({
        vertexShader: ATMOSPHERE_VERT,
        fragmentShader: ATMOSPHERE_FRAG,
        uniforms: { sunView: sunDir, outer: { value: ATMOSPHERE_OUTER }, ortho: { value: 1 } },
        transparent: true,
        depthWrite: false,
        side: three.BackSide,
      });

      const turned = new three.Group();
      const earth = new three.Mesh(grid, surface);
      const tiles: TileSet = createTileSet(
        three,
        turned,
        { sunDir, lights: surface.uniforms["lights"] as { value: number }, boost: surface.uniforms["boost"] as { value: number }, ortho: surface.uniforms["ortho"] as { value: number }, water: uniform.water, night: uniform.night },
        { assets: deps.assets, base: () => deps.tiles?.(), cap: deps.cap, invalidate: deps.invalidate, ...(deps.onTiles ? { onManifest: deps.onTiles } : {}) },
      );
      model.tiles = tiles;
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
      // the meteors: made the first time they are switched on, and asking for their own next draw while a streak is alive or one is due
      let meteors: MeteorLayer | null = null;
      let meteorTimer: ReturnType<typeof setTimeout> | undefined;

      return {
        scene,
        camera,
        update() {
          deps.onDraw?.();
          const view = model.view;
          const look = lookAt(model.centre, view);
          turned.rotation.set(look.lat * RAD, -look.lon * RAD, 0, "XYZ");
          const [sx, sy, sz] = unitVector(subsolarPoint(model.time));
          sunDir.value.set(sx, sy, sz).applyEuler(turned.rotation);
          if (model.light === "lit") sunDir.value.set(0, 0, 1);
          cloudShift.value = -(((model.time / 3_600_000) * deps.drift) % 360) / 360;
          clouds.visible = model.clouds;
          surface.uniforms["lights"]!.value = model.lights && model.light !== "lit" ? 1 : 0;
          surface.uniforms["boost"]!.value = model.light === "boost" ? 1 : 0;
          const radius = discRadius(size.width, size.height, view.zoom);
          camera.left = (-size.width / 2 - view.panX) / radius;
          camera.right = (size.width / 2 - view.panX) / radius;
          camera.top = (size.height / 2 + view.panY) / radius;
          camera.bottom = (-size.height / 2 + view.panY) / radius;
          camera.updateProjectionMatrix();
          model.drawn = { view: { ...view }, time: model.time, radius, centre: { ...model.centre } };
          textures.sync(radius * model.ratio());
          tiles.sync({ lon: look.lon, lat: look.lat, width: size.width, height: size.height, panX: view.panX, panY: view.panY, radius }, [sunDir.value.x, sunDir.value.y, sunDir.value.z], true, model.ratio());
          deps.onPose?.({ lon: look.lon, lat: look.lat, radius, cx: size.width / 2 + view.panX, cy: size.height / 2 + view.panY, width: size.width, height: size.height });
          if (model.meteors.on && !meteors) meteors = createMeteorLayer(three, turned, model.meteors);
          if (meteors) {
            const wait = meteors.step({ now: performance.now(), time: model.time, facing: unitVector({ lon: look.lon, lat: look.lat }), sun: [sx, sy, sz], radius, width: size.width, height: size.height });
            clearTimeout(meteorTimer);
            meteorTimer = Number.isFinite(wait) ? setTimeout(deps.invalidate, wait) : undefined;
          }
          return false;
        },
        resize(next, nextHeight) {
          size = { width: next, height: nextHeight };
        },
        dispose() {
          clearTimeout(meteorTimer);
          meteors?.dispose();
          model.tiles = null;
          tiles.dispose();
          textures.dispose();
          grid.dispose();
          surface.dispose();
          cloudMaterial.dispose();
          atmosphere.dispose();
        },
      };
    },
  };
}
