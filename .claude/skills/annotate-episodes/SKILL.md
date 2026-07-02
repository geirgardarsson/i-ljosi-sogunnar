---
name: annotate-episodes
description: Annotate new Í ljósi sögunnar episodes with subjects, places, year spans, series grouping, and confidence. Use after `npm run fetch-catalog` reveals unannotated episodes, or when the user asks to annotate/update episode data.
---

# Annotating episodes

Each episode of the podcast gets a curated entry in `data/annotations.json`
(subject, places, year spans) referencing the shared gazetteer
`data/places.json`. This skill is the workflow + the conventions used for all
357 existing entries — new annotations must match them.

## Workflow (batch of ~25–35)

1. `npm run fetch-catalog` — new episodes appear as unannotated ids.
2. `npm run next-batch` — prints the next unannotated episodes with descriptions.
3. Write a batch file (scratchpad, not the repo) shaped as:
   `{ "places": { "<slug>": {...} }, "annotations": { "<episodeId>": {...} } }`
   — schema examples in DESIGN.md §1. Only include places not already in the
   gazetteer (check first; reuse existing slugs).
4. `npm run merge-batch -- <batch.json>` — validates and merges; fails atomically.
5. `npm run verify-places -- <new slugs>` (printed by the merge as NEW_SLUGS).
   Fix flags by qualifying the `q` query, not by moving correct coordinates;
   `skipVerify: true` only for sites Nominatim genuinely doesn't know.
6. Commit `data/` with a batch summary message.

## Annotation conventions (match these)

- **Subject**: one Icelandic sentence fragment, specific ("Morðið á Olof Palme
  forsætisráðherra Svíþjóðar 1986"), not a restatement of the title.
- **Places**: exactly one `role: "primary"` (= the map marker; where the story
  is anchored, e.g. Pútín → Sankti Pétursborg not Moskva). Secondaries only
  when they add real geography; `note` explains the connection in Icelandic.
  Prefer the actual site as `kind: "landmark"` for sharp events (Tsjernóbyl
  plant, not Kyiv).
- **Spans**: list of `{start, end}` years, negative = BC. Sharp events get
  exact years; biographies get birth → death (or → air year if alive);
  country histories get a broad span with `"approx": true`. Multiple discrete
  spans for stories with separate chapters (event + rediscovery, war + trial).
- **Series**: multi-parters share a `series.key` (kebab-case); include `of`
  only when the part count is certain — retrofit earlier parts when a
  surprise sequel appears (has happened: Palme part 3 aired 4 years later).
  Watch for series with varied titles (the Ottoman saga spans "Fall
  Konstantínópel", "Súleiman mikli", "Tyrkneska kvennaveldið"…).
- **Rebroadcasts**: "Þátturinn var áður á dagskrá…" or a near-identical
  description of an earlier episode → copy the original's annotation and add
  `"repeatOf": "<originalId>"`.
- **Placeholders**: episodes titled "Þáttur N af 52" with empty descriptions
  are unannotatable → `subject` noting the gap, empty `places`/`spans`,
  `confidence: "low"`, and a `todo` to recover the title via Spotify air-date
  matching (show `4z956m0MLbaecUeSjlJmw2`).
- **Confidence**: `high` = places and spans solid; `medium` = judgment-call
  spans or diffuse subject (flags it for human review); `low` = placeholder.

## Gazetteer conventions

- Slug: kebab-case, Icelandic-flavored (`stokkholmur`, `kaupmannahofn`).
- `name`: Icelandic exonym where established, else local name.
- `q`: geocoder query, always country-qualified for ambiguous names.
- `kind`: city | region | country | landmark | water — drives the
  verify-places distance threshold (50/300/500/50/500 km).
- One entry per real-world place, reused across episodes — never duplicate
  with different coords (merge-batch rejects conflicts > 0.2°).
