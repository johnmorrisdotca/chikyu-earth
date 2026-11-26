// Registers <chikyu-track>. Importing this entry point (`@johnmorrisdotca/chikyu-earth/track/define`) defines the tag once.
// It draws with chizu (a dependency) and places the satellite with satellite.js (an optional peer). The pure parts are `@johnmorrisdotca/chikyu-earth/track`.
import { ChikyuTrack } from "./element.ts";

export { ChikyuTrack };

if (typeof customElements !== "undefined" && !customElements.get("chikyu-track")) {
  customElements.define("chikyu-track", ChikyuTrack);
}
