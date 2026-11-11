// Which bodies cover the sky at a ray from the camera: the Earth, the Moon and the Sun. Pure: a body covers a ray when the angle between the ray and the line to the body's centre is less than the body's angular radius, which is exact for any camera,
// where a circle on the screen is right only for a body on the camera's axis (a wide view draws the Earth as an ellipse towards its edges).

/** A body as the camera sees it: the unit direction to its centre, whether the camera is inside it, and the cosine of its angular radius. */
export interface CoverBody {
  dx: number;
  dy: number;
  dz: number;
  inside: boolean;
  cos: number;
}

/**
 * The cover of a body for a camera.
 *
 * @param position - The body's centre, x y z.
 * @param camera - The camera's place, x y z, in the same units.
 * @param radius - The body's radius, in the same units.
 * @returns The body as the camera sees it.
 */
export function coverBody(position: readonly number[], camera: readonly number[], radius: number): CoverBody {
  const dx = position[0]! - camera[0]!;
  const dy = position[1]! - camera[1]!;
  const dz = position[2]! - camera[2]!;
  const away = Math.hypot(dx, dy, dz) || 1;
  return { dx: dx / away, dy: dy / away, dz: dz / away, inside: away <= radius, cos: away > radius ? Math.sqrt(1 - (radius / away) ** 2) : -1 };
}

/**
 * Whether any of the bodies covers a ray from the camera.
 *
 * @param bodies - The bodies, from `coverBody`.
 * @param x - The ray's direction, x (a unit vector's).
 * @param y - The ray's direction, y.
 * @param z - The ray's direction, z.
 * @returns True where the ray meets a body.
 */
export function covers(bodies: readonly CoverBody[], x: number, y: number, z: number): boolean {
  for (const body of bodies) if (body.inside || x * body.dx + y * body.dy + z * body.dz > body.cos) return true;
  return false;
}
