// How high the clouds' shell sits above the ground in the space view.

/** The shell's radius while the camera is near (the Earth's radius is 1): about 10 km up, above the finer map tiles' own shells (1.0008 at most) by more than the shell's flat faces dip. */
export const CLOUD_SHELL_NEAR = 1.0016;
/** The shell's radius from far away, where a low shell could fight the ground for the same depth and the change is under half a pixel. */
export const CLOUD_SHELL_FAR = 1.006;
/** The camera's distance from the Earth's middle, in Earth radii, past which the far shell is used. */
export const CLOUD_SHELL_REACH = 60;

/**
 * The radius of the clouds' shell for a camera this far from the Earth's middle. A shell 38 km up (the far one) stands above the ground at the Earth's edge wherever there is cloud, so from a
 * low orbit the outline had lumps several pixels tall; near the Earth the shell is as low as the map tiles under it allow.
 * @param distance - The camera's distance from the Earth's middle, in Earth radii.
 * @returns The shell's radius, in Earth radii.
 */
export function cloudShell(distance: number): number {
  return distance < CLOUD_SHELL_REACH ? CLOUD_SHELL_NEAR : CLOUD_SHELL_FAR;
}
