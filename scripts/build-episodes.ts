/**
 * Merge data/catalog.json + data/annotations.json + data/places.json into
 * public/data/episodes.json — the single file the app loads. The client does
 * no joining: place refs are resolved to inline coords, and per-episode RÚV
 * links are derived here.
 *
 * Re-validates the curation invariants (also enforced at merge time by
 * scripts/merge-batch.py) and fails hard on any violation, so a bad hand-edit
 * of the curated files can never reach the app silently.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const RUV_EPISODE_BASE = "https://www.ruv.is/utvarp/spila/i-ljosi-sogunnar/23795";

interface CatalogEpisode {
  id: string;
  title: string;
  description: string;
  firstrun: string;
  durationSec: number | null;
  audio: string | null;
  image: string | null;
}

interface PlaceEntry {
  name: string;
  kind: "city" | "region" | "country" | "landmark" | "water";
  lat: number;
  lon: number;
  zoom?: number;
  q?: string;
  skipVerify?: boolean;
}

interface Annotation {
  subject: string;
  series?: { key: string; part: number; of: number };
  places: { ref: string; role: "primary" | "secondary"; note?: string }[];
  spans: { start: number; end: number; approx?: boolean }[];
  confidence: "high" | "medium" | "low";
  repeatOf?: string;
  todo?: string; // internal curation note — never shipped to the client
}

interface EpisodePlace {
  slug: string;
  name: string;
  kind: PlaceEntry["kind"];
  lat: number;
  lon: number;
  role: "primary" | "secondary";
  note?: string;
  zoom?: number;
}

const catalog = JSON.parse(readFileSync("data/catalog.json", "utf8")) as {
  fetched: string;
  episodes: CatalogEpisode[];
};
const annotations = JSON.parse(readFileSync("data/annotations.json", "utf8")) as Record<string, Annotation>;
const places = JSON.parse(readFileSync("data/places.json", "utf8")) as Record<string, PlaceEntry>;

const errors: string[] = [];
const annotatedIds = new Set(Object.keys(annotations));

for (const e of catalog.episodes) {
  if (!annotatedIds.has(e.id)) errors.push(`${e.id} (${e.firstrun} ${e.title}): not annotated`);
}
for (const id of annotatedIds) {
  if (!catalog.episodes.some((e) => e.id === id)) errors.push(`${id}: annotated but not in catalog`);
}

for (const [id, a] of Object.entries(annotations)) {
  const primaries = a.places.filter((p) => p.role === "primary");
  const placelessPlaceholder = a.places.length === 0 && a.confidence === "low";
  if (primaries.length !== 1 && !placelessPlaceholder) {
    errors.push(`${id}: ${primaries.length} primary places`);
  }
  for (const p of a.places) {
    if (!(p.ref in places)) errors.push(`${id}: unknown place ref ${p.ref}`);
  }
  for (const s of a.spans) {
    if (s.start > s.end) errors.push(`${id}: inverted span ${s.start}..${s.end}`);
  }
  if (a.repeatOf && !annotatedIds.has(a.repeatOf)) errors.push(`${id}: repeatOf unknown id ${a.repeatOf}`);
}

if (errors.length) {
  console.error("ERRORS:\n  " + errors.join("\n  "));
  process.exit(1);
}

const episodes = catalog.episodes.map((e) => {
  const a = annotations[e.id];
  const resolvedPlaces: EpisodePlace[] = a.places.map((p) => {
    const g = places[p.ref];
    return {
      slug: p.ref,
      name: g.name,
      kind: g.kind,
      lat: g.lat,
      lon: g.lon,
      ...(g.zoom !== undefined && { zoom: g.zoom }),
      role: p.role,
      ...(p.note && { note: p.note }),
    };
  });
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    firstrun: e.firstrun,
    durationSec: e.durationSec,
    audio: e.audio,
    image: e.image,
    ruv: `${RUV_EPISODE_BASE}/${e.id}`,
    subject: a.subject,
    ...(a.series && { series: a.series }),
    ...(a.repeatOf && { repeatOf: a.repeatOf }),
    places: resolvedPlaces,
    spans: a.spans,
    confidence: a.confidence,
  };
});

const out = {
  built: new Date().toISOString(),
  catalogFetched: catalog.fetched,
  episodes,
};

mkdirSync("public/data", { recursive: true });
writeFileSync("public/data/episodes.json", JSON.stringify(out) + "\n");

const withMarker = episodes.filter((e) => e.places.length > 0 && !e.repeatOf).length;
const listOnly = episodes.filter((e) => e.places.length === 0).length;
const repeats = episodes.filter((e) => e.repeatOf).length;
const bytes = Buffer.byteLength(JSON.stringify(out));
console.log(`Wrote public/data/episodes.json: ${episodes.length} episodes (${(bytes / 1024).toFixed(0)} KB)`);
console.log(`  map markers: ${withMarker}  ·  repeats (collapsed to original): ${repeats}  ·  list-only placeholders: ${listOnly}`);
