// How far the realistic Earth may be zoomed once its tiles are found. Pure: the element reads and writes the `zoom-max` attribute, this says what to write.

/** The zoom limit of the package's own pictures (the element's `LIMITS.zoomMax`), sharp to about this many times. */
export const PICTURE_ZOOM = 5;
/** The width of the widest picture the tiles are laid over, which that limit is sharp to. */
export const PICTURE_WIDTH = 4096;

/**
 * The zoom limit a tile set gives: as many times `PICTURE_ZOOM` as the finest day level is wider than the widest picture (16384 across, 4 times: 20; 32768, 8 times: 40), never below the pictures' own
 * limit, and the pictures' own limit when the set has no day layer.
 *
 * @param layers - The width in pixels of the finest level of each layer of the set.
 * @returns The limit, as the attribute's text.
 */
export const tilesZoomMax = (layers: Record<string, number>): string => String(Math.max(PICTURE_ZOOM, Math.round((PICTURE_ZOOM * (layers["day"] ?? 0)) / PICTURE_WIDTH)));

/**
 * The limit to write when a set has been read: the larger of the one written before and the set's own, so a source with fewer levels added later does not lower it (the view controls take a written
 * attribute as a new limit and bring the view back to fit).
 *
 * @param written - What this element wrote before, or null.
 * @param layers - The width of the finest level of each layer of the set read now.
 * @returns The limit, as the attribute's text.
 */
export const raisedZoomMax = (written: string | null, layers: Record<string, number>): string => String(Math.max(Number(written ?? 0), Number(tilesZoomMax(layers))));

/**
 * Whether the element may write the limit: when the page has set none, or the one there is the one the element wrote. A `zoom-max` a page sets itself is never overwritten.
 *
 * @param attribute - The `zoom-max` attribute now, or null.
 * @param written - What this element wrote before, or null.
 * @returns True when the element may write.
 */
export const mayWriteZoomMax = (attribute: string | null, written: string | null): boolean => attribute === null || attribute === written;
