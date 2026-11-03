// One shared renderer for the page, whichever element draws with it: the Earth from space and the space view both take it from here, so the page keeps one
// WebGL context between them. The last element to leave lets it go (after a second, in case it is only moving).
import { createSharedRenderer, type SharedRenderer } from "@johnmorrisdotca/kazoku-ui/renderer";
import type { ThreeParts } from "./textures.ts";

type Three = ThreeParts;
export type ContextState = "lost" | "restored" | "unavailable";

let shared: SharedRenderer<Three> | undefined;
// A renderer the page made and handed over: used as it is, and never disposed here.
let given: SharedRenderer<Three> | undefined;
let sharedRatio: number | undefined;
let loader: () => Promise<Three> = () => import("three");
const contextListeners = new Set<(state: ContextState) => void>();
let elements = 0;
let releaseTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Where three.js comes from, if a page wants to hand it over itself (before the first element connects). A page that hands over a module re-exporting only the parts the Earth and the space view use ships a few hundred kilobytes of three.js instead of all of it.
 *
 * @param load - Returns the parts of three.js the Earth and the space view use, as a promise.
 *
 * @example
 * ```ts no-run
 * import { setThreeLoader } from "@johnmorrisdotca/chikyu-earth/realistic/element";
 *
 * setThreeLoader(() => import("three"));
 * ```
 */
export function setThreeLoader(load: () => Promise<Three>): void {
  loader = load;
}

/**
 * Hands the elements a renderer the page made, so a page that draws other things with kazoku-ui's shared renderer keeps one WebGL context for all of them. Call it before the first element connects, or while none is in the page. The page owns the renderer: the elements never dispose it, and its own `maxRatio` and `onContext` apply. Pass `undefined` to go back to the package's own.
 *
 * @param renderer - A renderer made with `createSharedRenderer` from `@johnmorrisdotca/kazoku-ui/renderer`, whose `load` gives the same three.js, or `undefined`.
 *
 * @example
 * ```ts no-run
 * import { createSharedRenderer } from "@johnmorrisdotca/kazoku-ui/renderer";
 * import { setSharedRenderer } from "@johnmorrisdotca/chikyu-earth/realistic/element";
 *
 * setSharedRenderer(createSharedRenderer({ load: () => import("three"), maxRatio: 1.5 }));
 * ```
 */
export function setSharedRenderer(renderer: SharedRenderer<Three> | undefined): void {
  if (renderer !== given && elements > 0) throw new Error("chikyu-earth: setSharedRenderer must be called before an element connects");
  if (renderer !== given) {
    clearTimeout(releaseTimer);
    shared?.dispose();
    shared = undefined;
  }
  given = renderer;
}

/** The page's renderer, made on first use. Call `release()` (from the result) when the element leaves. A `maxRatio` lower than the one it was made with makes a new one if no element holds it. */
export function takeRenderer(onContext: (state: ContextState) => void, maxRatio?: number): { renderer: SharedRenderer<Three>; release(): void } {
  clearTimeout(releaseTimer);
  if (!given && shared && elements <= 0 && sharedRatio !== maxRatio) {
    shared.dispose();
    shared = undefined;
  }
  elements += 1;
  contextListeners.add(onContext);
  if (!given && !shared) {
    sharedRatio = maxRatio;
    shared = createSharedRenderer<Three>({
      load: () => loader(),
      ...(maxRatio === undefined ? {} : { maxRatio }),
      onContext: (state) => {
        for (const listener of contextListeners) listener(state);
      },
    });
  }
  return {
    renderer: (given ?? shared)!,
    release() {
      contextListeners.delete(onContext);
      elements -= 1;
      if (elements <= 0 && !given) {
        releaseTimer = setTimeout(() => {
          if (elements <= 0) {
            shared?.dispose();
            shared = undefined;
          }
        }, 1000);
      }
    },
  };
}
