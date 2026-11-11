import "@johnmorrisdotca/chikyu-earth/space/element";
import type { ChikyuSpace } from "@johnmorrisdotca/chikyu-earth/space/element";
import type { SkyLabelStyle } from "@johnmorrisdotca/chikyu-earth/realistic";

// A page without hoshi-stars installed still type-checks: the look of the names is chikyu-earth's own type.
const space = document.querySelector<ChikyuSpace>("chikyu-space")!;
const look: Partial<SkyLabelStyle> = { size: 12, colour: "#ffe9b0", ring: 0 };
space.skyStyle = look;
space.setAttribute("star-names", "12");

// With no hoshi-stars the element says so and draws no names; the picture is as it was.
space.addEventListener("chikyu-sky-unavailable", (event) => console.log((event as CustomEvent<{ reason: string }>).detail.reason));
