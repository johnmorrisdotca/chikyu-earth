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
export const BODY_NAMES = ["Earth", "Sun", "Moon", ...PLANETS] as const;
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
  drawn: null,
  lookups: 0,
  ratio: () => Math.min(globalThis.devicePixelRatio || 1, 2),
});

export interface SpaceDeps {
  assets: AssetCache;
  textureBase: () => string;
  cap: () => number;
  invalidate: () => void;
  onError?: (error: unknown) => void;
  onTier?: (layer: Layer, width: number) => void;
  /** Where each body is on the screen, in CSS pixels in the box, or null when it is behind the camera. Called at each draw. */
  onLabels?: (places: Record<BodyName, { x: number; y: number } | null>) => void;
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
      const flat = quad(three);

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

      const sunMesh = new three.Mesh(
        flat,
        new three.ShaderMaterial({ vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, uniforms: { tint: { value: new three.Color("#ffb347") } }, transparent: true, depthWrite: false }),
      );
      sunMesh.renderOrder = 4;
      sunMesh.frustumCulled = false;

      const planets = new Map<PlanetName, { mesh: THREE.Mesh; sun: { value: THREE.Vector3 }; orbit: THREE.LineLoop; positions: Float32Array; samples: Vec3[]; epoch: number }>();
      const scene = new three.Scene();
      scene.add(earth, clouds, glow, moon, sunMesh);
      for (const name of PLANETS) {
        const sun = { value: new three.Vector3(1, 0, 0) };
        const mesh = new three.Mesh(
          solid,
          new three.ShaderMaterial({ vertexShader: SURFACE_VERT, fragmentShader: BODY_FRAG, uniforms: { map: { value: null }, tint: { value: new three.Color(COLORS[name]) }, textured: { value: 0 }, sunDir: sun, ambient: { value: 0.2 } } }),
        );
        const positions = new Float32Array(96 * 3);
        const lineGeometry = new three.BufferGeometry();
        lineGeometry.setAttribute("position", new three.BufferAttribute(positions, 3));
        const orbit = new three.LineLoop(lineGeometry, new three.LineBasicMaterial({ color: ORBIT_COLORS[name], transparent: true, opacity: 0.7 }));
        orbit.frustumCulled = false;
        scene.add(mesh, orbit);
        planets.set(name, { mesh, sun, orbit, positions, samples: [], epoch: Number.NaN });
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

          // the Sun
          sunMesh.position.set(sunPos[0], sunPos[1], sunPos[2]);
          sunMesh.quaternion.copy(camera.quaternion);
          sunMesh.scale.setScalar(RADIUS["Sun"]![mode] * 3.2);

          // the planets, and their orbits round the Sun
          for (const name of PLANETS) {
            const p = planets.get(name)!;
            const pos = placeAround(mode, sunPos, helioOf(frame.planets[name]));
            p.mesh.position.set(pos[0], pos[1], pos[2]);
            p.mesh.scale.setScalar(RADIUS[name]![mode]);
            const away = unit([frame.sun[0] - frame.planets[name][0], frame.sun[1] - frame.planets[name][1], frame.sun[2] - frame.planets[name][2]]);
            p.sun.value.set(away[0], away[1], away[2]);
            p.orbit.visible = model.orbits;
            if (model.orbits) {
              if (!Number.isFinite(p.epoch) || Math.abs(model.time - p.epoch) > 365 * 86_400_000) {
                p.samples = orbitPath(name, model.time, 96).slice(0, 96);
                p.epoch = model.time;
              }
              for (let i = 0; i < 96; i += 1) {
                const s = p.samples[i]!;
                const o = placeAround(mode, sunPos, s);
                p.positions[i * 3] = o[0];
                p.positions[i * 3 + 1] = o[1];
                p.positions[i * 3 + 2] = o[2];
              }
              (p.orbit.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
            }
          }

          // the camera: above the home place as the sky was when it was last moved, turned by yaw and tilt, as far as the zoom says
          const spin = model.cameraSpin ?? frame.spin;
          const lon = model.centre.lon - model.view.yaw;
          const lat = Math.max(-90, Math.min(90, model.centre.lat + model.view.tilt));
          const aim = direction(spin + lon, lat);
          const distance = Math.max(1.05, FIT_DISTANCE / Math.max(1e-9, model.view.zoom));
          camera.position.set(aim[0] * distance, aim[1] * distance, aim[2] * distance);
          camera.up.set(0, 1, 0);
          target.set(0, 0, 0);
          camera.lookAt(target);
          camera.near = Math.max(0.005, distance * 0.02);
          camera.far = Math.max(2000, distance * 4 + (mode === "true" ? 40 * 23_481 : 400));
          camera.aspect = size.width / Math.max(1, size.height);
          camera.updateProjectionMatrix();
          camera.updateMatrixWorld();
          sunView.value.copy(sunEarth.value).transformDirection(camera.matrixWorldInverse);

          const half = Math.tan((FOV / 2) * RAD);
          const radiusPx = (size.height / 2) * Math.tan(Math.asin(Math.min(1, 1 / distance))) / half;
          const toMoon = Math.hypot(moonPos[0] - camera.position.x, moonPos[1] - camera.position.y, moonPos[2] - camera.position.z);
          const moonPx = ((size.height / 2) * RADIUS["Moon"]![mode]) / Math.max(1e-6, toMoon) / half;
          model.drawn = { frame, distance, radiusPx };
          const ratio = model.ratio();
          textures.sync({ day: radiusPx * ratio, night: radiusPx * ratio, clouds: radiusPx * ratio, water: radiusPx * ratio, moon: Math.min(moonPx, 1e5) * ratio });
          if (deps.onLabels && model.labels) {
            const places = { Earth: labelFor([0, 0, 0]), Sun: labelFor(sunPos), Moon: labelFor(moonPos) } as Record<BodyName, { x: number; y: number } | null>;
            for (const name of PLANETS) places[name] = labelFor(placeAround(mode, sunPos, helioOf(frame.planets[name])));
            deps.onLabels(places);
          }
          return false;
        },
        resize(w, h) {
          size = { width: w, height: h };
        },
        dispose() {
          textures.dispose();
          for (const p of planets.values()) {
            (p.mesh.material as THREE.Material).dispose();
            p.orbit.geometry.dispose();
            (p.orbit.material as THREE.Material).dispose();
          }
          grid.dispose();
          solid.dispose();
          flat.dispose();
          earthMaterial.dispose();
          cloudMaterial.dispose();
          atmosphereMaterial.dispose();
          (moon.material as THREE.Material).dispose();
          (sunMesh.material as THREE.Material).dispose();
        },
      };
    },
  };
}
