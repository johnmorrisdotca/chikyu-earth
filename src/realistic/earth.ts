// The realistic Earth as a scene for kazoku-ui's shared renderer: a sphere with a day, a night and a water picture, a cloud
// layer, and an atmosphere's glow, lit by the Sun where it really stands. It draws only when asked (`invalidate`), and holds only
// the texture sizes the zoom needs. three.js is the page's own: this file takes it as an argument and never imports it.
import type * as THREE from "three";
import type { AssetCache, BuildContext, Item3D, Scene3D } from "@johnmorrisdotca/kazoku-ui/renderer";
import type { GeoPoint, GlobeView } from "../types.ts";
import type { SatelliteRef } from "../satellites/types.ts";
import { HOME_VIEW, lookAt } from "../view.ts";
import { AIR_QUALITY, AIR_THICKNESS_DEFAULT, AIR_VERT, airFrag, airTop } from "./air.ts";
import { CLOUD_FRAG, SURFACE_FRAG, SURFACE_VERT } from "./shaders.ts";
import { greenwichSidereal, subsolarPoint, unitVector } from "./sun.ts";
import { createSatelliteLayer, newSatelliteState, type SatelliteLayer, type SatelliteState } from "../space/satellite-layer.ts";
import type { Layer } from "./tiers.ts";
import { createTextureSet, type ThreeParts } from "./textures.ts";
import { createTileSet, type TileSet, type TileSources } from "./tile-set.ts";
import type { SkyFrame } from "../sky/frame.ts";
import { createBodyLabelLayer, newBodyLabelState, type BodyLabelLayer, type BodyLabelState } from "./body-label.ts";
import { createMeteorLayer, newMeteorState, type MeteorLayer, type MeteorState } from "../meteors/layer.ts";
import { paintMinute } from "../paint/buffer.ts";
import { createPaintTexture } from "../paint/texture.ts";
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

/**
 * How the camera is held: `ground` (the default) over a place on the ground, so the Earth keeps still and the clock moves the light across it; `space` held in the stars, so the Earth turns beneath it as the clock runs and the day and night line stays
 * where the Sun really puts it; `sun` held on the Sun's side, so the day and night line keeps its place on the screen while the Earth turns beneath.
 *
 * @example
 * ```ts
 * import type { CameraMode } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const modes: CameraMode[] = ["ground", "space", "sun"];
 * console.log(modes.join(", "));
 * ```
 */
export type CameraMode = "ground" | "space" | "sun";

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
  /** How the camera is held (see `CameraMode`). */
  camera: CameraMode;
  /** How many times its real thickness the air is drawn, 1 to 5 (`AIR_THICKNESS_DEFAULT` until the element says otherwise); read at every draw. */
  airThickness: number;
  /** How fast the cloud picture is made to move eastward against the ground, degrees an hour: 0 (the default) keeps the clouds where the picture has them. The picture is one snapshot, not a forecast; a drift is only for life. */
  cloudDrift: number;
  /** For the `space` camera: the Earth's turn against the stars (degrees) when the camera was set; null until the next draw sets it. */
  cameraSpin: number | null;
  /** Game seconds a second (the clock's speed): the satellites are placed from it. */
  speed: number;
  /** The satellites shown, the one chosen, and what the last draw did with them. */
  satellites: SatelliteState;
  /** Where the camera looked at the last draw (the element decides from it whether a new draw is worth it). */
  drawn: { view: GlobeView; time: number; radius: number; centre: GeoPoint } | null;
  /** The map tiles laid over the pictures while the scene is built: what they are doing, for a page or a test. */
  tiles: TileSet | null;
  /** The satellite at a point of the view (CSS pixels), within a radius, once a draw has been made and one is there. */
  pick: ((x: number, y: number, radius: number) => SatelliteRef | null) | null;
  /** The pixel ratio the textures are chosen for. */
  ratio(): number;
  /** Meteors seen from space (src/meteors/layer.ts): off unless the element switches them on. */
  meteors: MeteorState;
  /** The name written on the Earth (src/realistic/body-label.ts): off unless the element sets it. */
  bodyLabel: BodyLabelState;
}

export interface EarthDeps {
  assets: AssetCache;
  /** Ends with a slash. */
  textureBase: () => string;
  /** The widest texture, 4096 at most. */
  cap: () => number;
  /** The map source of each layer now (the data door's: a source a page added, else the `tiles` folder), or none: the Earth then keeps the package's own pictures. */
  sources?: () => TileSources;
  /** Told once when the tile set has been read: the width in pixels of the finest level of each of its layers. */
  onTiles?: (layers: Record<string, number>) => void;
  invalidate: () => void;
  onError?: (error: unknown) => void;
  onTier?: (layer: Layer, width: number) => void;
  /** How much the air costs: `full` (12 samples along the ray and 4 toward the Sun) or `light` (6 and 2, for a small or slow device). Read once, when the scene is built. */
  air?: () => "full" | "light";
  /** The satellites could not be drawn (the three.js parts handed over lack `Points`). */
  onSatellitesError?: (error: unknown) => void;
  /** Where the sky falls on the screen at this draw, for the names of the stars and the constellation lines laid over it: the directions seen along the picture's own axes. */
  onSky?: (frame: SkyFrame) => void;
  /** The name written on the Earth could not be made (the three.js handed over lacks a part, or the label could not be loaded). */
  onLabelError?: (error: unknown) => void;
  /** Told after the tiles were put right for a draw: what the draw shows from each source is known now. */
  onTiled?: () => void;
  /** Told at the start of every draw, before anything is read for it. */
  onDraw?: () => void;
  /** Told at every draw where the disc is, for what is laid over it (markers). */
  onPose?: (pose: { lon: number; lat: number; radius: number; cx: number; cy: number; width: number; height: number }) => void;
  /** The painted satellite trail, when the element has one. Read at every draw; nothing is uploaded while `step` returns false. */
  paint?: { data: Uint8Array; width: number; height: number; step(ms: number): boolean; span(): number; on(): boolean };
}

export const newModel = (): EarthModel => ({
  centre: { lon: 0, lat: 0 },
  view: { ...HOME_VIEW },
  time: Date.now(),
  clouds: true,
  lights: true,
  light: "sun",
  camera: "space",
  airThickness: AIR_THICKNESS_DEFAULT,
  cloudDrift: 0,
  cameraSpin: null,
  speed: 1,
  satellites: newSatelliteState(),
  drawn: null,
  tiles: null,
  pick: null,
  ratio: () => Math.min(globalThis.devicePixelRatio || 1, 2),
  meteors: newMeteorState(),
  bodyLabel: newBodyLabelState(),
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

/**
 * The place the camera looks at for a moment: the home centre as it is (`ground`), the home centre as it was when the camera was set, carried west by the Earth's turn since (`space`), or the home centre read from the Sun's own place (`sun`: `0,0` is straight at noon).
 * It sets `cameraSpin` when the `space` camera has none yet. Pure apart from that.
 *
 * @param model - The model: its centre, camera, camera spin and the moment shown.
 * @returns The longitude and latitude the view is turned from (yaw and tilt are added to it by `lookAt`).
 *
 * @example
 * ```ts
 * import { cameraCentre } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const start = Date.UTC(2026, 10, 2, 12);
 * const model = { centre: { lon: 10, lat: 30 }, camera: "space" as const, cameraSpin: null, time: start };
 * cameraCentre(model);
 * model.time = start + 6 * 3_600_000;
 * console.log(cameraCentre(model).lon.toFixed(1));
 * ```
 */
export function cameraCentre(model: Pick<EarthModel, "centre" | "camera" | "cameraSpin" | "time">): GeoPoint {
  if (model.camera === "space") {
    const spin = greenwichSidereal(model.time);
    model.cameraSpin ??= spin;
    return { lon: model.centre.lon - (spin - model.cameraSpin), lat: model.centre.lat };
  }
  if (model.camera === "sun") {
    const sun = subsolarPoint(model.time);
    return { lon: sun.lon + model.centre.lon, lat: Math.max(-90, Math.min(90, sun.lat + model.centre.lat)) };
  }
  return model.centre;
}

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
      /** The Sun in the Earth's own axes (before the view turns it), which the surface needs to find where a cloud's shadow falls. */
      const sunLocal = { value: new three.Vector3(1, 0, 0) };
      const cloudShift = { value: 0 };
      const grid = sphere(three, 128, 64);
      const surface = new three.ShaderMaterial({
        vertexShader: SURFACE_VERT,
        fragmentShader: SURFACE_FRAG,
        uniforms: { dayMap: uniform.day, nightMap: uniform.night, waterMap: uniform.water, cloudMap: uniform.clouds, sunDir, sunLocal, cloudShift, lights: { value: 1 }, boost: { value: 0 }, ortho: { value: 1 } },
      });
      const paint = createPaintTexture(three, deps.paint?.data ?? new Uint8Array(4), deps.paint?.width ?? 1, deps.paint?.height ?? 1);
      Object.assign(surface.uniforms, paint.uniforms);
      const cloudMaterial = new three.ShaderMaterial({
        vertexShader: SURFACE_VERT,
        fragmentShader: CLOUD_FRAG,
        uniforms: { cloudMap: uniform.clouds, sunDir, shift: cloudShift, opacity: { value: 0.9 } },
        transparent: true,
        depthWrite: false,
      });
      // the air: light scattered once on its way through a shell 100 km thick, worked out for each pixel and laid over the surface. A device that is small or slow takes fewer samples (the `light` quality).
      const atmosphere = new three.ShaderMaterial({
        vertexShader: AIR_VERT,
        fragmentShader: airFrag(AIR_QUALITY[deps.air?.() ?? "full"]),
        uniforms: { sunDir, ortho: { value: 1 }, thick: { value: model.airThickness } },
        transparent: true,
        premultipliedAlpha: true,
        depthWrite: false,
      });

      const turned = new three.Group();
      const earth = new three.Mesh(grid, surface);
      const tiles: TileSet = createTileSet(
        three,
        turned,
        { sunDir, lights: surface.uniforms["lights"] as { value: number }, boost: surface.uniforms["boost"] as { value: number }, ortho: surface.uniforms["ortho"] as { value: number }, water: uniform.water, night: uniform.night, extra: { cloudMap: uniform.clouds, sunLocal, cloudShift, ...paint.uniforms } },
        { assets: deps.assets, sources: () => deps.sources?.() ?? {}, cap: deps.cap, invalidate: deps.invalidate, ...(deps.onTiles ? { onManifest: deps.onTiles } : {}) },
      );
      model.tiles = tiles;
      const clouds = new three.Mesh(grid, cloudMaterial);
      clouds.scale.setScalar(CLOUD_RADIUS);
      clouds.renderOrder = 2;
      turned.add(earth, clouds);
      const glow = new three.Mesh(grid, atmosphere);
      glow.scale.setScalar(airTop(model.airThickness));
      glow.renderOrder = 3;
      glow.frustumCulled = false;
      const scene = new three.Scene();
      scene.add(turned, glow);
      // the satellites are placed in space's own axes (x to the vernal equinox, y north); this group turns them into the Earth's axes (by the Earth's turn against the stars) and then as the Earth is turned in the view
      const inertial = new three.Group();
      const spun = new three.Group();
      inertial.add(spun);
      scene.add(inertial);
      let layer: SatelliteLayer | undefined;
      // far enough in front that a geostationary satellite (6.6 radii out) is never behind the camera: an orthographic picture is the same from anywhere on the line
      const camera = new three.OrthographicCamera(-1, 1, 1, -1, 1, 120);
      camera.position.set(0, 0, 50);
      // the meteors: made the first time they are switched on, and asking for their own next draw while a streak is alive or one is due
      let meteors: MeteorLayer | null = null;
      let meteorTimer: ReturnType<typeof setTimeout> | undefined;
      let nameOn: BodyLabelLayer | null = null;

      return {
        scene,
        camera,
        update() {
          deps.onDraw?.();
          const view = model.view;
          const centre = cameraCentre(model);
          const look = lookAt(centre, view);
          turned.rotation.set(look.lat * RAD, -look.lon * RAD, 0, "XYZ");
          inertial.rotation.copy(turned.rotation);
          const spin = greenwichSidereal(model.time);
          spun.rotation.set(0, -(spin + 90) * RAD, 0);
          const [sx, sy, sz] = unitVector(subsolarPoint(model.time));
          sunLocal.value.set(sx, sy, sz);
          sunDir.value.set(sx, sy, sz).applyEuler(turned.rotation);
          if (model.light === "lit") sunDir.value.set(0, 0, 1);
          cloudShift.value = -(((model.time / 3_600_000) * model.cloudDrift) % 360) / 360;
          clouds.visible = model.clouds;
          atmosphere.uniforms["thick"]!.value = model.airThickness;
          glow.scale.setScalar(airTop(model.airThickness));
          surface.uniforms["lights"]!.value = model.lights && model.light !== "lit" ? 1 : 0;
          surface.uniforms["boost"]!.value = model.light === "boost" ? 1 : 0;
          const radius = discRadius(size.width, size.height, view.zoom);
          camera.left = (-size.width / 2 - view.panX) / radius;
          camera.right = (size.width / 2 - view.panX) / radius;
          camera.top = (size.height / 2 + view.panY) / radius;
          camera.bottom = (-size.height / 2 + view.panY) / radius;
          camera.updateProjectionMatrix();
          if (!layer && model.satellites.groups.size > 0) {
            try {
              layer = createSatelliteLayer(three, spun, model.satellites, model.ratio);
            } catch (error) {
              model.satellites.groups.clear();
              deps.onSatellitesError?.(error);
            }
          }
          layer?.update(model.time, model.speed);
          model.pick = layer ? (x, y, radius) => layer!.pick(x, y, camera, size, radius) : null;
          model.drawn = { view: { ...view }, time: model.time, radius, centre: { ...centre } };
          textures.sync(radius * model.ratio());
          tiles.sync({ lon: look.lon, lat: look.lat, width: size.width, height: size.height, panX: view.panX, panY: view.panY, radius }, [sunDir.value.x, sunDir.value.y, sunDir.value.z], true, model.ratio());
          deps.onTiled?.();
          // the name written on the Earth: the layer is made the first time the settings ask for it, and keeps itself right
          if (model.bodyLabel.settings && !nameOn) nameOn = createBodyLabelLayer(three, turned, model.bodyLabel, { invalidate: deps.invalidate, ...(deps.onLabelError ? { onError: deps.onLabelError } : {}) });
          nameOn?.sync(camera, radius);
          if (deps.onSky) {
            // the sky as the picture's own axes see it: a direction in space, turned as the satellites are into the picture's axes, falls where its sideways and upward parts say, in front when it points towards the viewer
            spun.updateWorldMatrix(true, false);
            const sky = new three.Vector3();
            const scale = Math.min(size.width, size.height) / 2;
            const cx = size.width / 2 + view.panX;
            const cy = size.height / 2 + view.panY;
            deps.onSky({
              width: size.width,
              height: size.height,
              discs: [{ x: cx, y: cy, radius: radius * airTop(model.airThickness) }],
              project(rightAscension, declination, out) {
                const r = rightAscension * RAD;
                const d = declination * RAD;
                sky.set(Math.cos(d) * Math.cos(r), Math.sin(d), -Math.cos(d) * Math.sin(r)).transformDirection(spun.matrixWorld);
                out.x = cx + scale * sky.x;
                out.y = cy - scale * sky.y;
                return sky.z > 0;
              },
            });
          }
          deps.onPose?.({ lon: look.lon, lat: look.lat, radius, cx: size.width / 2 + view.panX, cy: size.height / 2 + view.panY, width: size.width, height: size.height });
          if (deps.paint) {
            if (deps.paint.step(model.time)) paint.upload();
            paint.uniforms.paintNow.value = paintMinute(model.time);
            paint.uniforms.paintSpan.value = deps.paint.span();
            paint.uniforms.paintOn.value = deps.paint.on() ? 1 : 0;
          }
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
          layer?.dispose();
          model.pick = null;
          clearTimeout(meteorTimer);
          meteors?.dispose();
          nameOn?.dispose();
          model.tiles = null;
          tiles.dispose();
          textures.dispose();
          grid.dispose();
          paint.dispose();
          surface.dispose();
          cloudMaterial.dispose();
          atmosphere.dispose();
        },
      };
    },
  };
}
