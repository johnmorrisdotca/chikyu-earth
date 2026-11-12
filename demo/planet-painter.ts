// The Sun, the planets, Pluto and the moons of the demo's space views, and the Moon, are wakusei-planets' (an optional peer of the package; the demo has it): its painter, with the pictures served beside the
// demo (`planets/`, copied by scripts/site.ts) and the finer map tiles from wakusei-planets' own site. The painter carries the credit of the pictures on the screen (`credit`), which the view reads again at each redraw a body asks for and writes under the picture.
import type { BodyPainter } from "../src/space/index.ts";

/** wakusei-planets' finer map tiles, on its own site (GitHub Pages, which allows any page to read them). */
export const PLANET_TILES = "https://johnmorrisdotca.github.io/wakusei-planets/tiles/";

/** wakusei-planets' painter with the demo's pictures and tiles, or `null` where the package is not there. */
export async function planetPainter(): Promise<BodyPainter | null> {
  try {
    const { createPainter } = await import("@johnmorrisdotca/wakusei-planets/painter");
    const painter = createPainter({ textureBase: "planets/", tiles: PLANET_TILES }) as unknown as BodyPainter;
    // wakusei-planets 0.38 stops at the widest picture its package ships when it has no far base (and takes the 2048 ones from its own site), so `make` is passed straight through.
    return painter;
  } catch {
    return null;
  }
}
