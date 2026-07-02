#!/usr/bin/env python3
"""Print the next N unannotated episodes (catalog order) for annotation.

Usage: python3 scripts/next-batch.py [N]   (default 33)
"""
import json
import sys

n = int(sys.argv[1]) if len(sys.argv) > 1 else 33
cat = json.load(open("data/catalog.json"))["episodes"]
ann = json.load(open("data/annotations.json"))
todo = [e for e in cat if e["id"] not in ann]
print(f"remaining: {len(todo)}")
for e in todo[:n]:
    desc = " ".join(e["description"].split())
    print(f"{e['id']} [{e['firstrun']}] {e['title']}")
    print(f"   {desc[:350]}")
