// Registers <chikyu-flat>. Importing this entry point (`@johnmorrisdotca/chikyu-earth/flat/define`) defines the tag once; it needs satellite.js (an optional peer).
import { ChikyuFlat } from "./element.ts";

export { ChikyuFlat };
export type { FlatPick, FlatPlane, GroupStyle } from "./element.ts";

if (typeof customElements !== "undefined" && !customElements.get("chikyu-flat")) {
  customElements.define("chikyu-flat", ChikyuFlat);
}
