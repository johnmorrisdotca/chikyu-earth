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

/** What `pathOutside` draws with: a canvas's context. */
export interface Path {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
}

/** How far apart, in pixels, a line is tested for the cover: a line that dips under the edge of a body for less is not seen to (at the edge of a large body, a chord of this length is less than a pixel deep). */
const CLIP_STEP = 6;
/** How many times the edge of a body is halved to find where a line meets it: 6 narrows a step to a tenth of a pixel. */
const CLIP_HALVINGS = 6;

/**
 * Adds a segment to the path, less the part of it a body covers. What a body covers of the picture is convex (a disc, or an ellipse towards the edges of a wide view), so a line meets it once at most: the segment is walked in short steps, and where one step
 * is covered and the next is not, the edge between them is found by halving. Nothing is made; the path takes the pieces.
 *
 * @param path - The path to add the pieces to (a canvas's context).
 * @param x0 - The segment's start, x.
 * @param y0 - The start, y.
 * @param x1 - The end, x.
 * @param y1 - The end, y.
 * @param covered - Whether a body covers a point of the picture, or `undefined` where none does.
 * @param inset - How far, in pixels, a piece is held back from the edge it is cut at: half the line's width and its round end, so the stroke stays off the body.
 */
export function pathOutside(path: Path, x0: number, y0: number, x1: number, y1: number, covered: ((x: number, y: number) => boolean) | undefined, inset = 0): void {
  if (!covered) {
    path.moveTo(x0, y0);
    path.lineTo(x1, y1);
    return;
  }
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(length / CLIP_STEP));
  const back = length > 0 ? inset / length : 0;
  let hidden = covered(x0, y0);
  /** Where the piece being walked began along the segment (0 to 1), or -1 while it is under a body. */
  let from = hidden ? -1 : 0;
  let before = 0;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const now = covered(x0 + dx * t, y0 + dy * t);
    if (now !== hidden) {
      // the edge lies between `before` and `t`: `seen` is the side outside the body
      let seen = hidden ? t : before;
      let under = hidden ? before : t;
      for (let h = 0; h < CLIP_HALVINGS; h += 1) {
        const mid = (seen + under) / 2;
        if (covered(x0 + dx * mid, y0 + dy * mid)) under = mid;
        else seen = mid;
      }
      if (now) {
        const end = Math.max(from, seen - back);
        path.moveTo(x0 + dx * from, y0 + dy * from);
        path.lineTo(x0 + dx * end, y0 + dy * end);
        from = -1;
      } else from = Math.min(1, seen + back);
      hidden = now;
    }
    before = t;
  }
  if (!hidden && from <= 1) {
    path.moveTo(x0 + dx * from, y0 + dy * from);
    path.lineTo(x1, y1);
  }
}

/**
 * Whether any part of a label is on a body: the corners and the middle of the name's edges, the star's own point and eight points of the ring round it, and the end of its leader.
 *
 * @param covered - Whether a body covers a point of the picture.
 * @param left - The name's box, from the picture's top left.
 * @param top - The box's top.
 * @param right - The box's right.
 * @param bottom - The box's bottom.
 * @param label - The star's label, for its point, ring and leader.
 * @returns True where some part is over a body.
 */
export function touches(covered: (x: number, y: number) => boolean, left: number, top: number, right: number, bottom: number, label: { x: number; y: number; ring: number; leader?: boolean; leaderX1: number; leaderY1: number }): boolean {
  const middle = (left + right) / 2;
  const centre = (top + bottom) / 2;
  if (covered(left, top) || covered(middle, top) || covered(right, top) || covered(left, bottom) || covered(middle, bottom) || covered(right, bottom) || covered(left, centre) || covered(right, centre)) return true;
  if (covered(label.x, label.y)) return true;
  // the ring is drawn a pixel wide and round: eight points of it, a pixel out
  const ring = label.ring + 1;
  const diagonal = ring * 0.7071;
  if (label.ring > 0 && (covered(label.x - ring, label.y) || covered(label.x + ring, label.y) || covered(label.x, label.y - ring) || covered(label.x, label.y + ring) || covered(label.x - diagonal, label.y - diagonal) || covered(label.x + diagonal, label.y - diagonal) || covered(label.x - diagonal, label.y + diagonal) || covered(label.x + diagonal, label.y + diagonal))) return true;
  return Boolean(label.leader) && covered(label.leaderX1, label.leaderY1);
}


