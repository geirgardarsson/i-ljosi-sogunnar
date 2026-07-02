#!/usr/bin/env python3
"""Merge a batch file {"annotations": {...}, "places": {...}} into data/.

Validates place refs, the one-primary-place rule, spans, and place-slug
conflicts before writing anything. Prints newly added place slugs so they can
be passed to `npm run verify-places -- <slugs>` for targeted Nominatim checks.

Usage: python3 scripts/merge-batch.py <batch.json>
"""
import json
import sys

batch = json.load(open(sys.argv[1]))
ann = json.load(open("data/annotations.json"))
places = json.load(open("data/places.json"))
cat = {e["id"]: e for e in json.load(open("data/catalog.json"))["episodes"]}

errs, new_slugs = [], []
for slug, p in batch.get("places", {}).items():
    if slug in places:
        old = places[slug]
        if abs(old["lat"] - p["lat"]) > 0.2 or abs(old["lon"] - p["lon"]) > 0.2:
            errs.append(f"place conflict {slug}: {old['lat']},{old['lon']} vs {p['lat']},{p['lon']}")
    else:
        places[slug] = p
        new_slugs.append(slug)

for eid, a in batch["annotations"].items():
    if eid not in cat:
        errs.append(f"{eid}: not in catalog")
    if eid in ann:
        errs.append(f"{eid}: already annotated")
    prim = [p for p in a.get("places", []) if p["role"] == "primary"]
    if len(prim) != 1 and not (not a.get("places") and a.get("confidence") == "low"):
        errs.append(f"{eid}: {len(prim)} primary places")
    for p in a.get("places", []):
        if p["ref"] not in places:
            errs.append(f"{eid}: unknown ref {p['ref']}")
    for s in a.get("spans", []):
        if s["start"] > s["end"]:
            errs.append(f"{eid}: inverted span {s}")
    r = a.get("repeatOf")
    if r and r not in ann and r not in batch["annotations"]:
        errs.append(f"{eid}: repeatOf unknown id {r}")

if errs:
    print("ERRORS:\n  " + "\n  ".join(errs))
    sys.exit(1)

ann.update(batch["annotations"])
json.dump(ann, open("data/annotations.json", "w"), ensure_ascii=False, indent=2)
json.dump(places, open("data/places.json", "w"), ensure_ascii=False, indent=2)
print(f"merged {len(batch['annotations'])} annotations, {len(new_slugs)} new places -> {len(ann)}/{len(cat)} done")
print("NEW_SLUGS:", " ".join(new_slugs))
