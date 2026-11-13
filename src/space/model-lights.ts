// A satellite model made by a page's painter must not bring a light of its own into the scene. Three keeps one program of each lit material for each number and kind of lights a draw has, so a model that adds a light changes the program of every
// lit material in the scene (the Earth's clouds, the plain bodies) the first time it is shown: one more of each, kept until it is let go (MODULES-1293, found in the soak: 10 programs at the end against 9). The scene owns the Sun's light; a model is lit by that,
// aimed at the Sun and given the look (colour and strength) of the light the painter made for it, which is taken from the model and the model's own light switched off.
import type * as THREE from "three";

/** The look of the light a model brought: the colour (a number such as 0xfff4e0) and the strength, for the scene's Sun to take on while the model is shown. */
export interface ModelSun {
  color: number;
  intensity: number;
}

/**
 * Switch off every light in a model that would count in the scene's lights (directional, point, spot, hemisphere and area lights; an ambient light does not change a program and is left), and say what the first directional one looked like.
 * The lights are switched off, not taken out, so a painter that disposes of them or aims them in its `light` hook finds them where it left them.
 *
 * @param object - The model.
 * @returns The first directional light's colour and strength, or `null` when the model had none.
 */
export function stripLights(object: THREE.Object3D): ModelSun | null {
  let sun: ModelSun | null = null;
  object.traverse((part) => {
    const light = part as THREE.Light & { isDirectionalLight?: boolean; isAmbientLight?: boolean; isLightProbe?: boolean };
    if (!light.isLight || light.isAmbientLight === true || light.isLightProbe === true) return;
    if (light.isDirectionalLight === true && sun === null) sun = { color: light.color.getHex(), intensity: light.intensity };
    light.visible = false;
  });
  return sun;
}
