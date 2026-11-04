// The code builder: choose a place, how the globe is drawn and its size, and copy the code for any way a page is made. The page is the family's embed panel with this package's choices.
import type { EmbedPanelElement } from "@johnmorrisdotca/kazoku-ui/embed-panel/element";
import { mountEmbedSection } from "./embed-section.ts";

mountEmbedSection(document.getElementById("embed-panel") as EmbedPanelElement, { flatPreview: false });
document.documentElement.dataset["ready"] = "true";
