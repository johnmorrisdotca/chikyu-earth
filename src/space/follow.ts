// How much of the Earth's turn the space camera takes. 0 holds the stars (the camera stays where it was set). 1 turns with the Earth.
// A change keeps the longitude under the middle of the view: the anchor (or, at 1, the yaw) is moved so the aim does not jump.

/** Keep a share between 0 and 1. Anything that is not a number is 0. */
export const clampFollow = (value: number): number => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

/**
 * The sidereal angle the camera uses, in degrees. `anchor` is the Earth's turn when the camera was set, `spin` is the turn now.
 *
 * @param anchor - The Earth's turn, in degrees, remembered for the space camera.
 * @param spin - The Earth's turn now, in degrees.
 * @param follow - 0 holds the stars, 1 turns with the Earth.
 * @returns The angle added to the place the camera looks at.
 */
export const followSpin = (anchor: number, spin: number, follow: number): number => {
  const share = clampFollow(follow);
  return anchor + share * (spin - anchor);
};

/**
 * The longitude, in degrees, under the middle of the view. The same place before and after a change of `follow`.
 *
 * @param anchor - The Earth's turn remembered for the camera.
 * @param spin - The Earth's turn now.
 * @param follow - The share of that turn the camera takes.
 * @param centreLon - The home longitude.
 * @param yaw - The view's yaw, in degrees.
 * @returns Longitude under the middle, in degrees.
 */
export const groundLongitude = (anchor: number, spin: number, follow: number, centreLon: number, yaw: number): number => followSpin(anchor, spin, follow) + centreLon - yaw - spin;

const wrap = (deg: number): number => ((((deg + 180) % 360) + 360) % 360) - 180;

/**
 * Move the camera's anchor, and the yaw when the share becomes 1, so the longitude under the middle stays put.
 *
 * @param anchor - The anchor before the change.
 * @param spin - The Earth's turn now.
 * @param from - The share before the change.
 * @param to - The share after the change.
 * @param yaw - The view's yaw before the change.
 * @returns The anchor and yaw to use with `to`.
 */
export function retargetFollow(anchor: number, spin: number, from: number, to: number, yaw: number): { anchor: number; yaw: number } {
  const next = clampFollow(to);
  const oldSpin = followSpin(anchor, spin, from);
  if (next >= 1) return { anchor: spin, yaw: wrap(yaw + (spin - oldSpin)) };
  const nextAnchor = (oldSpin - next * spin) / (1 - next);
  return { anchor: nextAnchor, yaw };
}
