// Where the sky host finds the sky cultures besides the IAU's. A build that leaves the cultures out never imports `./cultures.ts`, so the table stays empty, no `hoshi-stars/cultures/*` import is in the build, and a culture a page asks for is the IAU's.
import type { Culture } from "@johnmorrisdotca/hoshi-stars/culture";

/** How to bring each culture in, by id: a dynamic import of its own, so that a bundler makes a file of each. */
export type CultureLoaders = Readonly<Record<string, () => Promise<Culture>>>;

let loaders: CultureLoaders = {};

/**
 * Sets the cultures an element can load. The default entries (`@johnmorrisdotca/chikyu-earth/space/element` and `.../realistic/element`) set `western`, `japanese` and `chinese`; the entries without cultures set none.
 *
 * @param next - The loaders, by culture id.
 */
export function setCultureLoaders(next: CultureLoaders): void {
  loaders = next;
}

/**
 * The cultures that can be loaded now.
 *
 * @returns The loaders, by culture id; empty when the build leaves the cultures out.
 */
export const cultureLoaders = (): CultureLoaders => loaders;
