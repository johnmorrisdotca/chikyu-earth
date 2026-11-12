// The painted trail as one texture the Earth's surface program reads. three.js is the page's own.
import type * as THREE from "three";
import type { ThreeParts } from "../realistic/textures.ts";

/** Where the trail's picture comes from: its pixels are asked for only while it is on, so a page that paints nothing never makes them. */
export interface PaintSource {
  data(): Uint8Array;
  width: number;
  height: number;
}

export interface PaintTexture {
  uniforms: {
    paintMap: { value: THREE.Texture | null };
    paintNow: { value: number };
    paintSpan: { value: number };
    paintOn: { value: number };
  };
  /** Whether the picture is on the graphics card now. */
  readonly held: boolean;
  /**
   * Make the picture when painting goes on (and send it), send it again when `changed`, and give it back when painting is off.
   * With painting off nothing is made and nothing is held.
   */
  sync(on: boolean, changed: boolean): void;
  dispose(): void;
}

/** A texture over the trail (equirectangular, north in the first row), made on the first paint and freed on clear. The same uniforms go on the sphere and on any tile laid over it. */
export function createPaintTexture(three: ThreeParts, source: PaintSource): PaintTexture {
  const DataTexture = (three as ThreeParts & { DataTexture?: new (data: Uint8Array, width: number, height: number) => THREE.Texture }).DataTexture;
  const uniforms = {
    paintMap: { value: null as THREE.Texture | null },
    paintNow: { value: 0 },
    paintSpan: { value: 1440 },
    paintOn: { value: 0 },
  };
  let texture: THREE.Texture | null = null;
  const make = (): THREE.Texture => {
    const data = source.data();
    const made = DataTexture ? new DataTexture(data, source.width, source.height) : new three.Texture();
    if (!DataTexture) made.image = { data, width: source.width, height: source.height };
    made.generateMipmaps = false;
    made.flipY = false;
    made.magFilter = three.LinearFilter;
    made.minFilter = three.LinearFilter;
    made.wrapS = three.ClampToEdgeWrapping;
    made.wrapT = three.ClampToEdgeWrapping;
    const space = (three as ThreeParts & { NoColorSpace?: THREE.ColorSpace }).NoColorSpace;
    if (space) made.colorSpace = space;
    made.needsUpdate = true;
    return made;
  };
  const free = (): void => {
    texture?.dispose();
    texture = null;
    uniforms.paintMap.value = null;
  };
  return {
    uniforms,
    get held() {
      return texture !== null;
    },
    sync(on, changed) {
      if (!on) {
        free();
        return;
      }
      if (texture === null) {
        texture = make();
        uniforms.paintMap.value = texture;
      } else if (changed) texture.needsUpdate = true;
    },
    dispose: free,
  };
}
