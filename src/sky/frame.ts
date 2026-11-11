// What an element tells the star names' layer at each draw. Types only, and no import of hoshi-stars, so the package's own declarations can name it.

/** What an element tells the layer at each draw: where a direction in the sky falls on the screen, the size of the box, and the bodies that cover the sky (round, in pixels). */
export interface SkyFrame {
  /** Writes where the direction (right ascension and declination, degrees) falls on the screen in CSS pixels and answers whether it is in front of the camera. */
  project(rightAscension: number, declination: number, out: { x: number; y: number }): boolean;
  width: number;
  height: number;
  /** Bodies in front of the sky, each a disc on the screen: the Earth, the Moon, the Sun. Used where `covered` is not given (a view that looks straight at the Earth, where a body is a circle). */
  discs: readonly { x: number; y: number; radius: number }[];
  /**
   * Whether a body covers the sky at a point of the screen, worked out from the ray through the point: a body covers it when the ray's angle to the body's centre is less than the body's angular radius. A camera with a wide field of view (a ride along a satellite sees the
   * Earth 70 degrees across) draws a body as an ellipse towards the edges, which a circle on the screen cannot say.
   */
  covered?: (x: number, y: number) => boolean;
}

