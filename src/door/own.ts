// The package's own data as sources of the data door, written from the rows of NOTICE.md: the whole-Earth pictures and the finer map tiles. The credit of what a view draws is written from these, so the package's data and
// a caller's go through one path. A test holds that none is non-commercial or share-alike, so the package can pass all of it on under the MIT licence. Pure: no DOM, no three.js.
import type { Credit, SourceInfo } from "../data-door.ts";

const NOTICE = "https://github.com/johnmorrisdotca/chikyu-earth/blob/main/NOTICE.md";

function freeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) for (const inner of Object.values(value)) freeze(inner);
  return Object.freeze(value);
}

/**
 * The package's own data, as sources, written from the rows of `NOTICE.md`: `chikyu-pictures` (the whole-Earth pictures of the realistic Earth: day, night, clouds and water) and `chikyu-tiles` (the finer map tiles cut from NASA's bigger maps).
 * A test holds that none is non-commercial or share-alike, so the package can pass all of it on under the MIT licence. A view's credit line is written from these and from the sources a caller handed in.
 *
 * @example
 * ```ts
 * import { OWN_SOURCES } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * console.log(OWN_SOURCES.map((source) => `${source.id}: ${source.licence.name}`));
 * ```
 */
export const OWN_SOURCES: readonly SourceInfo[] = freeze([
  {
    id: "chikyu-pictures",
    name: { en: "Earth pictures", ja: "地球の画像" },
    credit: {
      en: "Earth pictures: NASA Earth Observatory (Blue Marble, Reto Stöckli; Black Marble, Suomi NPP VIIRS data)",
      ja: "地球の画像：NASA Earth Observatory（ブルーマーブル、Reto Stöckli／ブラックマーブル、Suomi NPP VIIRSデータ）",
    },
    licence: { name: "Public domain", url: `${NOTICE}#the-realistic-earths-pictures` },
    url: "https://github.com/johnmorrisdotca/chikyu-earth/tree/main/textures",
    retrieved: "2026-11-02",
  },
  {
    id: "chikyu-tiles",
    name: { en: "Finer map tiles", ja: "細かい地図のタイル" },
    credit: {
      en: "Finer map tiles: NASA Earth Observatory (Blue Marble: Next Generation; Black Marble, Suomi NPP VIIRS data), cut by Chikyu Earth",
      ja: "細かい地図のタイル：NASA Earth Observatory（ブルーマーブル・ネクストジェネレーション／ブラックマーブル、Suomi NPP VIIRSデータ）、Chikyu Earthで切り出したもの",
    },
    licence: { name: "Public domain", url: `${NOTICE}#the-earth-tiles` },
    url: "https://johnmorrisdotca.github.io/chikyu-earth/tiles/",
    retrieved: "2026-11-08",
  },
]);

/** The rows of `OWN_SOURCES` by id. */
export const OWN_BY_ID: ReadonlyMap<string, SourceInfo> = new Map(OWN_SOURCES.map((source) => [source.id, source]));

/** The source objects this package made itself: only these are its own, whatever id a caller's source gives itself. */
const MADE_HERE = new WeakSet<object>();

/** Marks a source object as made by this package. */
export function madeHere<T extends object>(source: T): T {
  MADE_HERE.add(source);
  return source;
}

/** True for a source object this package made (`earthTiles`), false for any other. */
export const isOwnSource = (source: object): boolean => MADE_HERE.has(source);

/**
 * The credit of one of the package's own sources, for a page that draws something itself: the elements credit their own pictures and tiles in `credits()`, and a page that draws the Earth from the package's pictures
 * puts `ownCredit("chikyu-pictures", 1)` in its credit line.
 *
 * @param id - `chikyu-pictures` or `chikyu-tiles`.
 * @param used - How many marks were drawn from it.
 * @returns The credit, marked as the package's own.
 * @throws RangeError for an id that is not one of `OWN_SOURCES`.
 *
 * @example
 * ```ts
 * import { creditLine, ownCredit } from "@johnmorrisdotca/chikyu-earth/door";
 *
 * console.log(creditLine([ownCredit("chikyu-tiles", 6)], "en"));
 * ```
 */
export function ownCredit(id: string, used: number): Credit {
  const source = OWN_BY_ID.get(id);
  if (source === undefined) throw new RangeError(`"${id}" is not one of the package's own sources`);
  return { source, own: true, used };
}
