// The name written on the Earth (MODULES-923): the family's shared body label (kazoku-ui's `body-label`) laid on the Earth's globe so it turns with it, in the family's plain attribute names (`body-label`, `body-label-strength` and the rest).
// Off unless a page asks: nothing of it is fetched or made until `body-label` is first set, so a page that never uses it pays nothing. The look and the font are the family's: Michroma, painted, at half strength, once, turning with the body.
import type * as THREE from "three";
import type { BodyLabel, BodyLabelLook, BodyLabelOptions } from "@johnmorrisdotca/kazoku-ui/body-label";
import type { ThreeParts } from "./textures.ts";

/**
 * The attributes of the family's body label, in the order a settings panel lists them.
 *
 * @example
 * ```ts
 * import { BODY_LABEL_ATTRIBUTES } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(BODY_LABEL_ATTRIBUTES.join(", "));
 * ```
 */
export const BODY_LABEL_ATTRIBUTES = ["body-label", "body-label-strength", "body-label-repeat", "body-label-latitude", "body-label-facing", "body-label-font", "body-label-fallback-font"] as const;

/**
 * The settings of the name on the Earth: the same options the family's label takes, with the text left out (it is the Earth's own name, in the page's language).
 *
 * @example
 * ```ts
 * import type { BodyLabelSettings } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const settings: BodyLabelSettings = { look: "painted", strength: 0.5, repeat: "once", latitude: 0, facing: false };
 * console.log(settings.look);
 * ```
 */
export interface BodyLabelSettings {
  look: BodyLabelLook;
  /** 0 to 1. */
  strength: number;
  repeat: "once" | "both" | "around";
  /** Degrees, kept within 70 of the equator by the label. */
  latitude: number;
  /** The name keeps facing the reader while the Earth turns under it. */
  facing: boolean;
  /** A CSS font family the page has loaded; Michroma, fetched once, when left out. */
  font?: string;
  /** The family for letters the font has none of (Japanese); the page's sans when left out. */
  fallbackFont?: string;
}

/** What an Earth tells its scene about its name: the settings now, or `null` for none, and the text. */
export interface BodyLabelState {
  settings: BodyLabelSettings | null;
  text: string;
  /** What the layer has done: the label is made and in the globe, and it is showing (not hidden for being small), as of the last draw. */
  drawn: { made: boolean; showing: boolean };
}

export const newBodyLabelState = (): BodyLabelState => ({ settings: null, text: "EARTH", drawn: { made: false, showing: false } });

const LOOKS: readonly string[] = ["painted", "etched", "outline", "burned"];
const REPEATS: readonly string[] = ["once", "both", "around"];

/**
 * What the family's attributes mean: `body-label` (`painted`, `etched`, `outline` or `burned`; present with another value, or none, it is `painted`; absent, no label), `body-label-strength` (0 to 1, 0.5), `body-label-repeat` (`once`, `both` or
 * `around`; `once`), `body-label-latitude` (degrees; 0), `body-label-facing` (present: always facing the reader), `body-label-font` and `body-label-fallback-font`.
 *
 * @param get - Reads an attribute by name, `null` for one that is not there.
 * @returns The settings, or `null` for no label.
 *
 * @example
 * ```ts
 * import { readBodyLabel } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * const attributes: Record<string, string> = { "body-label": "etched", "body-label-strength": "0.8", "body-label-repeat": "both" };
 * console.log(readBodyLabel((name) => attributes[name] ?? null));
 * ```
 */
export function readBodyLabel(get: (name: string) => string | null): BodyLabelSettings | null {
  const look = get("body-label");
  if (look === null) return null;
  const strength = get("body-label-strength");
  const latitude = get("body-label-latitude");
  const repeat = get("body-label-repeat") ?? "once";
  const font = get("body-label-font")?.trim();
  const fallback = get("body-label-fallback-font")?.trim();
  const number = (text: string | null, fallbackValue: number): number => (text === null || text.trim() === "" || !Number.isFinite(Number(text)) ? fallbackValue : Number(text));
  return {
    look: (LOOKS.includes(look.trim()) ? look.trim() : "painted") as BodyLabelLook,
    strength: Math.min(1, Math.max(0, number(strength, 0.5))),
    repeat: (REPEATS.includes(repeat) ? repeat : "once") as BodyLabelSettings["repeat"],
    latitude: number(latitude, 0),
    facing: get("body-label-facing") !== null && get("body-label-facing") !== "off",
    ...(font ? { font } : {}),
    ...(fallback ? { fallbackFont: fallback } : {}),
  };
}

/**
 * The name written on the Earth: `EARTH`, or `地球` for a Japanese page.
 *
 * @param language - `en` or `ja`.
 * @returns The text.
 *
 * @example
 * ```ts
 * import { bodyLabelText } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * console.log(bodyLabelText("en"), bodyLabelText("ja"));
 * ```
 */
export const bodyLabelText = (language: "en" | "ja"): string => (language === "ja" ? "地球" : "EARTH");

export interface BodyLabelLayer {
  /** Puts the label right for this draw (made, changed or taken away as the settings say) and returns nothing: it asks for a draw of its own when something changed. */
  sync(camera: THREE.Camera, radiusPx: number): void;
  dispose(): void;
}

let fontUrl: string | undefined;

/**
 * Where Michroma, the family's font for the name, is fetched from. Left alone it is the file beside the label's own module (`fonts/Michroma-Regular.ttf` in kazoku-ui's `body-label`), which is right where the package is used as it is shipped, or through a
 * bundler that keeps assets beside the code (Vite does); a bundler or a site that moves the module copies the file and says where with this. A page that names its own font (`body-label-font`) never fetches it.
 *
 * @param url - The font file's address, or `undefined` for the default.
 *
 * @example
 * ```ts no-run
 * import { setBodyLabelFontUrl } from "@johnmorrisdotca/chikyu-earth/realistic";
 *
 * setBodyLabelFontUrl("/fonts/Michroma-Regular.ttf");
 * ```
 */
export function setBodyLabelFontUrl(url: string | undefined): void {
  fontUrl = url;
}

const signatureOf = (state: BodyLabelState): string => (state.settings ? JSON.stringify([state.text, state.settings]) : "");

/**
 * Makes the layer that keeps the Earth's name on its globe, inside `parent` (the group or mesh that turns with the Earth, a radius of 1). The family's body label is loaded only when the settings first ask for it, and its font (Michroma, 64 kB) only
 * when the page has named no font of its own. All three.js parts the label needs must be in `three` (the full three.js has them); without them `onError` is told once and nothing is drawn.
 *
 * @param three - The page's three.js.
 * @param parent - What turns with the Earth.
 * @param state - The settings and the text, which the element changes.
 * @param deps - `invalidate` asks for a draw; `onError` hears of a label that could not be made.
 * @returns The layer.
 */
export function createBodyLabelLayer(three: ThreeParts, parent: THREE.Object3D, state: BodyLabelState, deps: { invalidate: () => void; onError?: (error: unknown) => void }): BodyLabelLayer {
  let label: BodyLabel | null = null;
  let loading = false;
  let failed = false;
  let signature = "";
  let gone = false;
  const options = (): BodyLabelOptions => {
    const s = state.settings!;
    return { text: state.text, look: s.look, strength: s.strength, repeat: s.repeat, latitude: s.latitude, facing: s.facing, ...(s.font ? { font: s.font } : {}), ...(s.fallbackFont ? { fallbackFont: s.fallbackFont } : {}) };
  };
  const remove = (): void => {
    if (!label) return;
    parent.remove(label.object as unknown as THREE.Object3D);
    label.dispose();
    label = null;
    signature = "";
    state.drawn = { made: false, showing: false };
  };
  const make = (): void => {
    loading = true;
    void import("@johnmorrisdotca/kazoku-ui/body-label")
      .then(async (module) => {
        const parts = three as unknown as Partial<Record<"CanvasTexture" | "SphereGeometry" | "MeshLambertMaterial" | "SRGBColorSpace" | "NormalBlending" | "AdditiveBlending", unknown>>;
        for (const name of ["CanvasTexture", "SphereGeometry", "MeshLambertMaterial", "SRGBColorSpace", "NormalBlending", "AdditiveBlending"] as const) if (parts[name] === undefined) throw new Error(`the three.js handed over has no ${name}, which the name on the Earth needs`);
        if (!state.settings?.font) await module.loadBodyLabelFont(fontUrl);
        if (gone || !state.settings) {
          loading = false;
          return;
        }
        const made = module.createBodyLabel(three as never, options());
        parent.add(made.object as unknown as THREE.Object3D);
        label = made;
        state.drawn.made = true;
        signature = signatureOf(state);
        loading = false;
        void made.ready.then(() => {
          if (!gone) deps.invalidate();
        });
        deps.invalidate();
      })
      .catch((error: unknown) => {
        loading = false;
        failed = true;
        deps.onError?.(error);
      });
  };
  return {
    sync(camera, radiusPx) {
      if (gone) return;
      if (!state.settings) {
        remove();
        return;
      }
      if (!label) {
        if (!loading && !failed) make();
        return;
      }
      const now = signatureOf(state);
      if (now !== signature) {
        signature = now;
        label.set(options());
        deps.invalidate();
      }
      if (label.update(camera as never, radiusPx)) deps.invalidate();
      state.drawn.showing = label.object.visible;
    },
    dispose() {
      gone = true;
      remove();
    },
  };
}
