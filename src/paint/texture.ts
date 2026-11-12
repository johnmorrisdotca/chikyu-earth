// The painted trail as one texture the Earth's surface program reads. three.js is the page's own.
import type * as THREE from "three";
import type { ThreeParts } from "../realistic/textures.ts";
import { PAINT_H, PAINT_W } from "./math.ts";

export interface PaintTexture {
  texture: THREE.Texture;
  uniforms: {
    paintMap: { value: THREE.Texture };
    paintNow: { value: number };
    paintSpan: { value: number };
    paintOn: { value: number };
  };
  /** Upload `data` on the next draw. */
  upload(): void;
  dispose(): void;
}

/** A texture over `data` (equirectangular, north in the first row). The same uniforms go on the sphere and on any tile laid over it. */
export function createPaintTexture(three: ThreeParts, data: Uint8Array, width = PAINT_W, height = PAINT_H): PaintTexture {
  const DataTexture = (three as ThreeParts & { DataTexture?: new (data: Uint8Array, width: number, height: number) => THREE.Texture }).DataTexture;
  const texture = DataTexture ? new DataTexture(data, width, height) : new three.Texture();
  if (!DataTexture) texture.image = { data, width, height };
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.magFilter = three.LinearFilter;
  texture.minFilter = three.LinearFilter;
  texture.wrapS = three.ClampToEdgeWrapping;
  texture.wrapT = three.ClampToEdgeWrapping;
  const space = (three as ThreeParts & { NoColorSpace?: THREE.ColorSpace }).NoColorSpace;
  if (space) texture.colorSpace = space;
  texture.needsUpdate = true;
  return {
    texture,
    uniforms: {
      paintMap: { value: texture },
      paintNow: { value: 0 },
      paintSpan: { value: 1440 },
      paintOn: { value: 0 },
    },
    upload() {
      texture.needsUpdate = true;
    },
    dispose() {
      texture.dispose();
    },
  };
}
