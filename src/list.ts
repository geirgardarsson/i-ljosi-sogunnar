import { store } from "./state";
import { fmtDate, fmtSpans } from "./util";
import type { Episode } from "./types";

/**
 * „Listi" — a drawer of every episode honoring the active filters, shown
 * beside the map (desktop) or over it (mobile). Compact sortable rows; the
 * accessibility fallback: every value readable without hover, repeats and
 * place-less placeholder episodes included (DESIGN.md §5).
 */

type SortKey = "title" | "years" | "place" | "firstrun";

let root: HTMLElement;
let sortKey: SortKey = "firstrun";
let sortAsc = false;

const SORTS: { key: SortKey; label: string }[] = [
  { key: "title", label: "Þáttur" },
  { key: "years", label: "Ártöl" },
  { key: "place", label: "Staður" },
  { key: "firstrun", label: "Frumflutt" },
];

/** On phones the list covers the map, so selecting an episode closes it. */
const mobile = window.matchMedia?.("(max-width: 720px)");

function primaryPlace(ep: Episode): string {
  return ep.places.find((p) => p.role === "primary")?.name ?? "";
}

function sortValue(ep: Episode): string | number {
  switch (sortKey) {
    case "title":
      return ep.title.toLowerCase();
    case "years":
      return ep.spans.length ? Math.min(...ep.spans.map((s) => s.start)) : Infinity;
    case "place":
      return primaryPlace(ep).toLowerCase() || "￿"; // place-less rows sort last
    case "firstrun":
      return ep.firstrun;
  }
}

function tag(cls: string, text: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = cls;
  span.textContent = text;
  return span;
}

function renderHeader(count: number): HTMLElement {
  const header = document.createElement("div");
  header.className = "list-header";

  const countEl = document.createElement("p");
  countEl.className = "list-count";
  countEl.textContent = `${count} ${count === 1 ? "þáttur" : "þættir"} · raða eftir`;

  const sorts = document.createElement("div");
  sorts.className = "list-sort";
  sorts.setAttribute("role", "group");
  sorts.setAttribute("aria-label", "Röðun");
  for (const s of SORTS) {
    const btn = document.createElement("button");
    const active = s.key === sortKey;
    btn.className = "chip list-sort-chip";
    btn.textContent = active ? `${s.label} ${sortAsc ? "↑" : "↓"}` : s.label;
    btn.setAttribute("aria-pressed", String(active));
    btn.addEventListener("click", () => {
      if (sortKey === s.key) sortAsc = !sortAsc;
      else {
        sortKey = s.key;
        sortAsc = s.key === "title" || s.key === "place";
      }
      render();
    });
    sorts.append(btn);
  }

  header.append(countEl, sorts);
  return header;
}

function renderRow(ep: Episode): HTMLLIElement {
  const li = document.createElement("li");
  const btn = document.createElement("button");
  btn.className = "list-row";
  btn.dataset.id = ep.id;
  if (ep.id === store.selectedId) btn.classList.add("selected");

  const titleLine = document.createElement("span");
  titleLine.className = "list-row-title";
  titleLine.textContent = ep.title;
  if (ep.repeatOf) titleLine.append(" ", tag("list-tag", "endurflutningur"));
  if (ep.series) titleLine.append(" ", tag("list-tag", `hluti ${ep.series.part}/${ep.series.of}`));

  const meta = document.createElement("span");
  meta.className = "list-row-meta";
  const secondaries = ep.places.filter((p) => p.role === "secondary").length;
  const place =
    primaryPlace(ep) + (secondaries ? ` +${secondaries}` : "");
  meta.textContent = [fmtSpans(ep.spans), place, fmtDate(ep.firstrun)]
    .filter(Boolean)
    .join(" · ");

  btn.append(titleLine, meta);
  btn.addEventListener("click", () => {
    store.select(ep.id);
    if (mobile?.matches) store.setListOpen(false);
  });
  btn.addEventListener("mouseenter", () => store.setHover({ ids: [ep.id], source: "list" }));
  btn.addEventListener("mouseleave", () => {
    if (store.hover?.source === "list") store.setHover(null);
  });

  li.append(btn);
  return li;
}

function render(): void {
  if (!store.listOpen) return;

  const episodes = store.episodes.filter((ep) => store.matches(ep));
  episodes.sort((a, b) => {
    const va = sortValue(a);
    const vb = sortValue(b);
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return sortAsc ? cmp : -cmp;
  });

  const ul = document.createElement("ul");
  ul.className = "list-rows";
  for (const ep of episodes) ul.append(renderRow(ep));

  root.replaceChildren(renderHeader(episodes.length), ul);
}

/** Keep the selected row visible without re-rendering the whole list. */
function reflectSelection(): void {
  if (!store.listOpen) return;
  root.querySelector(".list-row.selected")?.classList.remove("selected");
  if (!store.selectedId) return;
  const row = root.querySelector<HTMLButtonElement>(
    `.list-row[data-id="${CSS.escape(store.selectedId)}"]`,
  );
  if (row) {
    row.classList.add("selected");
    row.scrollIntoView({ block: "nearest" });
  }
}

export function initList(container: HTMLElement): void {
  root = container;
  store.on("view", render);
  store.on("filter", render);
  store.on("select", reflectSelection);
}
