"""Routines: a spoken phrase (or a JARVIS event) that runs fixed steps.

Edited from the /painel page and kept as one JSON file under the data dir
(`data_paths.routines_path()`), because the user may well open it by hand —
the same reasoning that keeps memory as Markdown rather than a table.

A phrase matches the WHOLE utterance, never a substring: "Jarvis, cheguei"
fires "cheguei", "cheguei a pensar que..." does not. A routine that fires by
accident is worse than one that has to be asked for twice.

Everything here is pure apart from load/save. Running the steps is the
server's job (`_run_routine`), since saying, waiting and spawning need it.
"""

from __future__ import annotations

import json
import re
import secrets
import unicodedata
from datetime import datetime
from pathlib import Path
from typing import Optional

import data_paths

# What a step may be. "ask" hands its text to the brain as if spoken; "run"
# starts a Claude Code run in one of the user's projects, by name.
STEP_KINDS = ("say", "wait", "ask", "run")
# Moments the server announces. Only ones it really detects are listed —
# there is no face recognition, so there is no "face seen" event.
EVENTS = ("greeting",)

MAX_ROUTINES = 50
MAX_STEPS = 20
MAX_PHRASES = 10
MAX_TEXT = 500
MAX_WAIT_SEC = 600
_HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
# "Jarvis, cheguei" and "cheguei" are the same request.
_WAKE = re.compile(r"^(ok |ei |hey )?jarvis\s*")


def normalize(text: str) -> str:
    """Lower case, no accents, no punctuation, single spaces, no wake word."""
    decomposed = unicodedata.normalize("NFKD", text.lower())
    bare = "".join(c for c in decomposed if not unicodedata.combining(c))
    words = re.sub(r"[^\w\s]", " ", bare)
    return _WAKE.sub("", " ".join(words.split())).strip()


def _text(value, field: str, limit: int = MAX_TEXT) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field} must be text")
    value = value.strip()
    if len(value) > limit:
        raise ValueError(f"{field} is longer than {limit} characters")
    return value


def _step(raw) -> dict:
    if not isinstance(raw, dict):
        raise ValueError("every step must be an object")
    kind = raw.get("kind")
    if kind not in STEP_KINDS:
        raise ValueError(f"unknown step kind: {kind!r}")
    if kind == "wait":
        try:
            seconds = float(raw.get("seconds", 0))
        except (TypeError, ValueError):
            raise ValueError("wait needs a number of seconds") from None
        if not 0 < seconds <= MAX_WAIT_SEC:
            raise ValueError(f"wait must be between 0 and {MAX_WAIT_SEC} seconds")
        return {"kind": kind, "seconds": seconds}
    text = _text(raw.get("text", ""), f"{kind} text")
    if not text:
        raise ValueError(f"a {kind} step needs text")
    if kind == "run":
        project = _text(raw.get("project", ""), "project", 200)
        if not project:
            raise ValueError("a run step needs a project")
        return {"kind": kind, "text": text, "project": project}
    return {"kind": kind, "text": text}


def _window(raw) -> Optional[dict]:
    if raw in (None, {}):
        return None
    if not isinstance(raw, dict):
        raise ValueError("window must be an object")
    days = raw.get("days", list(range(7)))
    if (not isinstance(days, list) or not days
            or any(not isinstance(d, int) or isinstance(d, bool) or not 0 <= d <= 6
                   for d in days)):
        raise ValueError("window days are 0 (Monday) to 6 (Sunday)")
    start, end = raw.get("start", "00:00"), raw.get("end", "23:59")
    if not (isinstance(start, str) and _HHMM.match(start)
            and isinstance(end, str) and _HHMM.match(end)):
        raise ValueError("window times are HH:MM")
    return {"days": sorted(set(days)), "start": start, "end": end}


def validate(raw, *, routine_id: Optional[str] = None) -> dict:
    """A clean routine from untrusted input, or ValueError saying what is wrong."""
    if not isinstance(raw, dict):
        raise ValueError("a routine must be an object")
    name = _text(raw.get("name", ""), "name", 80)
    if not name:
        raise ValueError("a routine needs a name")
    phrases_raw = raw.get("phrases", [])
    if not isinstance(phrases_raw, list) or len(phrases_raw) > MAX_PHRASES:
        raise ValueError(f"phrases must be a list of at most {MAX_PHRASES}")
    phrases = []
    for p in phrases_raw:
        p = _text(p, "phrase", 120)
        if p and normalize(p) and p not in phrases:
            phrases.append(p)
    events = raw.get("events", [])
    if not isinstance(events, list) or any(e not in EVENTS for e in events):
        raise ValueError(f"events must be among {', '.join(EVENTS)}")
    if not phrases and not events:
        raise ValueError("a routine needs a phrase or an event to start it")
    steps_raw = raw.get("steps", [])
    if not isinstance(steps_raw, list) or not steps_raw or len(steps_raw) > MAX_STEPS:
        raise ValueError(f"a routine needs between 1 and {MAX_STEPS} steps")
    return {
        "id": routine_id or raw.get("id") or secrets.token_hex(6),
        "name": name,
        "enabled": bool(raw.get("enabled", True)),
        "phrases": phrases,
        "events": sorted(set(events)),
        "window": _window(raw.get("window")),
        "steps": [_step(s) for s in steps_raw],
    }


def in_window(routine: dict, now: datetime) -> bool:
    """No window means always. A window whose end is before its start runs
    over midnight (22:00–06:00), and its days are the days it STARTS on."""
    w = routine.get("window")
    if not w:
        return True
    hhmm = now.strftime("%H:%M")
    if w["start"] <= w["end"]:
        return now.weekday() in w["days"] and w["start"] <= hhmm <= w["end"]
    if hhmm >= w["start"]:
        return now.weekday() in w["days"]
    return hhmm <= w["end"] and (now.weekday() - 1) % 7 in w["days"]


def match_phrase(routines: list[dict], text: str, now: datetime) -> Optional[dict]:
    """The first enabled, in-window routine one of whose phrases IS `text`."""
    said = normalize(text)
    if not said:
        return None
    for r in routines:
        if r.get("enabled") and in_window(r, now) \
                and any(normalize(p) == said for p in r.get("phrases", [])):
            return r
    return None


def for_event(routines: list[dict], event: str, now: datetime) -> list[dict]:
    return [r for r in routines
            if r.get("enabled") and event in r.get("events", []) and in_window(r, now)]


def _path() -> Path:
    return data_paths.routines_path()


def load() -> list[dict]:
    """Every routine on disk that still validates. A hand edit that breaks one
    routine drops that routine, not the file."""
    try:
        raw = json.loads(_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    out = []
    for item in raw.get("routines", []) if isinstance(raw, dict) else []:
        try:
            out.append(validate(item, routine_id=item.get("id") if isinstance(item, dict) else None))
        except ValueError:
            continue
    return out


def save(routines: list[dict]) -> None:
    path = _path()
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps({"routines": routines}, ensure_ascii=False, indent=2),
                   encoding="utf-8")
    tmp.replace(path)


def upsert(raw) -> dict:
    """Create or replace (by id) one routine and persist the lot."""
    routines = load()
    routine = validate(raw)
    for i, r in enumerate(routines):
        if r["id"] == routine["id"]:
            routines[i] = routine
            break
    else:
        if len(routines) >= MAX_ROUTINES:
            raise ValueError(f"at most {MAX_ROUTINES} routines")
        routines.append(routine)
    save(routines)
    return routine


def delete(routine_id: str) -> bool:
    routines = load()
    kept = [r for r in routines if r["id"] != routine_id]
    if len(kept) == len(routines):
        return False
    save(kept)
    return True
