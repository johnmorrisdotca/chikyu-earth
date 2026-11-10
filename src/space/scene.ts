// The space view as a scene for kazoku-ui's shared renderer: the Earth (as in the realistic look), the Moon, the Sun and the planets in their real directions from
// the Earth's centre, lit by the Sun so that the Moon's phase and the Earth's day side come out of the light, not out of a table. Draws only when asked.
import type * as THREE from "three";
import type { AssetCache, BuildContext, Item3D, Scene3D } from "@johnmorrisdotca/kazoku-ui/renderer";
import { ATMOSPHERE_OUTER, sphere } from "../realistic/earth.ts";
import { ATMOSPHERE_FRAG, ATMOSPHERE_VERT, BODY_FRAG, CLOUD_FRAG, GLOW_FRAG, GLOW_VERT, SURFACE_FRAG, SURFACE_VERT } from "../realistic/shaders.ts";
import { createTextureSet, type ThreeParts } from "../realistic/textures.ts";
import type { Layer } from "../realistic/tiers.ts";
import type { LightMode } from "../realistic/earth.ts";
import { createTrack, orbitPath, PLANETS, type Frame, type PlanetName, type Vec3 } from "./ephemeris.ts";
import { placeAround, placeMoon, placeSun, RADIUS, type ScaleMode } from "./scale.ts";
import type { SatelliteRef } from "../satellites/types.ts";
import { ridePose, type RideLook } from "./ride.ts";
import { createSatelliteLayer, newSatelliteState, type SatelliteLayer, type SatelliteState } from "./satellite-layer.ts";

type Three = ThreeParts;
const RAD = Math.PI / 180;
/** The camera's distance, in Earth radii, at which the Earth fills the view at zoom 1. */
export const FIT_DISTANCE = 3.4;
const FOV = 35;
const LAYERS: Layer[] = ["day", "night", "clouds", "water", "moon"];
/** The moons of a planet are shown once the planet is this many CSS pixels across its radius, and each is drawn at least this many pixels across its radius. */
const MOON_MIN_PLANET_PX = 4;
const MOON_MIN_PX = 2.2;
/** A moon that has been out of sight this long is let go (its pictures too). */
const MOON_KEEP_MS = 4000;

const PLAIN_COLOR = (name: string): string => (name === "Sun" ? "#ffb347" : (COLORS as Record<string, string>)[name] ?? "#9a948b");
/**
 * The eleven bodies the space view places, names and lets a reader choose: the Earth, the Sun, the Moon, the seven other planets and Pluto.
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

const COLORS: Record<PlanetName, string> = { Mercury: "#a79f96", Venus: "#e3c98a", Mars: "#c1593a", Jupiter: "#d2b48c", Saturn: "#e4d4a0", Uranus: "#9fd6dc", Neptune: "#4a6bd6", Pluto: "#c9b8a6" };
const ORBIT_COLORS: Record<PlanetName, string> = { Mercury: "#6b655f", Venus: "#8c7c55", Mars: "#7a4034", Jupiter: "#85735a", Saturn: "#8d8567", Uranus: "#5f8a8e", Neptune: "#34499a", Pluto: "#7d7468" };

/**
 * What a camera can ride along with: the name of one of the bodies, or a satellite of a group (`{ group, index }`).
 *
 * @example
 * ```ts no-run
 * import type { RideTarget } from "@johnmorrisdotca/chikyu-earth/space/element";
 *
 * const targets: RideTarget[] = ["Moon", { group: "stations", index: 0 }];
 * console.log(targets.length);
 * ```
 */
export type RideTarget = BodyName | SatelliteRef;

export interface RideState {
  target: RideTarget;
  /** `from`: the camera is at the body, looking at the Earth. `follow`: the camera keeps a fixed distance from it, looking at it. */
  view: "from" | "follow";
  look: RideLook;
  /** For `follow` a satellite: how far the camera keeps, in kilometres. */
  distanceKm: number;
}

/** The camera as the last draw left it, for the next one to start from when the ride changes. */
export interface Pose {
  p: Vec3;
  q: [number, number, number, number];
  fov: number;
  valid: boolean;
}

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
  /** How the Earth is lit (see `LightMode`); the Sun, the Moon and the planets keep their true places either way. */
  light: LightMode;
  /** How the painter draws the Sun, the planets and their moons (one of its `looks`, or `plain` for the sphere in the right colour); empty for its first. */
  bodies: string;
  /** Filled at each draw. */
  drawn: { frame: Frame; distance: number; radiusPx: number } | null;
  /** What the painter has made now: the Sun and planets with a drawing, and the moons shown (set at each draw). */
  painted: { bodies: number; moons: number };
  /** How many times astronomy-engine has been asked for a frame. */
  lookups: number;
  /** Game seconds a second (the clock's speed). */
  speed: number;
  /** The satellites shown, the one chosen, and what the last draw did with them. */
  satellites: SatelliteState;
  /** The body or satellite the camera rides along with, or null. */
  ride: RideState | null;
  /** Set at each draw: the target of the ride could not be placed (a satellite whose elements are too old, or that is gone), so the ordinary camera was used. */
  rideLost: boolean;
  /** A camera move in progress from where the last draw left it: when it began (ms of the page's clock), how long it takes. */
  transition: { start: number; duration: number; from: { p: Vec3; q: [number, number, number, number]; fov: number } } | null;
  /** The shared controls' view as the last draw used it, and how tall the view was (CSS pixels): `setView` skips a draw for a turn that moves nothing by half a pixel. */
  drawnView: { yaw: number; tilt: number; zoom: number } | null;
  heightPx: number;
  pose: Pose;
  /** Pixels a second that riding makes things move on the screen at 1x clock speed (0 when not riding): the draw rate follows it. */
  rideMotion: number;
  /** The satellite at a point of the view (CSS pixels), within a radius, if a draw has been made and one is there. */
  pick: ((x: number, y: number, radius: number) => SatelliteRef | null) | null;
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
  bodies: "",
  light: "sun",
  drawn: null,
  painted: { bodies: 0, moons: 0 },
  lookups: 0,
  speed: 1,
  ride: null,
  rideLost: false,
  transition: null,
  drawnView: null,
  heightPx: 420,
  pose: { p: [0, 0, 0], q: [0, 0, 0, 1], fov: FOV, valid: false },
  rideMotion: 0,
  satellites: newSatelliteState(),
  pick: null,
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
  /** Told at each draw, after the object is placed and scaled: the direction to the Sun, the moment shown, and how many CSS pixels across its radius the body is (a sharper picture is worth fetching only for a big one). */
  update?(info: { toSun: Vec3; ms: number; radiusPx: number }): void;
  /** True to have the scene turn the object to face the camera (a disc or a glow). */
  billboard?: boolean;
  dispose(): void;
}

/**
 * What the scene tells a painter when it makes a body.
 *
 * @example
 * ```ts no-run
 * import type { PaintContext } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const context: PaintContext = { look: "painted", invalidate: () => undefined, ratio: 2, maxTexture: 2048 };
 * console.log(context.look);
 * ```
 */
export interface PaintContext {
  /** The look asked for: one of the painter's `looks`, or empty for its first. */
  look: string;
  /** Ask for a new draw (a picture has arrived). */
  invalidate(): void;
  /** Device pixels to a CSS pixel. */
  ratio: number;
  /** The widest picture, in pixels, the GPU should be given. */
  maxTexture: number;
}

/**
 * One moon of a planet at a moment: its name, where it is from the planet's centre and how big it is, both in radii of the planet, in scene axes.
 *
 * @example
 * ```ts no-run
 * import type { BodyMoon } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const io: BodyMoon = { name: "Io", offset: [5.9, 0, 0], radius: 0.0255 };
 * console.log(io.name);
 * ```
 */
export interface BodyMoon {
  name: string;
  offset: Readonly<Vec3>;
  radius: number;
}

/**
 * The seam for drawing the Sun, the planets and their moons. The space view places them, sizes them, lights them and labels them; a painter only makes what is drawn at
 * each place. The default (`plainPainter`) is a sphere in the body's colour, and a glow for the Sun. Another package can supply better looking ones:
 * `@johnmorrisdotca/wakusei-planets/painter` draws the real Sun, planets, Pluto and moons.
 * `make` may return a drawing at once or later (a promise); a drawing may update itself and ask for a redraw when a picture arrives. `moons` is optional: the moons the painter can
 * draw for a planet at a moment, which the view shows round the planet when it is near enough to see them. `looks` names what `context.look` may be.
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
  make(three: ThreeParts, name: string, context?: PaintContext): BodyDrawing | Promise<BodyDrawing>;
  moons?(planet: PlanetName, ms: number): readonly BodyMoon[];
  looks?: readonly string[];
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
  /** Where the chosen satellite is on the screen, or null. Called at each draw while a satellite is chosen (and once when it is let go). */
  onSelected?: (place: { x: number; y: number } | null) => void;
  /** Called at the end of a draw while the camera is moving from one ride to another, so the next frame is asked for (at the page's frame cap). */
  onMoving?: () => void;
  /** The target of the ride could not be placed at this draw. */
  onRideLost?: () => void;
  /** The satellites could not be drawn (the three.js parts handed over lack `Points`). */
  onSatellitesError?: (error: unknown) => void;
  /** How the Sun, the planets and their moons are drawn; left out, plain spheres in the right colours (see `BodyPainter`). */
  painter?: BodyPainter;
  /** The painter could not make a body (the three.js parts handed over lack something it needs); the body is drawn plain instead. */
  onPainterError?: (error: unknown) => void;
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
export const plainPainter: { make(three: ThreeParts, name: string): BodyDrawing } & BodyPainter = {
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
      /** The Sun in the Earth's own axes (the surface program finds where a cloud's shadow falls from it). */
      const sunLocal = { value: new three.Vector3(1, 0, 0) };
      const cloudShift = { value: 0 };
      const sunView = { value: new three.Vector3(1, 0, 0) };
      const grid = sphere(three, 96, 48);
      const solid = sphere(three, 48, 24);

      const earthMaterial = new three.ShaderMaterial({
        vertexShader: SURFACE_VERT,
        fragmentShader: SURFACE_FRAG,
        uniforms: { dayMap: uniform.day, nightMap: uniform.night, waterMap: uniform.water, cloudMap: uniform.clouds, sunDir: sunEarth, sunLocal, cloudShift, lights: { value: 1 }, boost: { value: 0 }, ortho: { value: 0 } },
      });
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

      // the Sun, the planets and the moons are made by the painter, one slot each: a slot is filled again when the look changes, and may be filled later (a painter may be slow)
      let ended = false;
      interface Slot {
        name: string;
        drawing: BodyDrawing | undefined;
        look: string | null;
        token: number;
        plain: boolean;
      }
      const newSlot = (name: string): Slot => ({ name, drawing: undefined, look: null, token: 0, plain: false });
      const lookNow = (): string => model.bodies || painter.looks?.[0] || "";
      const empty = (slot: Slot): void => {
        slot.token += 1;
        if (!slot.drawing) return;
        scene.remove(slot.drawing.object);
        slot.drawing.dispose();
        slot.drawing = undefined;
      };
      const fill = (slot: Slot, isMoon = false): void => {
        const look = lookNow();
        if (slot.look === look) return;
        empty(slot);
        slot.look = look;
        const token = slot.token;
        const arrive = (made: BodyDrawing): void => {
          if (ended || slot.token !== token) {
            made.dispose();
            return;
          }
          slot.drawing = made;
          scene.add(made.object);
          deps.invalidate();
        };
        const fail = (error: unknown): void => {
          if (ended || slot.token !== token) return;
          deps.onPainterError?.(error);
          if (!isMoon && !slot.plain) {
            slot.plain = true;
            slot.look = null;
            fill(slot);
          }
        };
        try {
          const made = (slot.plain || look === "plain" ? plainPainter : painter).make(three, slot.name, { look, invalidate: () => deps.invalidate(), ratio: model.ratio(), maxTexture: deps.cap() });
          if (typeof (made as Promise<BodyDrawing>).then === "function") (made as Promise<BodyDrawing>).then(arrive, fail);
          else arrive(made as BodyDrawing);
        } catch (error) {
          fail(error);
        }
      };
      const sunSlot = newSlot("Sun");
      type Planet = { slot: Slot; orbit: THREE.LineLoop; positions: Float32Array; samples: Vec3[]; epoch: number; toSun: Vec3 };
      const planets = new Map<PlanetName, Planet>();
      for (const name of PLANETS) {
        const positions = new Float32Array(96 * 3);
        const lineGeometry = new three.BufferGeometry();
        lineGeometry.setAttribute("position", new three.BufferAttribute(positions, 3));
        const orbit = new three.LineLoop(lineGeometry, new three.LineBasicMaterial({ color: ORBIT_COLORS[name], transparent: true, opacity: 0.7 }));
        orbit.frustumCulled = false;
        scene.add(orbit);
        planets.set(name, { slot: newSlot(name), orbit, positions, samples: [], epoch: Number.NaN, toSun: [1, 0, 0] });
      }
      const moonSlots = new Map<string, { slot: Slot; seen: number }>();
      let releaseTimer: ReturnType<typeof setTimeout> | undefined;

      let layer: SatelliteLayer | undefined;
      const rideState = new Float64Array(6);
      let selectedShown = false;
      const camera = new three.PerspectiveCamera(FOV, width / Math.max(1, height), 0.05, 1000);
      const target = new three.Vector3();
      const desiredQ = camera.quaternion.clone();
      const fromQ = camera.quaternion.clone();
      const projected = new three.Vector3();

      const placeAll = (at: Frame): Record<BodyName, Vec3> => {
        const sunAt = placeSun(model.mode, at.sun);
        const all = { Earth: [0, 0, 0] as Vec3, Moon: placeMoon(model.mode, at.moon), Sun: sunAt } as Record<BodyName, Vec3>;
        for (const name of PLANETS) all[name] = placeAround(model.mode, sunAt, [at.planets[name][0] - at.sun[0], at.planets[name][1] - at.sun[1], at.planets[name][2] - at.sun[2]]);
        return all;
      };
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
          {
            // the Earth is turned about the y axis by spin + 90 degrees: the Sun in its own axes is turned back by as much
            const back = -(frame.spin + 90) * RAD;
            sunLocal.value.set(toSun[0] * Math.cos(back) + toSun[2] * Math.sin(back), toSun[1], -toSun[0] * Math.sin(back) + toSun[2] * Math.cos(back));
          }
          cloudShift.value = -(((model.time / 3_600_000) * 1.5) % 360) / 360;
          earthMaterial.uniforms["lights"]!.value = model.light === "lit" ? 0 : 1;
          earthMaterial.uniforms["boost"]!.value = model.light === "boost" ? 1 : 0;

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
          fill(sunSlot);
          const sunDrawing = sunSlot.drawing;
          if (sunDrawing) {
            sunDrawing.object.position.set(sunPos[0], sunPos[1], sunPos[2]);
            sunDrawing.object.scale.setScalar(radiusOf("Sun"));
            if (sunDrawing.billboard) sunDrawing.object.quaternion.copy(camera.quaternion);
          }
          for (const name of PLANETS) {
            const p = planets.get(name)!;
            fill(p.slot);
            p.toSun = unit([frame.sun[0] - frame.planets[name][0], frame.sun[1] - frame.planets[name][1], frame.sun[2] - frame.planets[name][2]]);
            if (p.slot.drawing) {
              p.slot.drawing.object.position.set(pos[name][0], pos[name][1], pos[name][2]);
              p.slot.drawing.object.scale.setScalar(radiusOf(name));
              p.slot.drawing.light?.(p.toSun);
            }
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

          if (!layer && model.satellites.groups.size > 0) {
            try {
              layer = createSatelliteLayer(three, scene, model.satellites, model.ratio);
            } catch (error) {
              model.satellites.groups.clear();
              deps.onSatellitesError?.(error);
            }
          }
          layer?.update(model.time, model.speed);
          model.pick = layer ? (x, y, radius) => layer!.pick(x, y, camera, size, radius) : null;

          // the camera: looks at the focus body from the direction the sky was in when it was last moved, turned by yaw and tilt, as far as the zoom says; or, riding along, sits at the
          // body and looks at the Earth
          let focus: BodyName = model.focus;
          let focusPos: Vec3 = pos[focus];
          let focusRadius = radiusOf(focus);
          let rideFrom: { position: Vec3; velocity: Vec3; hidden: BodyName | null; gameSeconds: number } | null = null;
          model.rideLost = false;
          model.rideMotion = 0;
          const ride = model.ride;
          if (ride) {
            if (typeof ride.target === "string") {
              if (ride.view === "follow") {
                focus = ride.target;
                focusPos = pos[focus];
                focusRadius = radiusOf(focus);
              } else {
                const ends = track.ends();
                const was = ends ? placeAll(ends[0])[ride.target] : pos[ride.target];
                const will = ends ? placeAll(ends[1])[ride.target] : pos[ride.target];
                const seconds = ends ? Math.max(1e-3, (ends[1].ms - ends[0].ms) / 1000) : 1;
                rideFrom = { position: pos[ride.target], velocity: [will[0] - was[0], will[1] - was[1], will[2] - was[2]], hidden: ride.target, gameSeconds: seconds };
              }
            } else if (layer?.exact(ride.target, model.time, rideState)) {
              const place: Vec3 = [rideState[0]!, rideState[1]!, rideState[2]!];
              if (ride.view === "follow") {
                focusPos = place;
                focusRadius = Math.max(1e-4, ride.distanceKm / 6371 / FIT_DISTANCE);
              } else rideFrom = { position: place, velocity: [rideState[3]!, rideState[4]!, rideState[5]!], hidden: null, gameSeconds: 0 };
            } else model.rideLost = true;
          }
          const hidden = rideFrom?.hidden ?? null;
          moon.visible = hidden !== "Moon";
          if (sunDrawing) sunDrawing.object.visible = hidden !== "Sun";
          for (const [name, p] of planets) if (p.slot.drawing) p.slot.drawing.object.visible = hidden !== name;

          let fovNow = FOV;
          let distance = 0;
          if (rideFrom) {
            const pose = ridePose({ position: rideFrom.position, velocity: rideFrom.velocity, look: ride!.look, yaw: model.view.yaw, tilt: model.view.tilt, zoom: model.view.zoom });
            camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
            camera.up.set(pose.up[0], pose.up[1], pose.up[2]);
            camera.lookAt(pose.position[0] + pose.forward[0], pose.position[1] + pose.forward[1], pose.position[2] + pose.forward[2]);
            fovNow = pose.fov;
            const away = Math.hypot(...rideFrom.position);
            camera.near = Math.max(0.0008, Math.min(0.05, (away - 1) * 0.1));
            camera.far = Math.max(2000, 400 + (mode === "true" ? 40 * 23_481 : 0));
            // how fast the ground goes by under the camera, in pixels a second at 1x: the speed over the height for a satellite, the turn of the direction to the Earth for a body
            const focal = (size.height / 2) / Math.tan((fovNow / 2) * RAD);
            const speed = Math.hypot(...rideFrom.velocity);
            model.rideMotion = typeof ride!.target === "string" ? ((speed / Math.max(1e-9, away)) / rideFrom.gameSeconds) * focal : (speed / Math.max(50, (away - 1) * 6371)) * focal;
          } else {
            const spin = model.cameraSpin ?? frame.spin;
            // behind a satellite the Earth is the far side of what the camera looks at, so it moves with the camera's side-step; the view is mirrored for the ground to follow the pointer
            const way = ride && ride.view === "follow" && typeof ride.target !== "string" ? -1 : 1;
            const lon = model.centre.lon - way * model.view.yaw;
            const lat = Math.max(-90, Math.min(90, model.centre.lat - way * model.view.tilt));
            const aim = direction(spin + lon, lat);
            distance = Math.max(1.05 * focusRadius, (FIT_DISTANCE * focusRadius) / Math.max(1e-9, model.view.zoom));
            target.set(focusPos[0], focusPos[1], focusPos[2]);
            camera.position.set(target.x + aim[0] * distance, target.y + aim[1] * distance, target.z + aim[2] * distance);
            camera.up.set(0, 1, 0);
            camera.lookAt(target);
            camera.near = Math.max(0.0005, distance * 0.02 - focusRadius * 0.5, focusRadius * 0.01);
            camera.far = Math.max(2000, distance * 4 + (mode === "true" ? 40 * 23_481 : 400));
            if (ride && ride.view === "follow" && typeof ride.target !== "string") {
              const focal = (size.height / 2) / Math.tan((fovNow / 2) * RAD);
              model.rideMotion = (Math.hypot(rideState[3]!, rideState[4]!, rideState[5]!) / Math.max(50, ride.distanceKm / Math.max(1e-9, model.view.zoom))) * focal;
            }
          }

          // a ride that changed: glide from where the last draw left the camera (a jump for a reader who asked for reduced motion; the element does not start one then)
          const glide = model.transition;
          if (glide) {
            const k = Math.min(1, (performance.now() - glide.start) / glide.duration);
            const ease = k * k * (3 - 2 * k);
            desiredQ.copy(camera.quaternion);
            camera.position.set(glide.from.p[0] + (camera.position.x - glide.from.p[0]) * ease, glide.from.p[1] + (camera.position.y - glide.from.p[1]) * ease, glide.from.p[2] + (camera.position.z - glide.from.p[2]) * ease);
            fromQ.set(glide.from.q[0], glide.from.q[1], glide.from.q[2], glide.from.q[3]);
            camera.quaternion.copy(fromQ.slerp(desiredQ, ease));
            fovNow = glide.from.fov + (fovNow - glide.from.fov) * ease;
            if (k >= 1) model.transition = null;
          }
          camera.fov = fovNow;
          camera.aspect = size.width / Math.max(1, size.height);
          camera.updateProjectionMatrix();
          camera.updateMatrixWorld();
          // always lit: the light comes from the camera's side of the Earth (the Sun, Moon and planets stay where they are)
          if (model.light === "lit") sunEarth.value.set(camera.position.x, camera.position.y, camera.position.z).normalize();
          sunView.value.copy(sunEarth.value).transformDirection(camera.matrixWorldInverse);
          const pose = model.pose;
          pose.p[0] = camera.position.x;
          pose.p[1] = camera.position.y;
          pose.p[2] = camera.position.z;
          pose.q[0] = camera.quaternion.x;
          pose.q[1] = camera.quaternion.y;
          pose.q[2] = camera.quaternion.z;
          pose.q[3] = camera.quaternion.w;
          pose.fov = fovNow;
          pose.valid = true;
          model.drawnView = { yaw: model.view.yaw, tilt: model.view.tilt, zoom: model.view.zoom };
          model.heightPx = size.height;

          // how many pixels across each body is: for the pictures the Earth and the Moon need, and for what is chosen
          const half = Math.tan((fovNow / 2) * RAD);
          const radiusPxOf = (name: BodyName): number => {
            const d = Math.hypot(pos[name][0] - camera.position.x, pos[name][1] - camera.position.y, pos[name][2] - camera.position.z);
            const r = radiusOf(name);
            return d <= r * 1.001 ? 1e5 : ((size.height / 2) * (r / Math.sqrt(d * d - r * r))) / half;
          };
          const px = {} as Record<BodyName, number>;
          for (const name of BODY_NAMES) px[name] = radiusPxOf(name);
          model.drawn = { frame, distance, radiusPx: px.Earth };
          let paintedBodies = sunSlot.drawing ? 1 : 0;
          for (const p of planets.values()) if (p.slot.drawing) paintedBodies += 1;
          let paintedMoons = 0;
          for (const held of moonSlots.values()) if (held.slot.drawing?.object.visible) paintedMoons += 1;
          model.painted = { bodies: paintedBodies, moons: paintedMoons };
          const sunToSun = unit([-frame.sun[0], -frame.sun[1], -frame.sun[2]]);
          sunDrawing?.update?.({ toSun: sunToSun, ms: model.time, radiusPx: px.Sun });
          for (const name of PLANETS) {
            const p = planets.get(name)!;
            p.slot.drawing?.update?.({ toSun: p.toSun, ms: model.time, radiusPx: px[name] });
          }
          if (painter.moons && lookNow() !== "plain") {
            const now = performance.now();
            const seen = new Set<string>();
            for (const name of PLANETS) {
              const p = planets.get(name)!;
              const planet = p.slot.drawing;
              if (!planet || !planet.object.visible || px[name] < MOON_MIN_PLANET_PX) continue;
              const radius = radiusOf(name);
              for (const site of painter.moons(name, model.time)) {
                const at: Vec3 = [pos[name][0] + site.offset[0] * radius, pos[name][1] + site.offset[1] * radius, pos[name][2] + site.offset[2] * radius];
                projected.set(at[0], at[1], at[2]).project(camera);
                if (projected.z > 1 || Math.abs(projected.x) > 1.25 || Math.abs(projected.y) > 1.25) continue;
                let held = moonSlots.get(site.name);
                if (!held) moonSlots.set(site.name, (held = { slot: newSlot(site.name), seen: now }));
                held.seen = now;
                seen.add(site.name);
                fill(held.slot, true);
                const drawing = held.slot.drawing;
                if (!drawing) continue;
                const away = Math.hypot(at[0] - camera.position.x, at[1] - camera.position.y, at[2] - camera.position.z);
                const drawn = Math.max(site.radius * radius, (away * half * MOON_MIN_PX) / (size.height / 2));
                drawing.object.visible = true;
                drawing.object.position.set(at[0], at[1], at[2]);
                drawing.object.scale.setScalar(drawn);
                const moonPx = away <= drawn * 1.001 ? 1e5 : ((size.height / 2) * (drawn / Math.sqrt(away * away - drawn * drawn))) / half;
                drawing.light?.(p.toSun);
                drawing.update?.({ toSun: p.toSun, ms: model.time, radiusPx: moonPx });
              }
            }
            let soonest = Number.POSITIVE_INFINITY;
            for (const [key, held] of moonSlots) {
              if (seen.has(key)) continue;
              if (held.slot.drawing) held.slot.drawing.object.visible = false;
              if (now - held.seen > MOON_KEEP_MS) {
                empty(held.slot);
                moonSlots.delete(key);
              } else soonest = Math.min(soonest, held.seen + MOON_KEEP_MS - now);
            }
            // a view that is at rest draws nothing, so a moon that has gone from the view would be kept for ever: ask for one more draw when the first of them is due to be let go
            if (releaseTimer !== undefined) clearTimeout(releaseTimer);
            releaseTimer = soonest < Number.POSITIVE_INFINITY ? setTimeout(() => deps.invalidate(), soonest + 50) : undefined;
          }
          const ratio = model.ratio();
          const earthPx = Math.min(px.Earth, 1e5) * ratio;
          textures.sync({ day: earthPx, night: earthPx, clouds: earthPx, water: earthPx, moon: Math.min(px.Moon, 1e5) * ratio });
          if (deps.onLabels && model.labels) {
            const places = {} as Record<BodyName, BodyPlace | null>;
            for (const name of BODY_NAMES) {
              const at = name === hidden || (rideFrom && name === "Earth") ? null : labelFor(pos[name]);
              places[name] = at ? { x: at.x, y: at.y, r: px[name] } : null;
            }
            deps.onLabels(places);
          }
          if (layer && deps.onSelected) {
            const at = model.satellites.selected ? layer.place(camera, size) : null;
            if (at || selectedShown) deps.onSelected(at);
            selectedShown = at !== null;
          }
          if (model.rideLost) deps.onRideLost?.();
          if (model.transition) deps.onMoving?.();
          return false;
        },
        resize(w, h) {
          size = { width: w, height: h };
        },
        dispose() {
          if (releaseTimer !== undefined) clearTimeout(releaseTimer);
          layer?.dispose();
          model.pick = null;
          textures.dispose();
          ended = true;
          empty(sunSlot);
          for (const held of moonSlots.values()) empty(held.slot);
          moonSlots.clear();
          for (const p of planets.values()) {
            empty(p.slot);
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
