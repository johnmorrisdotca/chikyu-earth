import "@johnmorrisdotca/kazoku-ui/view-controls/define";
import type { ViewChangeDetail } from "@johnmorrisdotca/kazoku-ui/view-controls/element";
import "../src/element.ts";
import type { ChikyuEarth } from "../src/element.ts";

const el = document.querySelector<ChikyuEarth>("chikyu-earth");
const controls = document.querySelector("kazoku-view-controls");

if (el && controls) {
  // A full orthographic redraw is costly; Auto-turn is so slow that one a second is smooth and exact.
  const AUTO_REDRAW_MS = 1000;
  let autoDrawnAt = 0;
  controls.addEventListener("kazoku-viewchange", (event) => {
    const detail = (event as CustomEvent<ViewChangeDetail>).detail;
    const now = performance.now();
    const auto = detail.reason === "auto" && now - autoDrawnAt >= AUTO_REDRAW_MS;
    if (auto) autoDrawnAt = now;
    el.setView(detail, detail.final || auto);
  });

  const styleButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-style]")];
  for (const button of styleButtons) {
    button.addEventListener("click", () => {
      el.setAttribute("style", button.dataset.style ?? "line");
      for (const b of styleButtons) b.classList.toggle("on", b === button);
    });
  }

  const grat = document.querySelector<HTMLButtonElement>("#grat");
  grat?.addEventListener("click", () => {
    grat.setAttribute("aria-pressed", String(el.toggleAttribute("graticule")));
  });

  document.querySelector<HTMLButtonElement>("#locate")?.addEventListener("click", () => {
    navigator.geolocation?.getCurrentPosition((position) => {
      el.setAttribute("center", `${position.coords.longitude},${position.coords.latitude}`);
    });
  });
}
