// The Sun, the planets, Pluto and the moons of the demo's space views, and the Moon, are wakusei-planets' (an optional peer of the package; the demo has it): its painter, with the pictures served beside the
// demo (`planets/`, copied by scripts/site.ts), the finer map tiles from wakusei-planets' own site, and the credit of the pictures, which the view writes under the picture.
import type { BodyPainter } from "../src/space/index.ts";

/** wakusei-planets' finer map tiles, on its own site (GitHub Pages, which allows any page to read them). */
export const PLANET_TILES = "https://johnmorrisdotca.github.io/wakusei-planets/tiles/";

/** The credit of wakusei-planets' pictures and tiles, as its NOTICE.md gives them (read 2026-11-11). */
export const PLANET_CREDIT = {
  en: "Planet and Moon pictures: NASA, USGS and JPL (public domain); Solar System Scope, Shady Tex and Nestaeric (CC BY 4.0), by way of Wakusei Planets.",
  ja: "惑星と月の画像：NASA・USGS・JPL（パブリックドメイン）、Solar System Scope・Shady Tex・Nestaeric（CC BY 4.0）。Wakusei Planets 経由。",
};

/** wakusei-planets' painter with the demo's pictures and tiles and the credit, or `null` where the package is not there. */
export async function planetPainter(): Promise<BodyPainter | null> {
  try {
    const { createPainter } = await import("@johnmorrisdotca/wakusei-planets/painter");
    const painter = createPainter({ textureBase: "planets/", tiles: PLANET_TILES }) as unknown as BodyPainter;
    // wakusei-planets 0.38 stops at the widest picture its package ships when it has no far base (and takes the 2048 ones from its own site), so `make` is passed straight through.
    return { ...painter, make: painter.make.bind(painter), credit: PLANET_CREDIT };
  } catch {
    return null;
  }
}
