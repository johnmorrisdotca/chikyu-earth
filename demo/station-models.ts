// Made-up stand-ins for the demo's followed satellites, drawn from boxes and cylinders: a page supplies its own models (the package ships none), and this is the shape of one. Each is a drawing of radius 1 with its long axis along +x
// (the way the satellite flies) and its top along +z; `light` turns the Sun's direction into the model's own axes and aims one light at it. Not a picture of the real satellites: a sketch of where their parts are.
import type { BufferGeometry, DirectionalLight, Group, MeshLambertMaterial } from "three";
import type { SatellitePainter } from "../src/space/index.ts";

type Three = typeof import("three");

const ISS = 25544;
const TIANGONG = 48274;
const HUBBLE = 20580;

/** The parts of three.js these models use, which the demo's subset (three-subset.ts) holds. */
function parts(three: Three, build: (add: (geometry: BufferGeometry, colour: number, at: [number, number, number], spin?: [number, number, number]) => void) => void): { object: Group; dispose(): void; light(toSun: readonly [number, number, number]): void } {
  const group = new three.Group();
  const materials: MeshLambertMaterial[] = [];
  const geometries: BufferGeometry[] = [];
  build((geometry, colour, at, spin = [0, 0, 0]) => {
    const material = new three.MeshLambertMaterial({ color: colour });
    const mesh = new three.Mesh(geometry, material);
    mesh.position.set(at[0], at[1], at[2]);
    mesh.rotation.set(spin[0], spin[1], spin[2]);
    group.add(mesh);
    materials.push(material);
    geometries.push(geometry);
  });
  const sun: DirectionalLight = new three.DirectionalLight(0xfff4e0, 3.2);
  const fill = new three.AmbientLight(0x6f86a8, 0.9);
  group.add(sun, fill);
  return {
    object: group,
    light(toSun) {
      // the scene gave the Sun's direction in its own axes, and set the model's matrix: the model's axes are that matrix's columns, so the direction in the model is the dot with each
      const m = group.matrix.elements;
      const scale = Math.hypot(m[0]!, m[1]!, m[2]!) || 1;
      const x = (m[0]! * toSun[0] + m[1]! * toSun[1] + m[2]! * toSun[2]) / scale;
      const y = (m[4]! * toSun[0] + m[5]! * toSun[1] + m[6]! * toSun[2]) / scale;
      const z = (m[8]! * toSun[0] + m[9]! * toSun[1] + m[10]! * toSun[2]) / scale;
      sun.position.set(x, y, z);
    },
    dispose() {
      for (const material of materials) material.dispose();
      for (const geometry of geometries) geometry.dispose();
      sun.dispose?.();
    },
  };
}

/** The demo's three stand-ins: the ISS (a row of modules, the long truss across them and four pairs of panels), Tiangong (a T of modules with two big wings each) and Hubble (a tube with a door and two small wings). */
export const stationModels: SatellitePainter = {
  has: (norad) => norad === ISS || norad === TIANGONG || norad === HUBBLE,
  make(three, norad) {
    const t = three as unknown as Three;
    const box = (x: number, y: number, z: number): BufferGeometry => new t.BoxGeometry(x, y, z);
    const tube = (radius: number, length: number): BufferGeometry => new t.CylinderGeometry(radius, radius, length, 20);
    const half = Math.PI / 2;
    if (norad === ISS) {
      return parts(t, (add) => {
        add(tube(0.07, 0.8), 0xd9dde3, [0, 0, 0], [0, 0, half]);
        add(tube(0.05, 0.45), 0xc8ccd2, [0.05, 0, 0.09], [0, 0, half]);
        add(box(0.05, 1.7, 0.05), 0xb7bcc4, [-0.2, 0, 0]);
        for (const y of [-0.8, -0.55, 0.55, 0.8]) for (const x of [-0.32, -0.08]) add(box(0.22, 0.2, 0.012), 0x274a8c, [x, y, 0]);
        add(box(0.3, 0.05, 0.012), 0xd0d4da, [0.1, 0, -0.1]);
      });
    }
    if (norad === TIANGONG) {
      return parts(t, (add) => {
        add(tube(0.09, 0.95), 0xe1e3e6, [0, 0, 0], [0, 0, half]);
        add(tube(0.075, 0.55), 0xd3d6da, [0.1, 0, 0], [half, 0, 0]);
        for (const y of [-0.62, 0.62]) add(box(0.5, 0.36, 0.012), 0x23478a, [0.1, y, 0]);
        for (const y of [-0.3, 0.3]) add(box(0.28, 0.16, 0.012), 0x23478a, [-0.35, y, 0]);
      });
    }
    return parts(t, (add) => {
      add(tube(0.15, 0.95), 0xc4c7cc, [0, 0, 0], [0, 0, half]);
      add(tube(0.17, 0.12), 0x30343b, [0.5, 0, 0], [0, 0, half]);
      add(tube(0.12, 0.3), 0xa9acb2, [-0.55, 0, 0], [0, 0, half]);
      for (const y of [-0.38, 0.38]) add(box(0.34, 0.5, 0.01), 0x1f3f7a, [-0.05, y, 0]);
    });
  },
};
