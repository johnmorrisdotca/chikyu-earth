// "Put it in your page": the family's <kazoku-embed-panel>, filled with this package's choices (a place, a look, the graticule, a size) and its code for every way a page is made.
// The index page and the code builder share it. `flatPreview` puts the picture in a frame of the embed page, at a flat look, so a page that already runs the realistic Earth never runs a second WebGL view and has one `<chikyu-earth>` of its own.
import "@johnmorrisdotca/kazoku-ui/embed-panel/define";
import type { EmbedChangeDetail, EmbedPanelElement } from "@johnmorrisdotca/kazoku-ui/embed-panel/element";
import "../src/element.ts";
import { centreOf, creditOf, embedCode, embedQuery, LOOKS, PLACES, SIZES, START, type Choice, type Look } from "./embed-code.ts";
import type { EmbedKind } from "@johnmorrisdotca/kazoku-ui/embed-panel";

export interface Section {
  /** Draw the panel again after the page's language changed. */
  update(): void;
}

export interface SectionOptions {
  /** The words for the choices; English where a key is missing. */
  say?: (key: string, fallback: string) => string;
  /** Never put the realistic Earth in the picture (the page has its own); the flat globe stands in. */
  flatPreview: boolean;
  /** The page's language, `en` or `ja`. */
  lang?: () => string;
}

export function mountEmbedSection(panel: EmbedPanelElement, options: SectionOptions): Section {
  const say = options.say ?? ((_key: string, fallback: string) => fallback);
  const state = { look: START.look, graticule: START.graticule };
  const choice = (): Choice => ({ place: panel.value || START.place, look: state.look, graticule: state.graticule, size: panel.size });
  panel.sizes = SIZES;
  panel.size = START.size;
  const items = PLACES.map((place) => ({ id: place.id, label: place.label }));
  const offer = (): void => {
    panel.items = items;
    panel.value = START.place;
  };
  // The panel scrolls its chosen place into view when it first draws the places, which would carry a page that has the panel low down to it on load: here the places are offered once the panel is in sight.
  if (options.flatPreview && typeof IntersectionObserver === "function") {
    const watch = new IntersectionObserver((seen) => {
      if (!seen.some((one) => one.isIntersecting)) return;
      watch.disconnect();
      offer();
    });
    watch.observe(panel);
  } else offer();
  panel.setAttribute("no-search", "");
  panel.setAttribute("docs-href", "docs/");

  const row = (id: string, title: string): { box: HTMLElement; set(choices: readonly { id: string; label: string }[], chosen: string, on: (id: string) => void): void } => {
    const holder = document.createElement("div");
    holder.className = "fam-row";
    const label = document.createElement("span");
    label.className = "fam-label";
    label.id = `${id}-title`;
    label.textContent = title;
    const box = document.createElement("div");
    box.className = "fam-seg";
    box.id = id;
    box.setAttribute("role", "radiogroup");
    box.setAttribute("aria-labelledby", label.id);
    holder.append(label, box);
    return {
      box: holder,
      set(choices, chosen, on) {
        box.replaceChildren(
          ...choices.map((choice) => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = choice.label;
            button.dataset["testid"] = `${id}-${choice.id}`;
            button.setAttribute("role", "radio");
            button.setAttribute("aria-checked", String(choice.id === chosen));
            button.addEventListener("click", () => on(choice.id));
            return button;
          }),
        );
      },
    };
  };
  const looks = row("embed-looks", "Look");
  const graticules = row("embed-graticules", "Graticule");
  const slot = document.createElement("div");
  slot.slot = "options";
  slot.append(looks.box, graticules.box);
  panel.append(slot);

  const draw = (): void => {
    looks.set(
      LOOKS.map((id) => ({ id, label: say(`look_${id}`, `${id[0]!.toUpperCase()}${id.slice(1)}`) })),
      state.look,
      (id) => {
        state.look = id as Look;
        draw();
      },
    );
    graticules.set(
      [{ id: "on", label: say("embedOn", "On") }, { id: "off", label: say("embedOff", "Off") }],
      state.graticule ? "on" : "off",
      (id) => {
        state.graticule = id === "on";
        draw();
      },
    );
    (looks.box.firstElementChild as HTMLElement).textContent = say("look", "Look");
    (graticules.box.firstElementChild as HTMLElement).textContent = say("graticule", "Graticule");
    panel.setAttribute("lang", options.lang?.() ?? "en");
    panel.openHref = `embed.html?${embedQuery(choice())}`;
    panel.update();
  };

  panel.generate = ({ kind, preview }) => embedCode(kind as EmbedKind, choice(), preview);
  panel.preview = ({ kind }) => {
    const now = choice();
    // On the index page the picture is the embed page in a frame, so the page has one `<chikyu-earth>` of its own and the realistic Earth never runs twice: the flat globe stands in for it.
    const frameLook = options.flatPreview && now.look === "realistic" ? "thick" : now.look;
    if (now.look === "realistic" || options.flatPreview) {
      const frame = document.createElement("iframe");
      frame.className = "embed-frame";
      frame.title = "The Earth";
      frame.width = String(now.size);
      frame.height = String(now.size);
      frame.style.border = "0";
      frame.src = `embed.html?${embedQuery({ ...now, look: frameLook })}`;
      return frame;
    }
    if (kind === "iframe") return undefined;
    const flat = document.createElement("chikyu-earth");
    flat.setAttribute("size", String(now.size));
    flat.setAttribute("look", now.look);
    flat.setAttribute("center", centreOf(now.place));
    if (now.graticule) flat.setAttribute("graticule", "");
    return flat;
  };
  panel.note = ({ kind }) => (kind === "iframe" ? say("embedFrameNote", "One iframe, no script of your own. The address chooses what it shows: look, centre, graticule.") : "");
  panel.credits = () => creditOf(state.look);
  panel.addEventListener("kazoku-embedchange", (event) => {
    if ((event as CustomEvent<EmbedChangeDetail>).detail.reason === "pick") draw();
  });
  draw();
  return { update: draw };
}
