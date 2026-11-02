// The space view as a scene for kazoku-ui's shared renderer: the Earth (as in the realistic look), the Moon, the Sun and the planets in their real directions from
// the Earth's centre, lit by the Sun so that the Moon's phase and the Earth's day side come out of the light, not out of a table. Draws only when asked.
import type * as THREE from "three";
import type { AssetCache, BuildContext, Item3D, Scene3D } from "@johnmorrisdotca/kazoku-ui/renderer";
import { ATMOSPHERE_OUTER, sphere } from "../realistic/earth.ts";
import { ATMOSPHERE_FRAG, ATMOSPHERE_VERT, BODY_FRAG, CLOUD_FRAG, GLOW_FRAG, GLOW_VERT, SURFACE_FRAG, SURFACE_VERT } from "../realistic/shaders.ts";
import { createTextureSet, type ThreeParts } from "../realistic/textures.ts";
import type { Layer } from "../realistic/tiers.ts";
import { createTrack, orbitPath, PLANETS, type Frame, type PlanetName, type Vec3 } from "./ephemeris.ts";
import { placeAround, placeMoon, placeSun, RADIUS, type ScaleMode } from "./scale.ts";

type Three = ThreeParts;
const RAD = Math.PI / 180;
/** The camera's distance, in Earth radii, at which the Earth fills the view at zoom 1. */
export const FIT_DISTANCE = 3.4;
const FOV = 35;
const LAYERS: Layer[] = ["day", "night", "clouds", "water", "moon"];

const PLAIN_COLOR = (name: PlanetName | "Sun"): string => (name === "Sun" ? "#ffb347" : COLORS[name]);
/**
 * The ten bodies the space view places, names and lets a reader choose: the Earth, the Sun, the Moon and the seven other planets.
 *
 * @example
 * ```ts no-run
 * import { BODY_NAMES } from "@johnmorrisdotca/chikyu-earth/space/element";
 *
 * console.log(BODY_NAMES.join(", "));
 * ```
 */
export const BODY_NAMES = ["Earth", "Sun", "Moon", ...PLANETS] as const;

/**
 * The name of one of the bodies in `BODY_NAMES`.
 *
 * @example
 * ```ts no-run
 * import { BODY_NAMES, type BodyName } from "@johnmorrisdotca/chikyu-earth/space/element";
 *
 * const mars: BodyName = "Mars";
 * console.log(BODY_NAMES.includes(mars));
 * ```
 */
export type BodyName = (typeof BODY_NAMES)[number];

const COLORS: Record<PlanetName, string> = { Mercury: "#a79f96", Venus: "#e3c98a", Mars: "#c1593a", Jupiter: "#d2b48c", Saturn: "#e4d4a0", Uranus: "#9fd6dc", Neptune: "#4a6bd6" };
const ORBIT_COLORS: Record<PlanetName, string> = { Mercury: "#6b655f", Venus: "#8c7c55", Mars: "#7a4034", Jupiter: "#85735a", Saturn: "#8d8567", Uranus: "#5f8a8e", Neptune: "#34499a" };

export interface SpaceModel {
  /** Moment shown, milliseconds since the epoch. */
  time: number;
  mode: ScaleMode;
  /** The shared controls' yaw, tilt and zoom. */
  view: { yaw: number; tilt: number; zoom: number };
  /** The home place: the camera starts above it. */
  centre: { lon: number; lat: number };
  /** Earth's turn against the stars (degrees) at the moment the camera was last moved: the camera is fixed to the stars, not to the ground. */
  cameraSpin: number | null;
  orbits: boolean;
  labels: boolean;
  /** Milliseconds of game time one second of wall time covers (the ephemeris is looked up once per such span). */
  stepMs: number;
  /** The body the camera looks at, and (in `zoom`) fills the view with at 1x. */
  focus: BodyName;
  /** Filled at each draw. */
  drawn: { frame: Frame; distance: number; radiusPx: number } | null;
  /** How many times astronomy-engine has been asked for a frame. */
  lookups: number;
  ratio(): number;
}

export const newSpaceModel = (): SpaceModel => ({
  time: Date.now(),
  mode: "compressed",
  view: { yaw: 0, tilt: 0, zoom: 1 },
  centre: { lon: 0, lat: 0 },
  cameraSpin: null,
  orbits: true,
  labels: true,
  stepMs: 1000,
  focus: "Earth",
  drawn: null,
  lookups: 0,
  ratio: () => Math.min(globalThis.devicePixelRatio || 1, 2),
});

/** Where a body is on the screen: its centre and its apparent radius, in CSS pixels in the box. */
export interface BodyPlace {
  x: number;
  y: number;
  r: number;
}

/**
 * One body as drawn by a painter: an object of radius 1 at the origin, which the scene places, scales and (for the Sun) turns to face the camera.
 *
 * @example
 * ```ts no-run
 * import type { BodyDrawing } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const drawing = { object: undefined as never, dispose: () => undefined } satisfies BodyDrawing;
 * console.log(typeof drawing.dispose);
 * ```
 */
export interface BodyDrawing {
  object: THREE.Object3D;
  /** Told at each draw the unit direction from the body to the Sun, in scene axes (x to the vernal equinox, y north). */
  light?(toSun: Vec3): void;
  /** True to have the scene turn the object to face the camera (a disc or a glow). */
  billboard?: boolean;
  dispose(): void;
}

/**
 * The seam for drawing the Sun and the planets. The space view places them, sizes them, lights them and labels them; a painter only makes what is drawn at
 * each place. The default (`plainPainter`) is a sphere in the body's colour, and a glow for the Sun. Another package can supply better looking ones.
 *
 * @example
 * ```ts no-run
 * import { plainPainter, type BodyPainter } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const painter: BodyPainter = { make: (three, name) => plainPainter.make(three, name) };
 * console.log(typeof painter.make);
 * ```
 */
export interface BodyPainter {
  make(three: ThreeParts, name: PlanetName | "Sun"): BodyDrawing;
}

export interface SpaceDeps {
  assets: AssetCache;
  textureBase: () => string;
  cap: () => number;
  invalidate: () => void;
  onError?: (error: unknown) => void;
  onTier?: (layer: Layer, width: number) => void;
  /** Where each body is on the screen, in CSS pixels in the box, or null when it is behind the camera. Called at each draw. */
  onLabels?: (places: Record<BodyName, BodyPlace | null>) => void;
  /** How the Sun and the planets are drawn; left out, plain spheres in the right colours (see `BodyPainter`). */
  painter?: BodyPainter;
}

/** An inertial direction from the Earth's centre, in scene axes, for right ascension and declination in degrees. */
const direction = (ra: number, dec: number): Vec3 => [Math.cos(dec * RAD) * Math.cos(ra * RAD), Math.sin(dec * RAD), -Math.cos(dec * RAD) * Math.sin(ra * RAD)];
const unit = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** A square facing +z, 2 x 2, with uvs 0 to 1. */
function quad(three: Three): THREE.BufferGeometry {
  const g = new three.BufferGeometry();
  g.setAttribute("position", new three.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  g.setAttribute("uv", new three.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

/**
 * The default look: a sphere in the planet's colour, lit by the Sun, and for the Sun a glowing disc.
 *
 * @example
 * ```ts no-run
 * import { plainPainter } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(typeof plainPainter.make);
 * ```
 */
export const plainPainter: BodyPainter = {
  make(three, name) {
    if (name === "Sun") {
      const geometry = quad(three);
      const material = new three.ShaderMaterial({ vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, uniforms: { tint: { value: new three.Color(PLAIN_COLOR(name)) } }, transparent: true, depthWrite: false });
      const mesh = new three.Mesh(geometry, material);
      mesh.renderOrder = 4;
      mesh.frustumCulled = false;
      mesh.scale.setScalar(3.2);
      const group = new three.Group();
      group.add(mesh);
      return {
        object: group,
        billboard: true,
        dispose() {
          geometry.dispose();
          material.dispose();
        },
      };
    }
    const geometry = sphere(three, 48, 24);
    const sun = { value: new three.Vector3(1, 0, 0) };
    const material = new three.ShaderMaterial({ vertexShader: SURFACE_VERT, fragmentShader: BODY_FRAG, uniforms: { map: { value: null }, tint: { value: new three.Color(PLAIN_COLOR(name)) }, textured: { value: 0 }, sunDir: sun, ambient: { value: 0.2 } } });
    return {
      object: new three.Mesh(geometry, material),
      light(toSun) {
        sun.value.set(toSun[0], toSun[1], toSun[2]);
      },
      dispose() {
        geometry.dispose();
        material.dispose();
      },
    };
  },
};

export function createSpaceItem(model: SpaceModel, deps: SpaceDeps): Item3D<Three> {
  return {
    key: "chikyu-earth:space",
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
      const track = createTrack(model.stepMs);
      let trackStep = model.stepMs;

      const sunEarth = { value: new three.Vector3(1, 0, 0) };
      const sunView = { value: new three.Vector3(1, 0, 0) };
      const grid = sphere(three, 96, 48);
      const solid = sphere(three, 48, 24);

      const earthMaterial = new three.ShaderMaterial({
        vertexShader: SURFACE_VERT,
        fragmentShader: SURFACE_FRAG,
        uniforms: { dayMap: uniform.day, nightMap: uniform.night, waterMap: uniform.water, sunDir: sunEarth, lights: { value: 1 }, ortho: { value: 0 } },
      });
      const cloudShift = { value: 0 };
      const cloudMaterial = new three.ShaderMaterial({
        vertexShader: SURFACE_VERT,
        fragmentShader: CLOUD_FRAG,
        uniforms: { cloudMap: uniform.clouds, sunDir: sunEarth, shift: cloudShift, opacity: { value: 0.9 } },
        transparent: true,
        depthWrite: false,
      });
      const atmosphereMaterial = new three.ShaderMaterial({
        vertexShader: ATMOSPHERE_VERT,
        fragmentShader: ATMOSPHERE_FRAG,
        uniforms: { sunView, outer: { value: ATMOSPHERE_OUTER }, ortho: { value: 0 } },
        transparent: true,
        depthWrite: false,
        side: three.BackSide,
      });

      const earth = new three.Mesh(grid, earthMaterial);
      const clouds = new three.Mesh(grid, cloudMaterial);
      clouds.scale.setScalar(1.006);
      clouds.renderOrder = 3;
      const glow = new three.Mesh(grid, atmosphereMaterial);
      glow.scale.setScalar(ATMOSPHERE_OUTER);
      glow.renderOrder = 2;
      glow.frustumCulled = false;

      const moonSun = { value: new three.Vector3(1, 0, 0) };
      const moon = new three.Mesh(
        solid,
        new three.ShaderMaterial({ vertexShader: SURFACE_VERT, fragmentShader: BODY_FRAG, uniforms: { map: uniform.moon, tint: { value: new three.Color("#bbbbbb") }, textured: { value: 1 }, sunDir: moonSun, ambient: { value: 0.03 } } }),
      );

      const painter = deps.painter ?? plainPainter;
      const scene = new three.Scene();
      scene.add(earth, clouds, glow, moon);
      const sunDrawing = painter.make(three, "Sun");
      scene.add(sunDrawing.object);
      type Planet = { drawing: BodyDrawing; orbit: THREE.LineLoop; positions: Float32Array; samples: Vec3[]; epoch: number };
      const planets = new Map<PlanetName, Planet>();
      for (const name of PLANETS) {
        const drawing = painter.make(three, name);
        const positions = new Float32Array(96 * 3);
        const lineGeometry = new three.BufferGeometry();
        lineGeometry.setAttribute("position", new three.BufferAttribute(positions, 3));
        const orbit = new three.LineLoop(lineGeometry, new three.LineBasicMaterial({ color: ORBIT_COLORS[name], transparent: true, opacity: 0.7 }));
        orbit.frustumCulled = false;
        scene.add(drawing.object, orbit);
        planets.set(name, { drawing, orbit, positions, samples: [], epoch: Number.NaN });
      }

      const camera = new three.PerspectiveCamera(FOV, width / Math.max(1, height), 0.05, 1000);
      const target = new three.Vector3();
      const projected = new three.Vector3();

      const labelFor = (v: Vec3): { x: number; y: number } | null => {
        projected.set(v[0], v[1], v[2]).project(camera);
        if (projected.z > 1 || projected.z < -1) return null;
        return { x: ((projected.x + 1) / 2) * size.width, y: ((1 - projected.y) / 2) * size.height };
      };

      return {
        scene,
        camera,
        update() {
          const frame = track.at(model.time);
          model.lookups = track.lookups;
          if (model.stepMs !== trackStep) {
            trackStep = model.stepMs;
            track.setStep(model.stepMs);
          }
          const mode = model.mode;
          const sunPos = placeSun(mode, frame.sun);
          const moonPos = placeMoon(mode, frame.moon);
          const helioOf = (planet: Vec3): Vec3 => [planet[0] - frame.sun[0], planet[1] - frame.sun[1], planet[2] - frame.sun[2]];

          // the Earth, turned by the sidereal time; light from the Sun
          earth.rotation.set(0, (frame.spin + 90) * RAD, 0);
          clouds.rotation.copy(earth.rotation);
          const toSun = unit(frame.sun);
          sunEarth.value.set(toSun[0], toSun[1], toSun[2]);
          cloudShift.value = -(((model.time / 3_600_000) * 1.5) % 360) / 360;
          earthMaterial.uniforms["lights"]!.value = 1;

          // the Moon, with its near side to the Earth
          moon.position.set(moonPos[0], moonPos[1], moonPos[2]);
          moon.scale.setScalar(RADIUS["Moon"]![mode]);
          moon.up.set(0, 1, 0);
          moon.lookAt(0, 0, 0);
          const moonToSun = unit([frame.sun[0] - frame.moon[0], frame.sun[1] - frame.moon[1], frame.sun[2] - frame.moon[2]]);
          moonSun.value.set(moonToSun[0], moonToSun[1], moonToSun[2]);

          // where everything is, and how big
          const pos = { Earth: [0, 0, 0] as Vec3, Moon: moonPos, Sun: sunPos } as Record<BodyName, Vec3>;
          for (const name of PLANETS) pos[name] = placeAround(mode, sunPos, helioOf(frame.planets[name]));
          const radiusOf = (name: BodyName): number => (name === "Earth" ? 1 : RADIUS[name]![mode]);

          // the Sun and the planets, drawn by the painter, and the planets' orbits round the Sun
          sunDrawing.object.position.set(sunPos[0], sunPos[1], sunPos[2]);
          sunDrawing.object.scale.setScalar(radiusOf("Sun"));
          if (sunDrawing.billboard) sunDrawing.object.quaternion.copy(camera.quaternion);
          for (const name of PLANETS) {
            const p = planets.get(name)!;
            p.drawing.object.position.set(pos[name][0], pos[name][1], pos[name][2]);
            p.drawing.object.scale.setScalar(radiusOf(name));
            p.drawing.light?.(unit([frame.sun[0] - frame.planets[name][0], frame.sun[1] - frame.planets[name][1], frame.sun[2] - frame.planets[name][2]]));
            p.orbit.visible = model.orbits;
            if (model.orbits) {
              if (!Number.isFinite(p.epoch) || Math.abs(model.time - p.epoch) > 365 * 86_400_000) {
                p.samples = orbitPath(name, model.time, 96).slice(0, 96);
                p.epoch = model.time;
              }
              for (let i = 0; i < 96; i += 1) {
                const o = placeAround(mode, sunPos, p.samples[i]!);
                p.positions[i * 3] = o[0];
                p.positions[i * 3 + 1] = o[1];
                p.positions[i * 3 + 2] = o[2];
              }
              (p.orbit.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
            }
          }

          // the camera: looks at the focus body from the direction the sky was in when it was last moved, turned by yaw and tilt, as far as the zoom says
          const focus = model.focus;
          const focusRadius = radiusOf(focus);
          const spin = model.cameraSpin ?? frame.spin;
          const lon = model.centre.lon - model.view.yaw;
          const lat = Math.max(-90, Math.min(90, model.centre.lat + model.view.tilt));
          const aim = direction(spin + lon, lat);
          const distance = Math.max(1.05 * focusRadius, (FIT_DISTANCE * focusRadius) / Math.max(1e-9, model.view.zoom));
          target.set(pos[focus][0], pos[focus][1], pos[focus][2]);
          camera.position.set(target.x + aim[0] * distance, target.y + aim[1] * distance, target.z + aim[2] * distance);
          camera.up.set(0, 1, 0);
          camera.lookAt(target);
          camera.near = Math.max(0.0005, distance * 0.02 - focusRadius * 0.5, focusRadius * 0.01);
          camera.far = Math.max(2000, distance * 4 + (mode === "true" ? 40 * 23_481 : 400));
          camera.aspect = size.width / Math.max(1, size.height);
          camera.updateProjectionMatrix();
          camera.updateMatrixWorld();
          sunView.value.copy(sunEarth.value).transformDirection(camera.matrixWorldInverse);

          // how many pixels across each body is: for the pictures the Earth and the Moon need, and for what is chosen
          const half = Math.tan((FOV / 2) * RAD);
          const radiusPxOf = (name: BodyName): number => {
            const d = Math.hypot(pos[name][0] - camera.position.x, pos[name][1] - camera.position.y, pos[name][2] - camera.position.z);
            const r = radiusOf(name);
            return d <= r * 1.001 ? 1e5 : ((size.height / 2) * (r / Math.sqrt(d * d - r * r))) / half;
          };
          const px = {} as Record<BodyName, number>;
          for (const name of BODY_NAMES) px[name] = radiusPxOf(name);
          model.drawn = { frame, distance, radiusPx: px.Earth };
          const ratio = model.ratio();
          const earthPx = Math.min(px.Earth, 1e5) * ratio;
          textures.sync({ day: earthPx, night: earthPx, clouds: earthPx, water: earthPx, moon: Math.min(px.Moon, 1e5) * ratio });
          if (deps.onLabels && model.labels) {
            const places = {} as Record<BodyName, BodyPlace | null>;
            for (const name of BODY_NAMES) {
              const at = labelFor(pos[name]);
              places[name] = at ? { x: at.x, y: at.y, r: px[name] } : null;
            }
            deps.onLabels(places);
          }
          return false;
        },
        resize(w, h) {
          size = { width: w, height: h };
        },
        dispose() {
          textures.dispose();
          sunDrawing.dispose();
          for (const p of planets.values()) {
            p.drawing.dispose();
            p.orbit.geometry.dispose();
            (p.orbit.material as THREE.Material).dispose();
          }
          grid.dispose();
          solid.dispose();
          earthMaterial.dispose();
          cloudMaterial.dispose();
          atmosphereMaterial.dispose();
          (moon.material as THREE.Material).dispose();
        },
      };
    },
  };
}
