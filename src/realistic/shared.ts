// One shared renderer for the page, whichever element draws with it: the Earth from space and the space view both take it from here, so the page keeps one
// WebGL context between them. The last element to leave lets it go (after a second, in case it is only moving).
import { createSharedRenderer, type SharedRenderer } from "@johnmorrisdotca/kazoku-ui/renderer";
import type { ThreeParts } from "./textures.ts";

type Three = ThreeParts;
export type ContextState = "lost" | "restored" | "unavailable";

let shared: SharedRenderer<Three> | undefined;
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

/** The page's renderer, made on first use. Call `release()` (from the result) when the element leaves. */
export function takeRenderer(onContext: (state: ContextState) => void): { renderer: SharedRenderer<Three>; release(): void } {
  clearTimeout(releaseTimer);
  elements += 1;
  contextListeners.add(onContext);
  shared ??= createSharedRenderer<Three>({
    load: () => loader(),
    onContext: (state) => {
      for (const listener of contextListeners) listener(state);
    },
  });
  return {
    renderer: shared,
    release() {
      contextListeners.delete(onContext);
      elements -= 1;
      if (elements <= 0) {
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
