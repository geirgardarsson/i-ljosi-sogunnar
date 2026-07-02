import { store } from "./state";
import { panToPlace } from "./map";
import { fmtDate, fmtDuration, fmtSpan } from "./util";
import type { Episode } from "./types";

/**
 * Detail panel (DESIGN.md §5): artwork, title, year/place chips, description,
 * audio on the direct RÚV MP3, RÚV link, series navigation. All episode data
 * is untrusted RÚV input — only textContent, never innerHTML.
 */

let root: HTMLElement;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = "",
  text = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
}

function seriesParts(ep: Episode): Episode[] {
  if (!ep.series) return [];
  const key = ep.series.key;
  return store.episodes
    .filter((e) => e.series?.key === key)
    .sort((a, b) => a.series!.part - b.series!.part);
}

function render(): void {
  const ep = store.selectedId ? store.byId.get(store.selectedId) : undefined;
  if (!ep) {
    root.hidden = true;
    root.replaceChildren();
    return;
  }
  root.hidden = false;

  const close = el("button", "panel-close", "×");
  close.setAttribute("aria-label", "Loka þáttaspjaldi");
  close.addEventListener("click", () => store.select(null));

  const frag: (HTMLElement | Text)[] = [close];

  if (ep.image) {
    const img = el("img", "panel-img") as HTMLImageElement;
    img.src = ep.image;
    img.alt = "";
    img.loading = "lazy";
    frag.push(img);
  }

  const body = el("div", "panel-body");
  body.append(el("h2", "panel-title", ep.title));

  const meta = el("p", "panel-meta");
  meta.textContent = `Frumflutt ${fmtDate(ep.firstrun)}${
    ep.durationSec ? ` · ${fmtDuration(ep.durationSec)}` : ""
  }`;
  body.append(meta);

  if (ep.repeatOf) {
    const orig = store.byId.get(ep.repeatOf);
    if (orig) {
      const note = el("p", "panel-repeat");
      note.append("Endurflutningur — ");
      const link = el("button", "linklike", orig.title);
      link.addEventListener("click", () => store.select(orig.id));
      note.append(link);
      body.append(note);
    }
  }

  if (ep.spans.length) {
    const chips = el("div", "chips");
    for (const span of ep.spans) {
      const chip = el("button", "chip chip-year", fmtSpan(span));
      chip.title = "Velja þetta tímabil á tímalínunni";
      chip.addEventListener("click", () => store.setBrush([span.start, span.end]));
      chips.append(chip);
    }
    body.append(chips);
  }

  if (ep.places.length) {
    const chips = el("div", "chips");
    for (const place of ep.places) {
      const chip = el(
        "button",
        `chip chip-place${place.role === "primary" ? " primary" : ""}`,
        place.name,
      );
      if (place.note) chip.append(el("span", "chip-note", place.note));
      chip.addEventListener("mouseenter", () => panToPlace(place.lon, place.lat));
      chip.addEventListener("focus", () => panToPlace(place.lon, place.lat));
      chips.append(chip);
    }
    body.append(chips);
  }

  body.append(el("p", "panel-desc", ep.description));

  if (ep.audio) {
    const audio = el("audio") as HTMLAudioElement;
    audio.controls = true;
    audio.preload = "none";
    audio.src = ep.audio;
    body.append(audio);
  }

  const links = el("p", "panel-links");
  const ruv = el("a", "", "Opna á RÚV ↗") as HTMLAnchorElement;
  ruv.href = ep.ruv;
  ruv.target = "_blank";
  ruv.rel = "noopener";
  links.append(ruv);
  body.append(links);

  if (ep.series) {
    const nav = el("nav", "panel-series");
    nav.setAttribute("aria-label", "Þáttaröð");
    nav.append(el("p", "panel-series-label", `Hluti ${ep.series.part} af ${ep.series.of}`));
    const list = el("div", "panel-series-parts");
    for (const part of seriesParts(ep)) {
      const btn = el("button", "linklike", `${part.series!.part}. ${part.title}`);
      if (part.id === ep.id) {
        btn.disabled = true;
        btn.setAttribute("aria-current", "true");
      } else {
        btn.addEventListener("click", () => store.select(part.id));
      }
      list.append(btn);
    }
    nav.append(list);
    body.append(nav);
  }

  frag.push(body);
  root.replaceChildren(...frag);
  root.scrollTop = 0;
}

export function initPanel(container: HTMLElement): void {
  root = container;
  store.on("select", render);
}
