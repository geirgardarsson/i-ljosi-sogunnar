import maplibregl from "maplibre-gl";
import type { GeoJSONSource, MapLayerMouseEvent } from "maplibre-gl";
import { store } from "./state";
import { ERA_LABELS, ERA_RAMP, LAND_COLOR, eraIndex } from "./eras";
import type { Episode, PlaceKind } from "./types";
import { fmtSpans } from "./util";
import { hideTooltip, showTooltip } from "./tooltip";

const STYLE_URL: Record<"light" | "dark", string> = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

/** Neutral cluster chip (DESIGN.md §4) — inverted in dark mode for visibility. */
const CHIP: Record<"light" | "dark", { fill: string; text: string }> = {
  light: { fill: "#333d4a", text: "#ffffff" },
  dark: { fill: "#d7dde6", text: "#16181d" },
};

/** Sensible flyTo zoom per gazetteer kind (place.zoom overrides). */
const KIND_ZOOM: Record<PlaceKind, number> = {
  city: 8,
  landmark: 9,
  region: 5.5,
  country: 4.5,
  water: 5,
};

/**
 * One map marker. Parts of a series sharing a primary place collapse into a
 * single group (DESIGN.md §4); everything else is a group of one. Repeats and
 * place-less placeholder episodes get no marker at all.
 */
interface MarkerGroup {
  key: string;
  episodes: Episode[]; // series parts in part order; [0] is the representative
  lon: number;
  lat: number;
  era: number;
  years: string;
  placeName: string;
}

let map: maplibregl.Map;
let groups: MarkerGroup[] = [];
let groupByKey = new Map<string, MarkerGroup>();
let groupByEpisodeId = new Map<string, MarkerGroup>();
let legendEl: HTMLElement;
/** Cached tooltip for the last-hovered cluster — cluster ids are only stable
 * until the next setData, so refreshMatches invalidates this. */
let clusterTip: { id: number; lines: string[] } | null = null;

function buildGroups(episodes: Episode[]): MarkerGroup[] {
  const byKey = new Map<string, Episode[]>();
  for (const ep of episodes) {
    if (ep.repeatOf) continue; // map shows only the original broadcast
    const primary = ep.places.find((p) => p.role === "primary");
    if (!primary) continue; // 13 RÚV placeholders are list-only
    const key = ep.series ? `s:${ep.series.key}:${primary.slug}` : `e:${ep.id}`;
    (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(ep);
  }
  return [...byKey.entries()].map(([key, eps]) => {
    eps.sort((a, b) => (a.series?.part ?? 0) - (b.series?.part ?? 0));
    const rep = eps[0];
    const primary = rep.places.find((p) => p.role === "primary")!;
    const starts = eps.flatMap((e) => e.spans.map((s) => s.start));
    const ends = eps.flatMap((e) => e.spans.map((s) => s.end));
    return {
      key,
      episodes: eps,
      lon: primary.lon,
      lat: primary.lat,
      era: eraIndex(rep),
      years: starts.length
        ? fmtSpans([{ start: Math.min(...starts), end: Math.max(...ends) }])
        : "",
      placeName: primary.name,
    };
  });
}

function toGeoJSON(): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: groups.map((g) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [g.lon, g.lat] },
      properties: {
        key: g.key,
        era: g.era,
        count: g.episodes.length,
        match: g.episodes.some((e) => store.matches(e)) ? 1 : 0,
      },
    })),
  };
}

function addLayers(): void {
  const theme = store.theme;
  const ramp = ERA_RAMP[theme];
  const chip = CHIP[theme];

  map.addSource("episodes", {
    type: "geojson",
    data: toGeoJSON(),
    cluster: true,
    clusterRadius: 42,
    clusterMaxZoom: 12,
    clusterProperties: { matched: ["+", ["get", "match"]] },
  });
  map.addSource("hover", { type: "geojson", data: emptyFC() });
  map.addSource("selection", { type: "geojson", data: emptyFC() });

  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "episodes",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": chip.fill,
      "circle-radius": ["step", ["get", "point_count"], 12, 10, 16, 25, 20],
      "circle-opacity": ["case", [">", ["get", "matched"], 0], 0.92, 0.15],
    },
  });
  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "episodes",
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["to-string", ["get", "matched"]],
      "text-font": ["Noto Sans Regular"],
      "text-size": 12,
      "text-allow-overlap": true,
    },
    paint: {
      "text-color": chip.text,
      "text-opacity": ["case", [">", ["get", "matched"], 0], 1, 0],
    },
  });

  // Selection underlay: hairline arcs + hollow secondaries + ring around the
  // selected primary, all beneath the marker dots.
  map.addLayer({
    id: "sel-arcs",
    type: "line",
    source: "selection",
    filter: ["==", ["geometry-type"], "LineString"],
    paint: { "line-color": chip.fill, "line-width": 1, "line-opacity": 0.55 },
  });
  map.addLayer({
    id: "sel-secondaries",
    type: "circle",
    source: "selection",
    filter: ["==", ["get", "role"], "secondary"],
    paint: {
      "circle-radius": 4.5,
      "circle-opacity": 0,
      "circle-stroke-width": 2,
      "circle-stroke-color": ["to-color", ["get", "color"]],
    },
  });
  map.addLayer({
    id: "sel-primary-ring",
    type: "circle",
    source: "selection",
    filter: ["==", ["get", "role"], "primary"],
    paint: {
      "circle-radius": 9,
      "circle-opacity": 0,
      "circle-stroke-width": 2,
      "circle-stroke-color": ["to-color", ["get", "color"]],
    },
  });

  map.addLayer({
    id: "hover-ring",
    type: "circle",
    source: "hover",
    paint: {
      "circle-radius": 8.5,
      "circle-opacity": 0,
      "circle-stroke-width": 2,
      "circle-stroke-color": chip.fill,
      "circle-stroke-opacity": 0.8,
    },
  });

  map.addLayer({
    id: "markers",
    type: "circle",
    source: "episodes",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": [
        "match", ["get", "era"],
        0, ramp[0], 1, ramp[1], 2, ramp[2], 3, ramp[3],
        ramp[4],
      ],
      "circle-radius": 5,
      "circle-stroke-width": 2,
      "circle-stroke-color": LAND_COLOR[theme],
      "circle-opacity": ["case", ["==", ["get", "match"], 1], 1, 0.15],
      "circle-stroke-opacity": ["case", ["==", ["get", "match"], 1], 1, 0.1],
    },
  });
  map.addLayer({
    id: "marker-badges",
    type: "symbol",
    source: "episodes",
    filter: ["all", ["!", ["has", "point_count"]], [">", ["get", "count"], 1]],
    layout: {
      "text-field": ["to-string", ["get", "count"]],
      "text-font": ["Noto Sans Regular"],
      "text-size": 10,
      "text-offset": [0.9, -0.9],
      "text-allow-overlap": true,
    },
    paint: {
      "text-color": chip.fill,
      "text-halo-color": LAND_COLOR[theme],
      "text-halo-width": 1.2,
      "text-opacity": ["case", ["==", ["get", "match"], 1], 1, 0.15],
    },
  });

  reflectSelection();
}

function emptyFC(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function refreshMatches(): void {
  clusterTip = null;
  (map.getSource("episodes") as GeoJSONSource | undefined)?.setData(toGeoJSON());
}

function reflectSelection(): void {
  const source = map.getSource("selection") as GeoJSONSource | undefined;
  if (!source) return;
  const ep = store.selectedId ? store.byId.get(store.selectedId) : undefined;
  const primary = ep?.places.find((p) => p.role === "primary");
  if (!ep || !primary) {
    source.setData(emptyFC());
    return;
  }
  const color = ERA_RAMP[store.theme][eraIndex(ep)];
  const features: GeoJSON.Feature[] = [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [primary.lon, primary.lat] },
      properties: { role: "primary", color },
    },
  ];
  for (const p of ep.places.filter((p) => p.role === "secondary")) {
    features.push(
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lon, p.lat] },
        properties: { role: "secondary", color, name: p.name, note: p.note ?? "" },
      },
      {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [primary.lon, primary.lat],
            [p.lon, p.lat],
          ],
        },
        properties: {},
      },
    );
  }
  source.setData({ type: "FeatureCollection", features });

  if (store.selectFly) {
    const zoom = primary.zoom ?? KIND_ZOOM[primary.kind];
    const target = {
      center: [primary.lon, primary.lat] as [number, number],
      zoom: Math.min(zoom, Math.max(map.getZoom(), zoom - 2)),
    };
    if (REDUCED_MOTION) map.jumpTo(target);
    else map.flyTo({ ...target, speed: 1.4 });
  }
}

/** Hover coming from the timeline or list: ring the matching markers. */
function reflectExternalHover(): void {
  const source = map.getSource("hover") as GeoJSONSource | undefined;
  if (!source) return;
  if (!store.hover || store.hover.source === "map") {
    if (!store.hover) source.setData(emptyFC());
    return;
  }
  const seen = new Set<MarkerGroup>();
  for (const id of store.hover.ids) {
    const g = groupByEpisodeId.get(id);
    if (g) seen.add(g);
  }
  source.setData({
    type: "FeatureCollection",
    features: [...seen].map((g) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [g.lon, g.lat] },
      properties: {},
    })),
  });
}

function setHoverRing(gs: MarkerGroup[]): void {
  (map.getSource("hover") as GeoJSONSource | undefined)?.setData({
    type: "FeatureCollection",
    features: gs.map((g) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [g.lon, g.lat] },
      properties: {},
    })),
  });
}

function groupTooltipLines(g: MarkerGroup): string[] {
  const rep = g.episodes[0];
  const title =
    g.episodes.length > 1 ? `${rep.title} · ${g.episodes.length} hlutar` : rep.title;
  return [title, g.years ? `${g.placeName} · ${g.years}` : g.placeName];
}

/** Tooltip for a cluster chip: episode total + the places inside it. */
function clusterTooltipLines(gs: MarkerGroup[]): string[] {
  const total = gs.reduce((n, g) => n + g.episodes.length, 0);
  const perPlace = new Map<string, number>();
  for (const g of gs) {
    perPlace.set(g.placeName, (perPlace.get(g.placeName) ?? 0) + g.episodes.length);
  }
  const places = [...perPlace.entries()].sort((a, b) => b[1] - a[1]);
  const shown = places
    .slice(0, 3)
    .map(([name, n]) => (places.length > 1 && n > 1 ? `${name} (${n})` : name));
  const placeLine =
    shown.join(", ") + (places.length > 3 ? ` og ${places.length - 3} fleiri` : "");
  return [`${total} ${total === 1 ? "þáttur" : "þættir"}`, placeLine];
}

/** Chooser popup when several marker groups sit on the same pixel/coords. */
function openChooser(lngLat: maplibregl.LngLatLike, gs: MarkerGroup[]): void {
  const wrap = document.createElement("div");
  wrap.className = "chooser";
  for (const g of gs) {
    for (const ep of g.episodes) {
      const btn = document.createElement("button");
      btn.type = "button";
      const title = document.createElement("span");
      title.textContent = ep.title;
      const years = document.createElement("span");
      years.className = "chooser-years";
      years.textContent = fmtSpans(ep.spans);
      btn.append(title, years);
      btn.addEventListener("click", () => {
        popup.remove();
        store.select(ep.id, { fly: false });
      });
      wrap.append(btn);
    }
  }
  const popup = new maplibregl.Popup({ closeButton: false, maxWidth: "320px" })
    .setLngLat(lngLat)
    .setDOMContent(wrap)
    .addTo(map);
}

function onMarkerClick(e: MapLayerMouseEvent): void {
  const feats = map.queryRenderedFeatures(e.point, { layers: ["markers"] });
  const keys = [...new Set(feats.map((f) => f.properties.key as string))];
  const gs = keys.map((k) => groupByKey.get(k)!).filter(Boolean);
  if (gs.length === 0) return;
  if (gs.length === 1 && gs[0].episodes.length === 1) {
    store.select(gs[0].episodes[0].id, { fly: false });
  } else {
    openChooser(e.lngLat, gs);
  }
}

async function onClusterClick(e: MapLayerMouseEvent): Promise<void> {
  const feature = e.features?.[0];
  if (!feature) return;
  const clusterId = feature.properties.cluster_id as number;
  const source = map.getSource("episodes") as GeoJSONSource;
  const zoom = await source.getClusterExpansionZoom(clusterId);
  const center = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
  if (zoom > (map.getMaxZoom() ?? 18) || zoom > 13) {
    // Cluster of coincident points that will never uncluster: list them instead.
    const leaves = (await source.getClusterLeaves(clusterId, Infinity, 0)) as GeoJSON.Feature[];
    const gs = leaves
      .map((l) => groupByKey.get((l.properties as { key: string }).key)!)
      .filter(Boolean);
    openChooser(e.lngLat, gs);
  } else {
    map.easeTo({ center, zoom });
  }
}

/**
 * Keyboard path to the canvas markers (DESIGN.md §5): a visually hidden
 * button per marker group in firstrun order. Focus rings the marker and
 * lifts its timeline bins; Enter opens the detail panel.
 */
function buildKeyboardMarkers(container: HTMLElement): void {
  const nav = document.createElement("nav");
  nav.className = "kbd-markers";
  nav.setAttribute("aria-label", "Sögustaðir á kortinu");
  const ul = document.createElement("ul");
  const ordered = [...groups].sort((a, b) =>
    a.episodes[0].firstrun.localeCompare(b.episodes[0].firstrun),
  );
  for (const g of ordered) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    const rep = g.episodes[0];
    const primary = rep.places.find((p) => p.role === "primary")!;
    btn.textContent = `${rep.title}${
      g.episodes.length > 1 ? ` (${g.episodes.length} hlutar)` : ""
    } — ${primary.name}${g.years ? `, ${g.years}` : ""}`;
    btn.addEventListener("focus", () => {
      setHoverRing([g]);
      store.setHover({ ids: g.episodes.map((e) => e.id), source: "map" });
    });
    btn.addEventListener("blur", () => {
      setHoverRing([]);
      store.setHover(null);
    });
    btn.addEventListener("click", () => store.select(rep.id));
    li.append(btn);
    ul.append(li);
  }
  nav.append(ul);
  container.append(nav);
}

const REDUCED_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

function buildLegend(container: HTMLElement): void {
  legendEl = document.createElement("div");
  legendEl.className = "legend";
  legendEl.setAttribute("aria-label", "Litaskýring tímabila");
  container.append(legendEl);
  renderLegend();
}

function renderLegend(): void {
  const ramp = ERA_RAMP[store.theme];
  legendEl.replaceChildren(
    ...ERA_LABELS.map((label, i) => {
      const row = document.createElement("div");
      row.className = "legend-row";
      const dot = document.createElement("span");
      dot.className = "legend-dot";
      dot.style.background = ramp[i];
      const text = document.createElement("span");
      text.textContent = label;
      row.append(dot, text);
      return row;
    }),
  );
}

export function initMap(container: HTMLElement): void {
  groups = buildGroups(store.episodes);
  groupByKey = new Map(groups.map((g) => [g.key, g]));
  groupByEpisodeId = new Map(groups.flatMap((g) => g.episodes.map((e) => [e.id, g])));

  map = new maplibregl.Map({
    container,
    style: STYLE_URL[store.theme],
    center: [10, 25],
    zoom: 1.4,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  map.on("load", addLayers);

  map.on("mousemove", "markers", (e) => {
    map.getCanvas().style.cursor = "pointer";
    const key = e.features?.[0]?.properties.key as string | undefined;
    const g = key ? groupByKey.get(key) : undefined;
    if (!g) return;
    setHoverRing([g]);
    showTooltip(groupTooltipLines(g), e.originalEvent.clientX, e.originalEvent.clientY);
    store.setHover({ ids: g.episodes.map((ep) => ep.id), source: "map" });
  });
  map.on("mouseleave", "markers", () => {
    map.getCanvas().style.cursor = "";
    setHoverRing([]);
    hideTooltip();
    store.setHover(null);
  });
  // Cluster tooltips need an async leaf lookup; cache per cluster id and
  // drop results that resolve after the pointer has moved on.
  let hoveredClusterId: number | null = null;
  map.on("mousemove", "clusters", (e) => {
    map.getCanvas().style.cursor = "pointer";
    const feature = e.features?.[0];
    if (!feature) return;
    const clusterId = feature.properties.cluster_id as number;
    const { clientX, clientY } = e.originalEvent;
    hoveredClusterId = clusterId;
    if (clusterTip?.id === clusterId) {
      showTooltip(clusterTip.lines, clientX, clientY);
      return;
    }
    const source = map.getSource("episodes") as GeoJSONSource;
    void source.getClusterLeaves(clusterId, Infinity, 0).then((leaves) => {
      if (hoveredClusterId !== clusterId) return;
      const gs = (leaves as GeoJSON.Feature[])
        .map((l) => groupByKey.get((l.properties as { key: string }).key)!)
        .filter(Boolean);
      clusterTip = { id: clusterId, lines: clusterTooltipLines(gs) };
      showTooltip(clusterTip.lines, clientX, clientY);
    });
  });
  map.on("mouseleave", "clusters", () => {
    map.getCanvas().style.cursor = "";
    hoveredClusterId = null;
    hideTooltip();
  });

  map.on("mousemove", "sel-secondaries", (e) => {
    const props = e.features?.[0]?.properties as { name?: string; note?: string } | undefined;
    if (!props?.name) return;
    showTooltip(
      [props.name, props.note || "Tengdur staður"],
      e.originalEvent.clientX,
      e.originalEvent.clientY,
    );
  });
  map.on("mouseleave", "sel-secondaries", hideTooltip);
  map.on("click", "markers", onMarkerClick);
  map.on("click", "clusters", (e) => {
    void onClusterClick(e);
  });

  store.on("filter", refreshMatches);
  store.on("select", reflectSelection);
  store.on("hover", reflectExternalHover);
  store.on("theme", () => {
    map.setStyle(STYLE_URL[store.theme]);
    map.once("styledata", () => {
      // setStyle drops custom sources/layers; rebuild them on the new style.
      addLayers();
      renderLegend();
    });
  });

  buildLegend(container);
  buildKeyboardMarkers(container);

  // Dev-only handle for browser-automation tests.
  if (import.meta.env.DEV) (window as { __map?: maplibregl.Map }).__map = map;
}

/** Pan the map to a place without selecting anything (place-chip hover). */
export function panToPlace(lon: number, lat: number): void {
  if (REDUCED_MOTION) map.jumpTo({ center: [lon, lat] });
  else map.easeTo({ center: [lon, lat], duration: 600 });
}
