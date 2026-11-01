import "../src/element.ts";

const el = document.querySelector("chikyu-earth");
if (el) {
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
