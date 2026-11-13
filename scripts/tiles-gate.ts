// Which levels of the Earth tile pyramid the Pages site publishes (see scripts/site.ts and docs/guides/earth-tiles.md). Pure: no file is read or written here.

/** The finest level of each layer that every published loader reads (chikyu-earth up to 0.43): the levels above them go out only when EARTH_TILES_ALL is `yes`. */
export const PUBLISHED_TOP: Readonly<Record<string, number>> = { day: 4, night: 3 };

interface Level {
  level: number;
  tiles: number;
  bytes: number;
}
interface Layer {
  levels: Level[];
  tiles: number;
  bytes: number;
}
export interface TileManifest {
  layers: Record<string, Layer>;
}

/**
 * The manifest to publish, and the folders (`<layer>/<level>`) to leave out. With `all` the manifest is the one given; without it every layer named in `PUBLISHED_TOP` lists only the levels up to its top,
 * with its tile and byte counts added up again from what is left. A layer that is not named there is left as it is.
 *
 * @param manifest The made manifest.
 * @param all True when EARTH_TILES_ALL is `yes`.
 * @returns The manifest and the folders to remove.
 */
export function publishedManifest(manifest: TileManifest, all: boolean): { manifest: TileManifest; remove: string[] } {
  if (all) return { manifest, remove: [] };
  const remove: string[] = [];
  const layers: Record<string, Layer> = {};
  for (const [name, layer] of Object.entries(manifest.layers)) {
    const top = PUBLISHED_TOP[name];
    if (top === undefined) {
      layers[name] = layer;
      continue;
    }
    for (const entry of layer.levels) if (entry.level > top) remove.push(`${name}/${entry.level}`);
    const levels = layer.levels.filter((entry) => entry.level <= top);
    const kept: Layer & { panelSources?: unknown; panelWidth?: unknown } = { ...layer };
    delete kept.panelSources;
    delete kept.panelWidth;
    layers[name] = { ...kept, levels, tiles: levels.reduce((sum, entry) => sum + entry.tiles, 0), bytes: levels.reduce((sum, entry) => sum + entry.bytes, 0) };
  }
  return { manifest: { ...manifest, layers }, remove };
}
