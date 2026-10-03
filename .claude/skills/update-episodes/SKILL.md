---
name: update-episodes
description: Check RÚV for new Í ljósi sögunnar episodes and bring the data up to date end-to-end (fetch catalog, annotate, verify places, rebuild episodes.json, commit). Use when the user asks to check for / pull in new episodes or refresh the data.
---

# Updating episode data

Run weekly-ish; the show airs on Fridays. Annotation details live in the
`annotate-episodes` skill — this one is the end-to-end loop around it.

## Steps

1. **Snapshot + fetch**: `cp data/catalog.json <scratchpad>/catalog.old.json`,
   then `npm run fetch-catalog`. The output prints the newest episode.
2. **Find what's new**: `npm run next-batch` lists unannotated episodes
   (`remaining: 0` → nothing to annotate; still rebuild/commit if
   `git diff data/catalog.json` shows changed titles or descriptions —
   RÚV sometimes fills placeholder descriptions in later).
3. **Annotate** following the `annotate-episodes` skill (batch file in the
   scratchpad → `npm run merge-batch -- <batch>` → `npm run verify-places --
   <NEW_SLUGS>`). Check `data/annotations.json` for an existing `series.key`
   first — new episodes often continue a running series; reuse the key and
   next part number, and retrofit `of` only when the count is certain.
4. **Rebuild**: `npm run build-episodes`, then `npx tsc --noEmit` and
   `npm run build`. build-episodes fails if any invariant is broken.
5. **Commit** `data/` + `public/data/episodes.json` in one commit, e.g.
   "Add episodes 2026-09-18…10-02 (Tímúr halti I–III)".
   Do not push unless asked.

## Notes

- Episodes aired within the last 7 days get a „nýtt" badge on their map pin
  (`isNewEpisode` in `src/util.ts`, computed client-side from `firstrun`), so
  no data flag needs maintaining.
- Thin descriptions (a single sentence naming only the person/topic) → use
  `confidence: "medium"` and a broad biography span; upgrade when the
  later parts of the series reveal more.
- Never hand-edit `data/catalog.json`.
