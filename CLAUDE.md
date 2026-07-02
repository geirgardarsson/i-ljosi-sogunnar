# CLAUDE.md

Webapp mapping episodes of the RÚV history podcast *Í ljósi sögunnar* on a
world map + timeline. **DESIGN.md is the source of truth** for the data
schema, map/timeline interaction, and visual encoding — read the relevant
section before building any part of the app. README.md has current status and
the remaining-steps roadmap.

## Ground rules

- `data/catalog.json` is machine-owned — never hand-edit; regenerate with
  `npm run fetch-catalog`. `data/annotations.json` and `data/places.json` are
  curated by hand — edit deliberately, never regenerate.
- Any new or changed gazetteer entry must pass
  `npm run verify-places -- <slugs>` before committing. Nominatim queries need
  country qualifiers ("Athens, Greece" — bare names match US towns). Use
  `skipVerify: true` only for hand-checked coordinates Nominatim can't resolve.
- Invariants (enforced by `scripts/merge-batch.py`): every annotated episode
  has exactly one `role: "primary"` place (exception: place-less
  `confidence: "low"` placeholders); all place refs resolve; `start <= end` in
  every span; negative years = BC.
- Annotating new episodes: use the `annotate-episodes` skill
  (`.claude/skills/annotate-episodes/`) — it documents the batch workflow and
  the annotation conventions established across all 357 existing entries.
- UI strings in Icelandic; code, comments, commits, and docs in English.
- Commit per milestone/batch, not one giant commit at the end.

## App-building notes (when that phase starts)

- Timeline & marker colors follow DESIGN.md §3–4: era = *ordinal* blue ramp
  light→dark (never a categorical rainbow), validated against the actual
  basemap land color; piecewise timeline scale with prehistory clamped (one
  span starts at −60000).
- Episodes with `repeatOf` are rebroadcasts — the map should show only the
  original (or collapse them); keep repeats visible in the „Listi" view.
- Episodes with empty `places` (13 RÚV placeholder episodes) are list-only;
  never give them a map marker.
- Audio: use the direct `audio` MP3 URL from the catalog; RÚV episode page is
  `https://www.ruv.is/utvarp/spila/i-ljosi-sogunnar/23795/{id}`.
