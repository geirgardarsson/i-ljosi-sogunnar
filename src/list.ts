import { store } from "./state";
import { fmtDate, fmtSpans } from "./util";
import type { Episode } from "./types";

/**
 * „Listi" — sortable table of every episode honoring the active filters.
 * The accessibility fallback: every value readable without hover, repeats
 * and place-less placeholder episodes included (DESIGN.md §5).
 */

type SortKey = "title" | "years" | "place" | "firstrun";

let root: HTMLElement;
let sortKey: SortKey = "firstrun";
let sortAsc = false;

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "title", label: "Þáttur" },
  { key: "years", label: "Ártöl" },
  { key: "place", label: "Staðir" },
  { key: "firstrun", label: "Frumflutt" },
];

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

function render(): void {
  if (store.view !== "list") return;

  const episodes = store.episodes.filter((ep) => store.matches(ep));
  episodes.sort((a, b) => {
    const va = sortValue(a);
    const vb = sortValue(b);
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return sortAsc ? cmp : -cmp;
  });

  const table = document.createElement("table");
  table.className = "list-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const col of COLUMNS) {
    const th = document.createElement("th");
    th.setAttribute(
      "aria-sort",
      col.key === sortKey ? (sortAsc ? "ascending" : "descending") : "none",
    );
    const btn = document.createElement("button");
    btn.textContent = col.key === sortKey ? `${col.label} ${sortAsc ? "↑" : "↓"}` : col.label;
    btn.addEventListener("click", () => {
      if (sortKey === col.key) sortAsc = !sortAsc;
      else {
        sortKey = col.key;
        sortAsc = col.key === "title" || col.key === "place";
      }
      render();
    });
    th.append(btn);
    headRow.append(th);
  }
  thead.append(headRow);
  table.append(thead);

  const tbody = document.createElement("tbody");
  for (const ep of episodes) {
    const tr = document.createElement("tr");
    if (ep.id === store.selectedId) tr.classList.add("selected");

    const tdTitle = document.createElement("td");
    const btn = document.createElement("button");
    btn.className = "linklike list-title";
    btn.textContent = ep.title;
    btn.addEventListener("click", () => store.select(ep.id));
    tdTitle.append(btn);
    if (ep.repeatOf) {
      tdTitle.append(" ");
      const tag = document.createElement("span");
      tag.className = "list-repeat";
      tag.textContent = "endurflutningur";
      tdTitle.append(tag);
    }
    if (ep.series) {
      tdTitle.append(" ");
      const tag = document.createElement("span");
      tag.className = "list-series";
      tag.textContent = `hluti ${ep.series.part}/${ep.series.of}`;
      tdTitle.append(tag);
    }

    const tdYears = document.createElement("td");
    tdYears.textContent = fmtSpans(ep.spans);
    const tdPlace = document.createElement("td");
    tdPlace.textContent = ep.places.map((p) => p.name).join(", ");
    const tdDate = document.createElement("td");
    tdDate.textContent = fmtDate(ep.firstrun);

    tr.append(tdTitle, tdYears, tdPlace, tdDate);
    tr.addEventListener("mouseenter", () =>
      store.setHover({ ids: [ep.id], source: "list" }),
    );
    tr.addEventListener("mouseleave", () => {
      if (store.hover?.source === "list") store.setHover(null);
    });
    tbody.append(tr);
  }
  table.append(tbody);

  const count = document.createElement("p");
  count.className = "list-count";
  count.textContent = `${episodes.length} þættir`;

  root.replaceChildren(count, table);
}

export function initList(container: HTMLElement): void {
  root = container;
  store.on("view", render);
  store.on("filter", render);
  store.on("select", render);
}
