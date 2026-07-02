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

**Data phase complete. App not yet started.**

| Piece | State |
|---|---|
| Episode catalog (`data/catalog.json`) | ✅ 357 episodes fetched from RÚV GraphQL, incl. MP3 URLs |
| Annotations (`data/annotations.json`) | ✅ 357/357 — 305 high / 39 medium / 13 low confidence |
| Gazetteer (`data/places.json`) | ✅ 245 places, Nominatim-verified (or `skipVerify` hand-checked) |
| Series & rebroadcasts | ✅ 64 series grouped; 15 repeats marked with `repeatOf` |
| Merge/build script → `public/data/episodes.json` | ⬜ not started |
| Webapp (map, timeline, panel, list view) | ⬜ not started |
| Deploy (GitHub Pages) | ⬜ not started |

### Remaining steps

1. **Merge script** (`scripts/build-episodes.ts`): join catalog + annotations +
   places into `public/data/episodes.json`; derive RÚV per-episode links
   (`https://www.ruv.is/utvarp/spila/i-ljosi-sogunnar/23795/{id}`); episodes
   with no places (the 13 placeholders) appear in the list view only.
2. **App scaffold**: Vite + TypeScript, no framework. MapLibre GL +
   OpenFreeMap tiles, era-colored markers (ordinal blue ramp — validate
   against the basemap land color per DESIGN.md §4), clustering, series
   collapse.
3. **Timeline**: hand-rolled SVG, piecewise-linear scale with a clamped
   prehistory band (data contains a span from −60000), pixel-space density
   histogram, brushable range, era preset chips.
4. **Detail panel & linking**: episode card with artwork, description,
   `<audio>` on the RÚV MP3, RÚV link, series navigation; hover highlighting
   linked both ways between map and timeline; „Listi" table view
   (accessibility fallback). UI strings in Icelandic.
5. **Dark mode + accessibility pass** per the checklist in DESIGN.md.
6. **Data polish (optional)**: one-time Spotify API pass to recover the 13
   placeholder episode titles (match air dates against show
   `4z956m0MLbaecUeSjlJmw2`) and add per-episode Spotify links; human review
   of the 39 `confidence: medium` annotations.
7. **Deploy** to GitHub Pages; re-run `npm run fetch-catalog` periodically —
   new episodes show up as unannotated ids.

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
