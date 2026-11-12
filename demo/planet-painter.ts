// The Sun, the planets, Pluto and the moons of the demo's space views, and the Moon, are wakusei-planets' (an optional peer of the package; the demo has it): its painter, with the pictures served beside the
// demo (`planets/`, copied by scripts/site.ts), the finer map tiles from wakusei-planets' own site, and the credit of the pictures, which the view writes under the picture.
import type { BodyPainter } from "../src/space/index.ts";

/** wakusei-planets' finer map tiles, on its own site (GitHub Pages, which allows any page to read them). */
export const PLANET_TILES = "https://johnmorrisdotca.github.io/wakusei-planets/tiles/";

/** The widest planet picture the demo serves (wakusei-planets' npm package ships 512 and 1024). */
export const DEMO_MAX_TEXTURE = 1024;

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
    // The demo serves wakusei-planets' npm pictures, which stop at 1024 wide; asking for 2048 got a 404 for each big body (the finer tiles cover a body that is big in the view).
    const make: BodyPainter["make"] = (three, name, context) =>
      context ? painter.make(three, name, { ...context, maxTexture: Math.min(context.maxTexture, DEMO_MAX_TEXTURE) }) : painter.make(three, name);
    return { ...painter, make, credit: PLANET_CREDIT };
  } catch {
    return null;
  }
}
