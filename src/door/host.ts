// What an element does with the data door: it keeps a view's sources (`sources`, `addSource`, `removeSource`, `enableSource`, the attribute `data="own"`), tells the page when the set of credited sources changes
// (`chikyu-creditschange`), and answers `credits()`. `<chikyu-earth-realistic>` and `<chikyu-passes>` both use it, so the two behave the same. Not part of the `/door` entry: it sends events, so it is for the elements.
import type { Credit, DataSource } from "../data-door.ts";
import { createSourceBook, creditsOf, type SourceBook, type SourceBookOptions } from "./book.ts";

/** What an element tells its host about the last drawn frame. */
export interface DoorFrame {
  /** The package's own credits, with how many marks each gave (`ownCredit`). */
  own(): readonly Credit[];
  /** How many marks or tiles each of the book's sources gave, by id. */
  used(): ReadonlyMap<string, number>;
}

export interface DoorHost {
  readonly book: SourceBook;
  /** The sources set by a page, in the order added. */
  sources(): readonly DataSource[];
  /** Replaces every source: all are checked first, and if one is refused nothing changes and the `TypeError` is thrown. */
  setSources(list: readonly unknown[]): void;
  /** The credits of the last drawn frame, the package's own first. */
  credits(): Credit[];
  /** Fires `chikyu-creditschange` when the set of credited sources changed since the last call (not at each draw). */
  announce(): void;
}

/**
 * Makes the door of one element.
 *
 * @param target - The element: it gets `chikyu-creditschange`.
 * @param frame - What the last drawn frame held.
 * @param options - The kinds of source the element draws.
 * @param redraw - Asked for when a source was added, removed or switched, or its records were read.
 * @returns The host.
 */
export function createDoorHost(target: EventTarget, frame: DoorFrame, options: SourceBookOptions, redraw: () => void): DoorHost {
  const book = createSourceBook(options);
  let shown = "";
  const credits = (): Credit[] => creditsOf(frame.own(), book, frame.used());
  const announce = (): void => {
    const now = credits();
    const signature = now.map((credit) => credit.source.id).join(",");
    if (signature === shown) return;
    shown = signature;
    target.dispatchEvent(new CustomEvent("chikyu-creditschange", { detail: { credits: now } }));
  };
  book.onChange(() => {
    redraw();
    announce();
  });
  return {
    book,
    sources: () => book.sources,
    setSources(list) {
      const old = [...book.sources];
      const checker = createSourceBook(options);
      for (const one of list) checker.addSource(one);
      checker.dispose();
      for (const one of old) book.removeSource(one.info.id);
      for (const one of list) book.addSource(one);
    },
    credits,
    announce,
  };
}
