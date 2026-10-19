#!/usr/bin/env python3
"""
Poll RÚV for new "Í ljósi sögunnar" episodes and, when one appears, activate a
check in auto-checklists by POSTing to its webhook.

Runs from cron on the Raspberry Pi that hosts auto-checklists (stdlib only):

    17 */2 * * *  /usr/bin/python3 ~/ljosi-watch/new-episode-hook.py >> ~/ljosi-watch/log 2>&1

Files (all under the cron user's home):
  ~/ljosi-watch/state.json            episode IDs already seen (machine-owned)
  ~/.config/ljosi-watch/webhook       chmod 600, the webhook URL on one line
                                      (the token in it is the secret)

The first run only records the current episodes. State is saved after a
successful activation, so a failed call is retried on the next run.
Rebroadcasts get fresh IDs on RÚV and will also fire.
"""
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

GQL = "https://spilari.nyr.ruv.is/gql/"
PROGRAM_ID = 23795
# Ignore "new" IDs for old episodes (e.g. RÚV re-keying its archive).
MAX_AGE = timedelta(days=14)

HOME = Path.home()
STATE = HOME / "ljosi-watch" / "state.json"
WEBHOOK = HOME / ".config" / "ljosi-watch" / "webhook"


def log(msg: str) -> None:
    print(f"{datetime.now():%Y-%m-%d %H:%M:%S} {msg}", flush=True)


def post_json(url: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else b""
    req = urllib.request.Request(
        url, data=data, headers={"content-type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=30) as res:
        raw = res.read()
    return json.loads(raw) if raw else {}


def latest_episodes() -> list[dict]:
    query = "query($id:Int!,$limit:Int!){Program(id:$id){episodes(limit:$limit){id title firstrun}}}"
    body = post_json(GQL, {"query": query, "variables": {"id": PROGRAM_ID, "limit": 20}})
    if body.get("errors"):
        raise RuntimeError("; ".join(e["message"] for e in body["errors"]))
    return body["data"]["Program"]["episodes"]


def activate_check() -> None:
    if not WEBHOOK.exists():
        raise RuntimeError(f"missing {WEBHOOK}")
    req = urllib.request.Request(WEBHOOK.read_text().strip(), data=b"", method="POST")
    urllib.request.urlopen(req, timeout=30).close()


def main() -> int:
    episodes = latest_episodes()
    ids = {e["id"] for e in episodes}

    if not STATE.exists():
        STATE.parent.mkdir(parents=True, exist_ok=True)
        STATE.write_text(json.dumps(sorted(ids)) + "\n")
        log(f"seeded state with {len(ids)} episodes (newest: {episodes[0]['title']})")
        return 0

    seen = set(json.loads(STATE.read_text()))
    cutoff = datetime.now() - MAX_AGE
    new = [
        e for e in episodes
        if e["id"] not in seen and datetime.fromisoformat(e["firstrun"]) >= cutoff
    ]

    if new:
        titles = ", ".join(e["title"] for e in new)
        try:
            activate_check()
        except urllib.error.HTTPError as e:
            # e.url would leak the webhook token into the log
            log(f"new: {titles} — webhook failed: HTTP {e.code}")
            return 1
        log(f"new: {titles} — webhook fired")

    if ids - seen:
        STATE.write_text(json.dumps(sorted(seen | ids)) + "\n")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # cron log is the only place errors surface
        log(f"error: {e}")
        sys.exit(1)
