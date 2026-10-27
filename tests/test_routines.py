"""Routines: whole-utterance phrases, time windows, and what a saved file holds.

The rule that matters most is that a phrase matches the whole utterance —
"cheguei" fires, "cheguei a pensar que..." does not — because a routine that
fires by accident is worse than one that has to be asked for twice.
"""

from datetime import datetime

import pytest

import routines

# 2026-10-26 was a Monday (weekday 0).
MONDAY_9AM = datetime(2026, 10, 26, 9, 0)


def _routine(**over):
    raw = {"name": "Cheguei", "phrases": ["cheguei"],
           "steps": [{"kind": "say", "text": "Bem-vindo de volta."}]}
    raw.update(over)
    return routines.validate(raw)


def test_a_phrase_matches_the_whole_utterance_only():
    r = [_routine()]
    assert routines.match_phrase(r, "Jarvis, cheguei!", MONDAY_9AM) is r[0]
    assert routines.match_phrase(r, "Cheguei.", MONDAY_9AM) is r[0]
    assert routines.match_phrase(r, "cheguei a pensar que sim", MONDAY_9AM) is None


def test_accents_and_case_do_not_matter():
    r = [_routine(phrases=["Boa noite, família"])]
    assert routines.match_phrase(r, "boa noite familia", MONDAY_9AM) is r[0]


def test_a_disabled_routine_never_fires():
    r = [_routine(enabled=False)]
    assert routines.match_phrase(r, "cheguei", MONDAY_9AM) is None


def test_a_window_limits_days_and_hours():
    r = [_routine(window={"days": [0], "start": "08:00", "end": "10:00"})]
    assert routines.match_phrase(r, "cheguei", MONDAY_9AM) is r[0]
    assert routines.match_phrase(r, "cheguei", datetime(2026, 10, 26, 11, 0)) is None
    assert routines.match_phrase(r, "cheguei", datetime(2026, 10, 27, 9, 0)) is None


def test_a_window_can_run_over_midnight():
    r = _routine(window={"days": [0], "start": "22:00", "end": "06:00"})
    assert routines.in_window(r, datetime(2026, 10, 26, 23, 0))      # Monday night
    assert routines.in_window(r, datetime(2026, 10, 27, 5, 0))       # into Tuesday
    assert not routines.in_window(r, datetime(2026, 10, 27, 23, 0))  # Tuesday night


def test_events_select_their_routines():
    morning = _routine(phrases=[], events=["greeting"])
    other = _routine()
    assert routines.for_event([morning, other], "greeting", MONDAY_9AM) == [morning]


@pytest.mark.parametrize("bad", [
    {"name": "", "phrases": ["x"], "steps": [{"kind": "say", "text": "x"}]},
    {"name": "a", "phrases": [], "steps": [{"kind": "say", "text": "x"}]},
    {"name": "a", "phrases": ["x"], "steps": []},
    {"name": "a", "phrases": ["x"], "steps": [{"kind": "shell", "text": "rm"}]},
    {"name": "a", "phrases": ["x"], "steps": [{"kind": "wait", "seconds": 9999}]},
    {"name": "a", "phrases": ["x"], "steps": [{"kind": "run", "text": "go"}]},
    {"name": "a", "events": ["face_seen"], "steps": [{"kind": "say", "text": "x"}]},
    {"name": "a", "phrases": ["x"], "steps": [{"kind": "say", "text": "x"}],
     "window": {"days": [7], "start": "08:00", "end": "09:00"}},
])
def test_invalid_routines_are_refused(bad):
    with pytest.raises(ValueError):
        routines.validate(bad)


def test_upsert_load_and_delete_round_trip():
    saved = routines.upsert({"name": "Cheguei", "phrases": ["cheguei"],
                             "steps": [{"kind": "wait", "seconds": 2}]})
    assert routines.load() == [saved]
    renamed = routines.upsert({**saved, "name": "Em casa"})
    assert [r["name"] for r in routines.load()] == ["Em casa"]
    assert renamed["id"] == saved["id"]
    assert routines.delete(saved["id"]) is True
    assert routines.load() == []
    assert routines.delete(saved["id"]) is False


def test_a_broken_hand_edit_drops_only_that_routine():
    import data_paths
    good = _routine()
    data_paths.routines_path().write_text(
        '{"routines": [{"name": "broken"}, ' + __import__("json").dumps(good) + ']}',
        encoding="utf-8")
    assert routines.load() == [good]
