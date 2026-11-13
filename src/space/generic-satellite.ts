// A small drawing of a satellite for a ride that sees it from outside when the page has no model of its own (`setSatellitePainter`): our own boxes and cylinders, a bus with two solar panels, and a dish for a communications satellite.
// It is a sketch of the kind of thing, not a picture of any real one, and it is drawn far larger than the satellite is (a few metres): not to scale.
import type * as THREE from "three";
import type { BodyDrawing } from "./scene.ts";

/**
 * What a generic drawing shows: `bus` a box with two framed solar panels, `communications` the same with a dish on its nadir face, `flat` a flat body with one long framed panel (the shape of a large constellation's satellites), `station` a row of modules with a truss and panels, `cubesat` a slim box (a 3U, three times as long as it is wide) with short deployed panels.
 *
 * @example
 * ```ts
 * import type { SatelliteKind } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const kinds: SatelliteKind[] = ["bus", "communications", "flat", "station", "cubesat"];
 * console.log(kinds.length);
 * ```
 */
export type SatelliteKind = "bus" | "communications" | "flat" | "station" | "cubesat";

const COMMS = /(INTELSAT|SES-|EUTELSAT|ASTRA|ECHOSTAR|DIRECTV|TELSTAR|GALAXY|YAMAL|THURAYA|INMARSAT|IRIDIUM|GLOBALSTAR|ORBCOMM|TDRS|VIASAT|ANIK|SKYNET|MILSTAR|SAT-|SATCOM|COMSAT|OPTUS|JCSAT|SUPERBIRD|HISPASAT|ARABSAT|NILESAT|TURKSAT|KOREASAT|ASIASAT|APSTAR|EXPRESS|BADR)/i;

/**
 * Which kind of drawing a satellite gets, from its name: a large constellation (`STARLINK`, `ONEWEB`, `KUIPER`) is `flat`, a cubesat (`FLOCK`, `DOVE`, `LEMUR`, `SPIRE` and similar names) is `cubesat`, a station (`ISS`, `ZARYA`, `TIANGONG`, `CSS`) is `station`, a communications satellite (by the common operators' names) has a dish, and anything else is a plain `bus`.
 *
 * @param name - The satellite's name (the element set's `OBJECT_NAME`).
 * @returns The kind.
 *
 * @example
 * ```ts
 * import { satelliteKind } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * console.log(satelliteKind("STARLINK-1007"), satelliteKind("ISS (ZARYA)"), satelliteKind("INTELSAT 39"), satelliteKind("NOAA 19"));
 * ```
 */
export function satelliteKind(name: string): SatelliteKind {
  if (/^(STARLINK|ONEWEB|KUIPER)/i.test(name)) return "flat";
  if (/^(FLOCK|DOVE|LEMUR|SPIRE|SWARM|CUBESAT|ARKYD|CP-?\d|AAUSAT|UNISAT|GOMX|GOMSPACE)|CUBESAT|\b3U\b/i.test(name)) return "cubesat";
  if (/(ISS|ZARYA|TIANGONG|CSS|TIANHE|WENTIAN|MENGTIAN)/i.test(name)) return "station";
  if (COMMS.test(name)) return "communications";
  return "bus";
}

/** How bright the Sun is on a generic drawing. */
export const SUN_INTENSITY = 3.2;

/**
 * A generic satellite as a drawing of radius 1 about the origin, its long axis along +x (the way it flies), its top along +z and its left along +y, the family's convention for a model, with its own light that `light(toSun)` turns to the Sun. One group of a few meshes, made once and disposed with `dispose`.
 *
 * @param three - three.js (the parts the demo's subset holds: `Group`, `Mesh`, `BoxGeometry`, `CylinderGeometry`, `MeshLambertMaterial`, `DirectionalLight`, `AmbientLight`).
 * @param kind - What to draw.
 * @param shared - A Sun light the scene owns (`{ sun }`), in the scene's own axes: the drawing then makes none of its own and `light` points that one. A scene with the light always in it keeps the same number of lights whether or not a drawing is shown, so three keeps one program for each material, not one for each state of the lights.
 * @returns The drawing, with `light` and `dispose`.
 *
 * @example
 * ```ts no-run
 * import { genericSatellite } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const three = await import("three");
 * const drawing = genericSatellite(three, "communications");
 * console.log(drawing.object.children.length);
 * drawing.dispose();
 * ```
 */
export function genericSatellite(three: typeof THREE, kind: SatelliteKind, shared?: { sun: THREE.DirectionalLight }): BodyDrawing {
  const group = new three.Group();
  const materials: THREE.MeshLambertMaterial[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const half = Math.PI / 2;
  const add = (geometry: THREE.BufferGeometry, colour: number, at: [number, number, number], spin: [number, number, number] = [0, 0, 0]): void => {
    const material = new three.MeshLambertMaterial({ color: colour });
    const mesh = new three.Mesh(geometry, material);
    mesh.position.set(at[0], at[1], at[2]);
    mesh.rotation.set(spin[0], spin[1], spin[2]);
    group.add(mesh);
    materials.push(material);
    geometries.push(geometry);
  };
  const box = (x: number, y: number, z: number): THREE.BufferGeometry => new three.BoxGeometry(x, y, z);
  const tube = (radius: number, length: number): THREE.BufferGeometry => new three.CylinderGeometry(radius, radius, length, 16);
  /**
   * A thin solar panel with a frame: `w` across (along x) and `l` long (along y) with its middle at `y`; a light frame round a darker plate of cells, a hair apart, so it reads as a panel and not a slab. Every part lies in the panel's own box.
   */
  const panel = (w: number, l: number, y: number, x = 0, z = 0): void => {
    const edge = 0.022;
    const thick = 0.014;
    add(box(w, l - 2 * edge, 0.008), 0x1d3d78, [x, y, z]);
    add(box(w, edge, thick), 0xb4b9c2, [x, y - (l - edge) / 2, z]);
    add(box(w, edge, thick), 0xb4b9c2, [x, y + (l - edge) / 2, z]);
    add(box(edge, l, thick), 0xb4b9c2, [x - (w - edge) / 2, y, z]);
    add(box(edge, l, thick), 0xb4b9c2, [x + (w - edge) / 2, y, z]);
  };
  if (kind === "flat") {
    // a flat-pack body (a few metres across, a few centimetres thick) with its one long array and a small antenna panel
    add(box(0.52, 0.34, 0.04), 0xcfd3d9, [0, 0, 0]);
    add(box(0.3, 0.2, 0.012), 0x8e939b, [0.04, 0, -0.026]);
    add(box(0.05, 0.05, 0.05), 0x4a4f58, [-0.18, 0, 0.045]);
    add(box(0.03, 0.2, 0.015), 0xb4b9c2, [0, 0.27, 0]);
    panel(0.4, 0.6, 0.57);
  } else if (kind === "station") {
    // a row of modules, the truss across them and two panels at each end of it
    add(tube(0.07, 0.8), 0xd9dde3, [0, 0, 0], [0, 0, half]);
    add(tube(0.05, 0.4), 0xc8ccd2, [0.1, 0, 0.09], [0, 0, half]);
    add(box(0.05, 1.7, 0.05), 0xb7bcc4, [-0.2, 0, 0]);
    for (const y of [-0.78, 0.78]) {
      panel(0.22, 0.24, y, -0.27);
      panel(0.22, 0.24, y, -0.05);
    }
  } else if (kind === "cubesat") {
    // a 3U: three times as long as it is wide, with a short panel deployed on each side
    add(box(0.78, 0.26, 0.26), 0xbfc3ca, [0, 0, 0]);
    add(box(0.8, 0.28, 0.02), 0x2a2d33, [0, 0, 0.14]);
    add(box(0.02, 0.28, 0.28), 0x2a2d33, [0.4, 0, 0]);
    add(box(0.2, 0.2, 0.02), 0x5a606b, [-0.1, 0, -0.14]);
    for (const side of [-1, 1]) {
      add(box(0.03, 0.12, 0.012), 0xb4b9c2, [0, side * 0.19, 0]);
      panel(0.5, 0.34, side * 0.4);
    }
  } else {
    // a bus: a body with a pale radiator plate on its top face, a camera on its nadir face, two booms and two framed panels
    add(box(0.46, 0.36, 0.36), 0xc9a24a, [0, 0, 0]);
    add(box(0.44, 0.34, 0.012), 0xe2e4e8, [0, 0, 0.186]);
    add(box(0.47, 0.37, 0.07), 0x8a6d2a, [0, 0, -0.1]);
    add(tube(0.06, 0.1), 0x30343b, [0.1, 0, -0.24], [half, 0, 0]);
    add(box(0.06, 0.06, 0.06), 0x4a4f58, [-0.16, 0, 0.21]);
    for (const side of [-1, 1]) {
      add(box(0.03, 0.2, 0.02), 0xb4b9c2, [0, side * 0.28, 0]);
      panel(0.38, 0.54, side * 0.67);
    }
    if (kind === "communications") {
      // the dish on the nadir face, on a short mast, and a small horn beside it
      add(tube(0.025, 0.14), 0xb4b9c2, [0, 0, -0.25], [half, 0, 0]);
      add(new three.CylinderGeometry(0.24, 0.03, 0.09, 24), 0xe8eaee, [0, 0, -0.34], [half, 0, 0]);
      add(box(0.06, 0.06, 0.1), 0xb4b9c2, [-0.2, 0, -0.26]);
    }
  }
  const own = shared ? null : new three.DirectionalLight(0xfff4e0, SUN_INTENSITY);
  const sun = shared?.sun ?? own!;
  group.add(new three.AmbientLight(0x6f86a8, 0.9));
  if (own) group.add(own);
  return {
    object: group,
    light(toSun) {
      if (shared) {
        // the scene's light lives in the scene's axes, where the Sun's direction is already: point it and switch it on (the scene switches it off when no drawing is shown)
        sun.position.set(toSun[0], toSun[1], toSun[2]);
        sun.intensity = SUN_INTENSITY;
        return;
      }
      // the model's axes are the columns of the matrix the view set: the direction to the Sun in them is the dot with each
      const m = group.matrix.elements;
      const length = Math.hypot(m[0]!, m[1]!, m[2]!) || 1;
      sun.position.set((m[0]! * toSun[0] + m[1]! * toSun[1] + m[2]! * toSun[2]) / length, (m[4]! * toSun[0] + m[5]! * toSun[1] + m[6]! * toSun[2]) / length, (m[8]! * toSun[0] + m[9]! * toSun[1] + m[10]! * toSun[2]) / length);
    },
    dispose() {
      for (const material of materials) material.dispose();
      for (const geometry of geometries) geometry.dispose();
      own?.dispose?.();
    },
  };
}
