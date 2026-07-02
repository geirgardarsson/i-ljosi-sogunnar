import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import { store } from "./state";
import { initMap } from "./map";
import { initTimeline } from "./timeline";
import { initPanel } from "./panel";
import { initList } from "./list";
import { ERA_PRESETS } from "./eras";
import type { EpisodesFile } from "./types";

function wireHeader(): void {
  const search = document.getElementById("search") as HTMLInputElement;
  search.addEventListener("input", () => store.setQuery(search.value));

  const eraSelect = document.getElementById("era-preset") as HTMLSelectElement;
  const allOption = new Option("Öll tímabil", "");
  eraSelect.add(allOption);
  for (const p of ERA_PRESETS) eraSelect.add(new Option(p.label, p.value));
  const customOption = new Option("Sérsniðið", "custom");
  customOption.hidden = true;
  eraSelect.add(customOption);

  eraSelect.addEventListener("change", () => {
    const preset = ERA_PRESETS.find((p) => p.value === eraSelect.value);
    store.setBrush(preset ? [...preset.range] : null);
  });
  // Keep the dropdown honest when the brush is set elsewhere (timeline drag).
  store.on("filter", () => {
    if (!store.brush) {
      eraSelect.value = "";
      return;
    }
    const preset = ERA_PRESETS.find(
      (p) => p.range[0] === store.brush![0] && p.range[1] === store.brush![1],
    );
    eraSelect.value = preset ? preset.value : "custom";
  });

  const themeToggle = document.getElementById("theme-toggle") as HTMLButtonElement;
  themeToggle.addEventListener("click", () => store.setDark(!store.dark));
  store.on("theme", applyTheme);

  const viewToggle = document.getElementById("view-toggle") as HTMLButtonElement;
  viewToggle.addEventListener("click", () =>
    store.setView(store.view === "map" ? "list" : "map"),
  );
  store.on("view", () => {
    const list = document.getElementById("list")!;
    const mapEl = document.getElementById("map")!;
    const showList = store.view === "list";
    list.hidden = !showList;
    mapEl.style.display = showList ? "none" : "";
    viewToggle.setAttribute("aria-pressed", String(showList));
    viewToggle.textContent = showList ? "Kort" : "Listi";
  });
}

function applyTheme(): void {
  document.documentElement.dataset.theme = store.theme;
}

function wireAbout(): void {
  const dialog = document.getElementById("about") as HTMLDialogElement;
  document
    .getElementById("about-open")!
    .addEventListener("click", () => dialog.showModal());
  document
    .getElementById("about-close")!
    .addEventListener("click", () => dialog.close());
  // Click on the ::backdrop closes; it registers on the dialog element but
  // lands outside its box, unlike clicks in the dialog's own padding.
  dialog.addEventListener("click", (e) => {
    const r = dialog.getBoundingClientRect();
    const inside =
      e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) dialog.close();
  });
}

function wireKeyboard(): void {
  document.addEventListener("keydown", (e) => {
    if (document.querySelector("dialog[open]")) return; // Escape belongs to the dialog
    if (e.key === "Escape" && store.selectedId) store.select(null);
  });
}

async function main(): Promise<void> {
  applyTheme();
  wireHeader();
  wireAbout();
  wireKeyboard();

  const res = await fetch(`${import.meta.env.BASE_URL}data/episodes.json`);
  if (!res.ok) throw new Error(`episodes.json: ${res.status}`);
  const data = (await res.json()) as EpisodesFile;
  store.init(data.episodes);

  initMap(document.getElementById("map")!);
  initTimeline(document.getElementById("timeline") as unknown as SVGSVGElement);
  initPanel(document.getElementById("panel")!);
  initList(document.getElementById("list")!);
}

main().catch((err: unknown) => {
  console.error(err);
  const msg = document.createElement("p");
  msg.textContent = "Gat ekki hlaðið gögnum — reyndu að endurhlaða síðuna.";
  msg.style.cssText = "padding:2rem;text-align:center";
  document.getElementById("map")?.replaceChildren(msg);
});
