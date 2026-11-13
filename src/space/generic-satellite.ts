// A small drawing of a satellite for a ride that sees it from outside when the page has no model of its own (`setSatellitePainter`): our own boxes and cylinders, a bus with two solar panels, and a dish for a communications satellite.
// It is a sketch of the kind of thing, not a picture of any real one, and it is drawn far larger than the satellite is (a few metres): not to scale.
import type * as THREE from "three";
import type { BodyDrawing } from "./scene.ts";

/**
 * What a generic drawing shows: `bus` a box with two solar panels, `communications` the same with a dish on its nadir face, `flat` a flat panel with one long solar array (the shape of a large constellation's satellites), `station` a row of modules with a truss and panels.
 *
 * @example
 * ```ts
 * import type { SatelliteKind } from "@johnmorrisdotca/chikyu-earth/space";
 *
 * const kinds: SatelliteKind[] = ["bus", "communications", "flat", "station"];
 * console.log(kinds.length);
 * ```
 */
export type SatelliteKind = "bus" | "communications" | "flat" | "station";

const COMMS = /(INTELSAT|SES-|EUTELSAT|ASTRA|ECHOSTAR|DIRECTV|TELSTAR|GALAXY|YAMAL|THURAYA|INMARSAT|IRIDIUM|GLOBALSTAR|ORBCOMM|TDRS|VIASAT|ANIK|SKYNET|MILSTAR|SAT-|SATCOM|COMSAT|OPTUS|JCSAT|SUPERBIRD|HISPASAT|ARABSAT|NILESAT|TURKSAT|KOREASAT|ASIASAT|APSTAR|EXPRESS|BADR)/i;

/**
 * Which kind of drawing a satellite gets, from its name: a large constellation (`STARLINK`, `ONEWEB`, `KUIPER`) is `flat`, a station (`ISS`, `ZARYA`, `TIANGONG`, `CSS`) is `station`, a communications satellite (by the common operators' names) has a dish, and anything else is a plain `bus`.
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
  if (/(ISS|ZARYA|TIANGONG|CSS|TIANHE|WENTIAN|MENGTIAN)/i.test(name)) return "station";
  if (COMMS.test(name)) return "communications";
  return "bus";
}

/**
 * A generic satellite as a drawing of radius 1 about the origin, its long axis along +x (the way it flies), its top along +z and its left along +y, the family's convention for a model, with its own light that `light(toSun)` turns to the Sun. One group of a few meshes, made once and disposed with `dispose`.
 *
 * @param three - three.js (the parts the demo's subset holds: `Group`, `Mesh`, `BoxGeometry`, `CylinderGeometry`, `MeshLambertMaterial`, `DirectionalLight`, `AmbientLight`).
 * @param kind - What to draw.
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
export function genericSatellite(three: typeof THREE, kind: SatelliteKind): BodyDrawing {
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
  if (kind === "flat") {
    add(box(0.5, 0.36, 0.03), 0xd7dadf, [0, 0, 0]);
    add(box(0.5, 1.1, 0.01), 0x1f3f7a, [0, 0.74, 0]);
  } else if (kind === "station") {
    add(tube(0.07, 0.8), 0xd9dde3, [0, 0, 0], [0, 0, half]);
    add(box(0.05, 1.7, 0.05), 0xb7bcc4, [-0.2, 0, 0]);
    for (const y of [-0.75, 0.75]) add(box(0.3, 0.3, 0.012), 0x274a8c, [-0.2, y, 0]);
  } else {
    add(box(0.5, 0.4, 0.4), 0xd7b35a, [0, 0, 0]);
    for (const y of [-1, 1]) {
      add(box(0.18, 0.04, 0.04), 0xb7bcc4, [0, y * 0.4, 0]);
      add(box(0.36, 0.52, 0.012), 0x1f3f7a, [0, y * 0.72, 0]);
    }
    if (kind === "communications") {
      add(tube(0.05, 0.14), 0xb7bcc4, [0.1, 0, 0.27]);
      add(new three.CylinderGeometry(0.2, 0.02, 0.1, 20), 0xe8eaee, [0.1, 0, 0.36]);
    }
  }
  const sun = new three.DirectionalLight(0xfff4e0, 3.2);
  group.add(sun, new three.AmbientLight(0x6f86a8, 0.9));
  return {
    object: group,
    light(toSun) {
      // the model's axes are the columns of the matrix the view set: the direction to the Sun in them is the dot with each
      const m = group.matrix.elements;
      const length = Math.hypot(m[0]!, m[1]!, m[2]!) || 1;
      sun.position.set((m[0]! * toSun[0] + m[1]! * toSun[1] + m[2]! * toSun[2]) / length, (m[4]! * toSun[0] + m[5]! * toSun[1] + m[6]! * toSun[2]) / length, (m[8]! * toSun[0] + m[9]! * toSun[1] + m[10]! * toSun[2]) / length);
    },
    dispose() {
      for (const material of materials) material.dispose();
      for (const geometry of geometries) geometry.dispose();
      sun.dispose?.();
    },
  };
}
