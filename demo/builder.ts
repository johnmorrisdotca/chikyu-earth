// The code builder: choose a place, how the globe is drawn, its size, and copy the code for any way a page is made. One screen, choices in rows; the preview is the globe itself.
import "../src/element.ts";

type Look = "line" | "thick" | "realistic";
type Kind = "html" | "module" | "react" | "iframe";

const PLACES: readonly { id: string; label: string; lon: number; lat: number }[] = [
  { id: "tokyo", label: "Tokyo", lon: 139.7, lat: 35.7 },
  { id: "toronto", label: "Toronto", lon: -79.38, lat: 43.65 },
  { id: "london", label: "London", lon: -0.13, lat: 51.51 },
  { id: "new-york", label: "New York", lon: -74.01, lat: 40.71 },
  { id: "sao-paulo", label: "São Paulo", lon: -46.63, lat: -23.55 },
  { id: "cairo", label: "Cairo", lon: 31.24, lat: 30.04 },
  { id: "nairobi", label: "Nairobi", lon: 36.82, lat: -1.29 },
  { id: "mumbai", label: "Mumbai", lon: 72.88, lat: 19.08 },
  { id: "sydney", label: "Sydney", lon: 151.21, lat: -33.87 },
  { id: "reykjavik", label: "Reykjavik", lon: -21.94, lat: 64.15 },
];
const KIND_WORDS: Readonly<Record<Kind, string>> = { html: "HTML", module: "Module", react: "React", iframe: "Iframe" };
const CDN = "https://cdn.jsdelivr.net/npm/@johnmorrisdotca/chikyu-earth";
const SITE = "https://johnmorrisdotca.github.io/chikyu-earth/";
const byId = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const state = { place: "tokyo", look: "thick" as Look, graticule: true, size: 320, kind: "html" as Kind };

function fill(id: string, choices: readonly { id: string; label: string }[], chosen: string, prefix: string, on: (id: string) => void): void {
  byId(id).replaceChildren(
    ...choices.map((choice) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = choice.label;
      button.dataset["testid"] = `${prefix}-${choice.id}`;
      button.setAttribute("aria-pressed", String(choice.id === chosen));
      button.addEventListener("click", () => on(choice.id));
      return button;
    }),
  );
}

const centre = (): string => {
  const place = PLACES.find((one) => one.id === state.place) ?? PLACES[0]!;
  return `${place.lon},${place.lat}`;
};

/** The text to put the globe in a page, for each way a page is made. */
function codeFor(look: Look, kind: Kind, at: string, size: number, graticule: boolean): string {
  const real = look === "realistic";
  const tag = real
    ? `<chikyu-earth-realistic center="${at}" texture-base="${CDN}/dist/textures/" style="display: block; width: ${size}px"></chikyu-earth-realistic>`
    : `<chikyu-earth center="${at}" look="${look}"${graticule ? " graticule" : ""} size="${size}"></chikyu-earth>`;
  const entry = real ? "realistic/element" : "element";
  if (kind === "iframe") return `<iframe src="${SITE}embed.html?look=${look}&center=${at}${graticule && !real ? "&graticule=1" : ""}" title="The Earth" width="${size}" height="${size}" style="border:0"></iframe>`;
  if (kind === "module") return `import "@johnmorrisdotca/chikyu-earth/${entry}";\n\n// then, anywhere in your page:\n${tag}`;
  if (kind === "react")
    return `import { useEffect } from "react";\n\nexport function Earth() {\n  useEffect(() => {\n    // The element needs a browser, so it is imported in an effect, never at the top of the file.\n    void import("@johnmorrisdotca/chikyu-earth/${entry}");\n  }, []);\n  return (\n    ${tag.replace(' style="display: block; width: ' + size + 'px"', " style={{ display: \"block\", width: " + size + " }}")}\n  );\n}`;
  return `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    <title>The Earth</title>\n    <script type="module" src="${CDN}/${entry}/+esm"></script>\n  </head>\n  <body>\n    ${tag}\n  </body>\n</html>`;
}

let full = "";
function draw(): void {
  fill("places", PLACES.map((place) => ({ id: place.id, label: place.label })), state.place, "place", (id) => {
    state.place = id;
    draw();
  });
  fill("looks", (["line", "thick", "realistic"] as const).map((id) => ({ id, label: id })), state.look, "look", (id) => {
    state.look = id as Look;
    draw();
  });
  fill("graticules", [{ id: "on", label: "On" }, { id: "off", label: "Off" }], state.graticule ? "on" : "off", "graticule", (id) => {
    state.graticule = id === "on";
    draw();
  });
  fill("sizes", [240, 320, 420, 560].map((size) => ({ id: String(size), label: String(size) })), String(state.size), "size", (id) => {
    state.size = Number(id);
    draw();
  });
  byId("kinds").replaceChildren(
    ...(Object.keys(KIND_WORDS) as Kind[]).map((kind) => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.role = "tab";
      tab.textContent = KIND_WORDS[kind];
      tab.dataset["testid"] = `kind-${kind}`;
      tab.setAttribute("aria-selected", String(kind === state.kind));
      tab.addEventListener("click", () => {
        state.kind = kind;
        draw();
      });
      return tab;
    }),
  );
  full = codeFor(state.look, state.kind, centre(), state.size, state.graticule);
  byId("code").textContent = full;
  const query = `look=${state.look}&center=${centre()}${state.graticule && state.look !== "realistic" ? "&graticule=1" : ""}`;
  byId<HTMLAnchorElement>("open").href = `embed.html?${query}`;
  byId("credit").textContent = state.look === "realistic" ? "The realistic Earth's pictures are NASA's (Blue Marble), public domain." : "Outlines: Natural Earth, public domain.";
  byId("status").textContent = "";
  const preview = byId("preview");
  const key = JSON.stringify([state.place, state.look, state.graticule, state.size >= 0]);
  if (preview.dataset["key"] !== key) {
    preview.dataset["key"] = key;
    if (state.look === "realistic") {
      const frame = document.createElement("iframe");
      frame.title = "The Earth";
      frame.width = "240";
      frame.height = "240";
      frame.style.border = "0";
      frame.src = `embed.html?${query}`;
      preview.replaceChildren(frame);
    } else {
      const element = document.createElement("chikyu-earth");
      element.setAttribute("size", "240");
      element.setAttribute("look", state.look);
      element.setAttribute("center", centre());
      if (state.graticule) element.setAttribute("graticule", "");
      preview.replaceChildren(element);
    }
  }
}

byId("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(full);
    byId("status").textContent = "Copied.";
  } catch {
    byId("status").textContent = "Your browser would not copy. Select the code and copy it.";
  }
});

draw();
document.documentElement.dataset["ready"] = "true";
