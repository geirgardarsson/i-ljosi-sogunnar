# Í ljósi sögunnar — kort og tímalína

A static webapp that places every episode of the RÚV history podcast
[Í ljósi sögunnar](https://www.ruv.is/utvarp/spila/i-ljosi-sogunnar/23795)
(Vera Illugadóttir) on a world map and a historical timeline. Each episode is
annotated with the places its story happens at (geocoded) and the year
range(s) it covers, so you can browse a decade of episodes by geography or by
century.

Full design — data schema, map/timeline interaction, visual encoding, stack —
lives in [DESIGN.md](DESIGN.md).

## Status (2026-07-02)

**Data phase and webapp complete. Awaiting first deploy.**

| Piece | State |
|---|---|
| Episode catalog (`data/catalog.json`) | ✅ 357 episodes fetched from RÚV GraphQL, incl. MP3 URLs |
| Annotations (`data/annotations.json`) | ✅ 357/357 — 305 high / 39 medium / 13 low confidence |
| Gazetteer (`data/places.json`) | ✅ 245 places, Nominatim-verified (or `skipVerify` hand-checked) |
| Series & rebroadcasts | ✅ 64 series grouped; 15 repeats marked with `repeatOf` |
| Merge/build script → `public/data/episodes.json` | ✅ `npm run build-episodes` (validates invariants) |
| Webapp (map, timeline, panel, list view) | ✅ Vite + TS, MapLibre + OpenFreeMap, SVG timeline, dark mode |
| Deploy (GitHub Pages) | ⬜ workflow ready (`.github/workflows/deploy.yml`), Pages not yet enabled |

### Remaining steps

1. **Deploy**: push to GitHub and enable Pages (Settings → Pages → source
   "GitHub Actions"); the workflow builds `dist/` on every push to main.
2. **Data polish (optional)**: one-time Spotify API pass to recover the 13
   placeholder episode titles (match air dates against show
   `4z956m0MLbaecUeSjlJmw2`) and add per-episode Spotify links; human review
   of the 39 `confidence: medium` annotations.
3. **Upkeep**: re-run `npm run fetch-catalog` periodically — new episodes
   show up as unannotated ids (annotate via the `annotate-episodes` skill),
   then `npm run build-episodes` to refresh the app data.

### App notes

- Era marker colors are the ordinal blue ramp from DESIGN.md §4, validated
  against the actual OpenFreeMap land colors (light ramp = steps 300–700).
- Timeline segments were tuned to the real span distribution — 1900+ holds
  258 of 329 mapped episodes and gets 40 % of the pixels; everything before
  3000 f.Kr. is clamped into a thin „forsaga" band.
- Co-located markers (31 places host several episodes, New York alone has
  10) open a chooser popup instead of spiderfying.
- Keyboard path: hidden marker buttons in firstrun order (focus rings the
  marker, Enter opens the panel, Escape closes), arrow-steppable brush
  handles, sortable „Listi" table as the full accessibility fallback.

## Data pipeline

```
RÚV GraphQL ──fetch-catalog──▶ data/catalog.json      (machine-owned, regenerate freely)
                              data/annotations.json   (curated: subjects, places, spans, series)
                              data/places.json        (curated gazetteer, geocoded once)
                                       │
                                 build-episodes (TODO)
                                       ▼
                              public/data/episodes.json  (the single file the app loads)
```

Curated files are never touched by the fetch step; a refetch only adds new
episode ids, which then need annotation (see `.claude/skills/annotate-episodes`).

## Scripts

| Command | What it does |
|---|---|
| `npm run fetch-catalog` | Refetch all episode metadata from RÚV GraphQL |
| `npm run verify-places` | Check every gazetteer coordinate against Nominatim (1 req/s) |
| `npm run verify-places -- slug1 slug2` | Check only the named places |
| `npm run next-batch [-- N]` | Print the next N unannotated episodes |
| `npm run merge-batch -- batch.json` | Validate + merge an annotation batch into `data/` |

## Data sources & credits

- Episode metadata and audio: [RÚV](https://www.ruv.is) — this is a fan
  project; all episode content belongs to RÚV and Vera Illugadóttir.
- Geocoding: [Nominatim](https://nominatim.org) / OpenStreetMap contributors.
- Basemap (planned): [OpenFreeMap](https://openfreemap.org).
