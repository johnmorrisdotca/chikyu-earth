// Names of oceans, seas and continents over an element's picture. The element tells this where the Earth is at each draw. Nothing is added until `sea-names` is on, and nothing is drawn at rest.
import { LAND_LETTER_SPACING, SEA_LETTER_SPACING, layoutSeaNames, readSeaNames, type SeaName } from "./geometry.ts";
import type { CityFrame } from "../cities/geometry.ts";

/** The styles of the layer (`#sea-names` in the element's shadow root). Water is spaced out; continents a little less. */
export const SEA_NAMES_STYLE =
  "#sea-names{position:absolute;inset:0;overflow:hidden;pointer-events:none}" +
  ".sea-name{position:absolute;left:0;top:0;margin:0;white-space:nowrap;text-align:center;pointer-events:none;will-change:transform;" +
  "font-family:var(--chikyu-sea-font,system-ui,-apple-system,'Segoe UI',sans-serif);font-weight:500;color:var(--chikyu-sea-colour,rgba(186,214,228,.9));" +
  `letter-spacing:${SEA_LETTER_SPACING}em;` +
  "text-shadow:0 0 3px #061018,0 0 3px #061018}" +
  `.sea-name[data-kind=continent]{letter-spacing:${LAND_LETTER_SPACING}em;color:var(--chikyu-land-colour,rgba(232,224,200,.92))}` +
  ".sea-name[hidden]{display:none}";

export interface SeaNamesStats {
  on: boolean;
  radius: number;
  names: number;
  renders: number;
}

export interface SeaHost {
  frame(frame: (CityFrame & { disc?: { x: number; y: number; radius: number } }) | null, taken?: readonly { left: number; top: number; width: number; height: number }[]): void;
  refresh(): void;
  readonly shown: readonly SeaName[];
  readonly boxes: readonly { left: number; top: number; width: number; height: number }[];
  readonly stats: SeaNamesStats;
  dispose(): void;
}

export interface SeaHostOptions {
  attribute(name: string): string | null;
  language(): "en" | "ja";
  root: ShadowRoot;
}

/**
 * Makes the layer of one element. Nothing is added to the root until `sea-names` is on.
 *
 * @param options - The attribute reader, the language and the shadow root.
 * @returns The host.
 */
export function createSeaHost(options: SeaHostOptions): SeaHost {
  const { root } = options;
  const doc = root.ownerDocument;
  let on = readSeaNames(options.attribute("sea-names"));
  let last: (CityFrame & { disc?: { x: number; y: number; radius: number } }) | null = null;
  let taken: readonly { left: number; top: number; width: number; height: number }[] = [];
  let shown: SeaName[] = [];
  let renders = 0;
  let box: HTMLElement | undefined;
  const pool: HTMLElement[] = [];

  const attach = (): void => {
    if (box) return;
    box = doc.createElement("div");
    box.id = "sea-names";
    box.setAttribute("aria-hidden", "true");
    const cities = root.getElementById("cn-canvas");
    if (cities) root.insertBefore(box, cities);
    else root.append(box);
  };

  const clear = (): void => {
    for (const name of pool) name.hidden = true;
    shown = [];
  };

  const place = (): void => {
    if (!box) return;
    renders += 1;
    while (pool.length < shown.length) {
      const name = doc.createElement("span");
      name.className = "sea-name";
      box.append(name);
      pool.push(name);
    }
    pool.forEach((name, index) => {
      const one = shown[index];
      if (!one) {
        name.hidden = true;
        return;
      }
      name.hidden = false;
      name.dataset["kind"] = one.kind;
      name.textContent = one.text;
      name.style.fontSize = `${one.size}px`;
      name.style.transform = `translate(${one.left}px, ${one.top}px)`;
    });
  };

  const compute = (): void => {
    if (!on || !last) {
      clear();
      if (box) place();
      return;
    }
    attach();
    shown = layoutSeaNames(last.radius, last, options.language(), taken);
    place();
  };

  return {
    frame(frame, next = []) {
      last = frame;
      taken = next;
      compute();
    },
    refresh() {
      on = readSeaNames(options.attribute("sea-names"));
      if (!on) {
        clear();
        box?.remove();
        box = undefined;
        pool.length = 0;
        return;
      }
      compute();
    },
    get shown() {
      return shown;
    },
    get boxes() {
      return shown.map((one) => ({ left: one.left, top: one.top, width: one.width, height: one.height }));
    },
    get stats() {
      return { on, radius: last?.radius ?? 0, names: on ? shown.length : 0, renders };
    },
    dispose() {
      clear();
      box?.remove();
      box = undefined;
      on = false;
    },
  };
}
