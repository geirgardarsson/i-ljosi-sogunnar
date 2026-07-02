# Í ljósi sögunnar — map & timeline

A static webapp that places every episode of *Í ljósi sögunnar* on a world map
and on a historical timeline. No backend: one build step produces a JSON data
file; the client renders it with MapLibre GL and a hand-rolled SVG timeline.

Verified sources (2026-07-02):

- **Catalog**: RÚV GraphQL, `https://spilari.nyr.ruv.is/gql/` (no auth).
  `Program(id: 23795)` returns all episodes — currently 357, 2016-01-08 →
  2026-06-26 — with title, description, firstrun, duration, direct MP3
  (`ruv-radio.akamaized.net/opid/….mp3`) and artwork.
- **Per-episode page**: `https://www.ruv.is/utvarp/spila/i-ljosi-sogunnar/23795/{id}` (confirmed 200).
- **Geocoding**: Nominatim at build time only.
- **Spotify**: optional per-episode links (matched by title/date via the free
  client-credentials API). No transcript API exists; not needed — descriptions
  name places and years directly.

## 1. Data model

Three files. The first is machine-refreshed, the second and third are curated
by hand (well, by Claude, spot-checked by Geir). A build script merges them
into the single artifact the app loads. Re-fetching the catalog can never
clobber curation; a new episode simply shows up as an unannotated TODO.

```
data/
  catalog.json       ← fetched from RÚV GraphQL (regenerate freely)
  places.json        ← gazetteer: every distinct place, geocoded once
  annotations.json   ← per-episode curation, keyed by RÚV episode id
public/data/
  episodes.json      ← build output = catalog ⨝ annotations ⨝ places
```

### catalog.json (fetched)

```jsonc
{
  "fetched": "2026-07-02T14:00:00Z",
  "program": 23795,
  "episodes": [
    {
      "id": "bk8quj",                       // RÚV id — the primary key everywhere
      "title": "Kaupskipið Batavía II",
      "description": "Síðari þáttur um Batavíu, skip hollenska Austur-Indíafélagsins, sem strandaði í Indlandshafi 1629.",
      "firstrun": "2026-06-26",
      "durationSec": 2420,
      "audio": "https://ruv-radio.akamaized.net/opid/5482824D0.mp3",
      "image": "https://myndir.ruv.is/…"
    }
  ]
}
```

### places.json (gazetteer)

One entry per distinct place, referenced by slug from annotations. Centralizing
this means London is geocoded once and every episode that touches it agrees on
the coordinates.

```jsonc
{
  "houtman-abrolhos": {
    "name": "Houtman Abrolhos",             // display name (Icelandic where one exists)
    "kind": "landmark",                     // city | region | country | landmark | water
    "lat": -28.72, "lon": 113.78,
    "zoom": 7,                              // optional: sensible flyTo zoom for this kind of place
    "q": "Houtman Abrolhos"                 // optional: geocoder query when the display name is an Icelandic exonym
  },
  "stokkholmur": { "name": "Stokkhólmur", "kind": "city", "lat": 59.33, "lon": 18.07 }
}
```

For countries/regions the point is a representative centroid; `kind` + `zoom`
tell the map how tight to fly. Bounding boxes are deliberately out of scope for
v1 — a point per place is enough for markers.

### annotations.json (curated)

```jsonc
{
  "bk8quj": {
    "subject": "Strand og uppreisn á Batavíu, skipi hollenska Austur-Indíafélagsins",
    "series": { "key": "batavia", "part": 2, "of": 2 },   // omit for standalone episodes
    "places": [
      { "ref": "houtman-abrolhos", "role": "primary", "note": "Strandstaðurinn 1629" },
      { "ref": "amsterdam",        "role": "secondary" },
      { "ref": "jakarta",          "role": "secondary", "note": "Áfangastaðurinn, þá Batavía" }
    ],
    "spans": [ { "start": 1628, "end": 1630 } ],
    "confidence": "high"                     // high | medium | low — low = needs human review
  }
}
```

Rules:

- **Exactly one `primary` place** per episode → exactly one map marker.
  Secondaries render only when the episode is selected.
- **`spans` is a list** of `{start, end}` year pairs (an episode about Sudan
  can cover `[-2000, -1500]` and `[1956, 2005]`). Signed integers, negative =
  BC, displayed as „500 f.Kr.". Single-year events use `start == end`.
  Optional `"approx": true` for descriptions like „um miðbik nítjándu aldar".
- **`series.key`** groups multi-parters (Saga Súdans I–III). Parts keep their
  own spans/places — part I of a series often covers different centuries than
  part III.
- **`confidence`** drives the review workflow: annotate all 357 in batches,
  then a human pass over `medium`/`low` only.

### episodes.json (build output)

The merge simply inlines everything the client needs per episode: catalog
fields + resolved places (with coords) + spans + derived links
(`ruv: …/23795/{id}`, optional `spotify`). The client does no joining. At 357
episodes this lands around 300–400 KB pretty-printed, less gzipped — a single
static fetch.

## 2. Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Í ljósi sögunnar · kort   [Leita…      ]  [Öll tímabil ▾] [Listi]│  ← one filter row
├────────────────────────────────────────────────┬────────────────┤
│                                                │  ◄ þáttaspjald  │
│                   KORT (MapLibre)              │  [mynd]        │
│    ● markers: primary place, era-colored       │  Kaupskipið    │
│    ⑤ cluster chips where markers collide       │  Batavía II    │
│    ○ secondaries + hairline arcs on selection  │  1628–1630     │
│                                                │  lýsing …      │
│                                                │  ▶ ───────     │
│                                                │  RÚV · Spotify │
│                                                │  Hluti 2 af 2  │
├────────────────────────────────────────────────┴────────────────┤
│  ▂▃▂▁▁▂▄▅▇█▆▃   density histogram (pixel-space bins)            │
│  ├────────▓▓▓▓▓▓▓▓▓▓──────────┤   brushable range               │
│  800 f.Kr.  0   1000  1500  1800    1900    1950   2000   2026  │
└─────────────────────────────────────────────────────────────────┘
```

Desktop: map dominant, detail panel slides in from the right, timeline is a
fixed ~120px band at the bottom. Mobile: full-bleed map, detail panel becomes
a bottom sheet, timeline collapses to ~72px.

## 3. Timeline

**The scale is the design problem.** Coverage runs from antiquity to the
2020s, but density is massively skewed toward 1800–2000; a linear axis parks
90 % of episodes in the last 5 % of pixels.

- **Piecewise-linear scale.** Fixed breakpoints, each segment gets a pixel
  share; within a segment years map linearly. Starting proposal (tune once the
  real span distribution is known after annotation):

  | segment | ≤ 0 | 0–1000 | 1000–1500 | 1500–1800 | 1800–1900 | 1900–2026 |
  |---|---|---|---|---|---|---|
  | pixel share | 8 % | 8 % | 10 % | 16 % | 24 % | 34 % |

- **Density histogram, binned in pixel space.** Bins are equal-width in
  *pixels* (≈ 8 px), so each bin covers more years in the ancient segments —
  the histogram stays honest about "episodes per screen-inch" instead of
  producing one giant antiquity bar. Bar height = number of episodes whose
  spans intersect the bin. Bars are muted chrome ink, not a series color;
  bins inside the brushed range tint blue.
- **Brush = the range filter.** Drag to select `[a, b]`; an episode matches if
  **any** of its spans intersects the brush. Handles are draggable; the whole
  selection drags to pan; double-click or „Öll tímabil" resets. The era
  dropdown in the filter row doubles as brush presets (Fornöld, Miðaldir,
  1500–1800, 19. öld, 20. öld, 21. öld) — presets before custom range, per
  standard date-filter practice.
- **Selected episode overlay.** The active episode's spans draw as bold blue
  bars on the timeline (multi-span episodes show every bar), so "when does
  this happen" is answered without reading numbers.

## 4. Map

- **Basemap**: OpenFreeMap vector tiles (free, keyless) with a muted
  grayscale style in both light and dark mode — the basemap is chrome; only
  markers carry color.
- **Markers**: one per episode at its primary place. 10 px dot, 2 px
  surface-colored ring so overlapping dots stay separable, ≥ 24 px invisible
  hit target, slight lift on hover.
- **Era color = ordinal blue ramp, light→dark** (time is ordered, so this is a
  sequential/ordinal job — a categorical rainbow would be wrong). Bucket by
  the midpoint of the episode's first span:

  | bucket | Fornöld ≤ 500 | 500–1500 | 1500–1800 | 1800–1900 | 1900 → |
  |---|---|---|---|---|---|
  | light mode | `#86b6ef` (250) | `#5598e7` (350) | `#2a78d6` (450) | `#1c5cab` (550) | `#104281` (650) |
  | dark mode | `#cde2fb` (100) | `#86b6ef` (250) | `#3987e5` (400) | `#256abf` (500) | `#184f95` (600) |

  Steps obey the ordinal floor (lightest ≥ step 250 on light, darkest ≤ step
  600 on dark). **At implementation, validate against the actual basemap land
  color**, not the default chart surface:
  `node scripts/validate_palette.js "<steps>" --ordinal --surface <land-hex>`.
  A small legend (era → swatch) is always visible; color is never the only
  channel — the timeline position and the year chips repeat the information.
- **Clustering**: MapLibre GeoJSON source with `cluster: true`. Cluster chips
  are neutral (dark chip, white count) — a cluster mixes eras, so it doesn't
  wear a series color. Click → zoom; at max zoom, spiderfy.
- **Series collapse**: parts of one series sharing a primary place render as
  one marker with a part-count badge instead of three stacked dots.
- **Selection**: clicking a marker opens the detail panel, draws secondary
  places as smaller hollow markers joined to the primary by hairline arcs, and
  lights the episode's spans on the timeline.

## 5. Linked highlighting & panel

- Hover a marker → tooltip (title + year range, `textContent` only — RÚV
  descriptions are untrusted input) and its histogram bin lifts.
- Hover a histogram bin → tooltip with episode count for that period; matching
  markers lift on the map.
- Brush → non-matching markers fade to ~15 % opacity and become
  non-interactive (fade, don't remove: the world keeps its shape).
- Detail panel: artwork, title, year chips (one per span — clicking a chip
  brushes the timeline to it), place chips (hover pans the map), RÚV
  description, `<audio>` player on the direct MP3, links to RÚV and Spotify,
  series navigation („Hluti 2 af 2", prev/next part).
- **„Listi" toggle**: a sortable list/table of all episodes (title, year
  spans, places, date aired) that honors the same filters. This is the
  accessibility fallback (every value reachable without hover) and the
  low-bandwidth/mobile-friendly view in one.
- Keyboard: markers are focusable in firstrun order; Enter opens the panel;
  brush handles respond to arrow keys.

## 6. UI language

Interface strings in Icelandic (episode data is Icelandic; mixing chrome
languages would look off): „Leita", „Öll tímabil", „Listi", „Hluti X af Y",
„f.Kr.", era names as in §4. Code, comments, and docs in English.

## 7. Stack

- **Vite + TypeScript, no framework** — the app is one map, one timeline, one
  panel; a framework would outweigh it.
- **MapLibre GL JS** + OpenFreeMap tiles (keyless), built-in clustering.
- **Timeline**: hand-rolled SVG (~200 lines) — the piecewise scale is ~15
  lines; d3 isn't needed.
- **Build/data scripts**: TypeScript run with `tsx` (fetch catalog → GraphQL;
  geocode gazetteer → Nominatim with 1 req/s throttle; merge → episodes.json).
- **Hosting**: GitHub Pages (static output only).

## 8. Annotation workflow (the real work)

1. Fetch catalog (done once already — 357 episodes).
2. Claude annotates in batches of ~25: subject, series grouping, places
   (against the growing gazetteer), spans, confidence.
3. Geocode new gazetteer entries; sanity-check coords land on the right
   continent (automated bounds check per `kind`).
4. Human review pass over `confidence: medium|low` episodes only.
5. Re-run fetch weekly/monthly for new episodes; only new ids need annotation.

## Open questions (defaults chosen, easy to change)

- Timeline breakpoints/pixel shares — retune after annotation reveals the real
  distribution.
- Spotify links: worth a one-time API matching pass, or RÚV-only for v1?
- Audio: in-app `<audio>` on the RÚV MP3 works today; if hotlinking ever
  breaks, fall back to linking out to the RÚV player page.
