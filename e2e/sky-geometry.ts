// The Earth in a picture, worked out from the camera alone, for the tests of the sky: not from what is drawn.
import { AIR_THICKNESS_DEFAULT, airTop } from "../src/realistic/air.ts";

export interface Camera {
  position: number[];
  quaternion: number[];
  fov: number;
}

/** Whether a point of the picture shows the Earth with its air, from the camera alone: the ray through it is within the angular radius of the air's top (the sine of which is its radius over the camera's distance from the centre, in Earth radii), less `margin` of it (a line is a pixel wide and drawn with antialiasing, so a pixel of it or two beside the edge is not on the Earth). */
export function onEarth(camera: Camera, width: number, height: number, x: number, y: number, margin = 0.985): boolean {
  const reach = Math.tan((camera.fov * Math.PI) / 360);
  const local = [((x / width) * 2 - 1) * reach * (width / height), (1 - (y / height) * 2) * reach, -1];
  const [qx, qy, qz, qw] = camera.quaternion as [number, number, number, number];
  const tx = 2 * (qy * local[2]! - qz * local[1]!);
  const ty = 2 * (qz * local[0]! - qx * local[2]!);
  const tz = 2 * (qx * local[1]! - qy * local[0]!);
  const ray = [local[0]! + qw * tx + (qy * tz - qz * ty), local[1]! + qw * ty + (qz * tx - qx * tz), local[2]! + qw * tz + (qx * ty - qy * tx)];
  const away = Math.hypot(...(camera.position as [number, number, number]));
  const down = camera.position.map((n) => -n / away);
  const cosine = (ray[0]! * down[0]! + ray[1]! * down[1]! + ray[2]! * down[2]!) / Math.hypot(ray[0]!, ray[1]!, ray[2]!);
  return Math.acos(Math.max(-1, Math.min(1, cosine))) < Math.asin(Math.min(1, airTop(AIR_THICKNESS_DEFAULT) / away)) * margin;
}
