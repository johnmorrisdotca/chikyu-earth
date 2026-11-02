import "@johnmorrisdotca/chikyu-earth/element";
import { globe } from "@johnmorrisdotca/chikyu-earth";

const earth = document.querySelector("chikyu-earth")!;
earth.setAttribute("graticule", "");
console.log(globe({ size: 64 }).startsWith("<svg"));
