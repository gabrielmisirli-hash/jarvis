"""The user's health watch, as far as JARVIS can see it.

The watch is an E800 driven by the HealthWear app on the user's iPhone. It
has no public API and its Bluetooth protocol is proprietary, so JARVIS does
not talk to it. HealthWear writes into Apple Health; an iOS Shortcut reads
Apple Health and POSTs the samples here. That is the whole chain:

    watch --BLE--> HealthWear --> Apple Health --Shortcut--> ingest listener

**The ingest listener is not the API server.** The phone is on the LAN and
the API server is bound to loopback on purpose (see web_auth: everything on
it acts with the user's full authority). So the phone gets its own tiny
listener with exactly one route, `POST /health/ingest`, which can do one
thing — add numbers to `health.db` — and is gated by its own token, not the
tool token. Leaking it lets someone write fake step counts; it cannot run
anything or read anything back. It is off unless `JARVIS_HEALTH_PORT` is set.

It is plain HTTP: an iOS Shortcut will not trust the self-signed cert.pem.
On a home LAN that is the trade made with eyes open — the token is narrow.

Everything stored is a number with a metric name from `METRICS` and a
timestamp. No free text from the phone survives validation, so nothing here
can carry an instruction to the brain.
"""
from __future__ import annotations

import contextlib
import hmac
import logging
import os
import secrets
import socket
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Optional

import data_paths

log = logging.getLogger("jarvis.health")

# metric -> (label pt-BR, unit, how a day aggregates, sane min, sane max)
#   "sum"   cumulative counters (steps): the day's total
#   "range" spot readings (heart rate): min / avg / max
#   "last"  one reading that stands until replaced (SpO2, sleep, pressure)
METRICS: dict[str, tuple[str, str, str, float, float]] = {
    "steps":              ("Passos", "", "sum", 0, 100_000),
    "distance_km":        ("Distância", "km", "sum", 0, 300),
    "active_energy":      ("Calorias ativas", "kcal", "sum", 0, 20_000),
    "heart_rate":         ("Frequência cardíaca", "bpm", "range", 20, 250),
    "resting_heart_rate": ("FC em repouso", "bpm", "last", 20, 200),
    "spo2":               ("Oxigenação (SpO₂)", "%", "last", 50, 100),
    "sleep_hours":        ("Sono", "h", "last", 0, 24),
    "systolic":           ("Pressão sistólica", "mmHg", "last", 50, 260),
    "diastolic":          ("Pressão diastólica", "mmHg", "last", 30, 180),
}

MAX_BODY_BYTES = 256 * 1024
MAX_SAMPLES = 5_000
DEFAULT_PORT = 8342


class IngestError(ValueError):
    """The payload is not something this module will store."""


# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------

def _connect() -> sqlite3.Connection:
    path = data_paths.health_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    conn.execute(
        "CREATE TABLE IF NOT EXISTS health_samples ("
        " metric TEXT NOT NULL, at TEXT NOT NULL, value REAL NOT NULL,"
        " received_at TEXT NOT NULL, PRIMARY KEY (metric, at))")
    return conn


def _parse_at(raw: Any) -> datetime:
    """ISO 8601 with an offset, as the Shortcut's Format Date gives it.

    A naive time is taken as local: the phone and the PC are in the same
    house. Stored in UTC so the primary key is one spelling per instant —
    the same sample sent twice replaces itself rather than counting twice.
    """
    if not isinstance(raw, str) or not raw.strip():
        raise IngestError("each sample needs a date")
    text = raw.strip().replace("Z", "+00:00")
    try:
        at = datetime.fromisoformat(text)
    except ValueError:
        raise IngestError(f"not an ISO 8601 date: {raw[:40]!r}") from None
    if at.tzinfo is None:
        at = at.astimezone()
    return at.astimezone(timezone.utc)


def _parse_value(metric: str, raw: Any) -> float:
    if isinstance(raw, bool):
        raise IngestError("a value must be a number")
    if isinstance(raw, str):
        # Shortcuts in pt-BR may write a decimal comma.
        raw = raw.strip().replace(",", ".")
    try:
        value = float(raw)
    except (TypeError, ValueError):
        raise IngestError(f"not a number for {metric}") from None
    if metric == "spo2" and 0 < value <= 1:
        value *= 100     # Apple Health stores oxygen saturation as a fraction
    lo, hi = METRICS[metric][3], METRICS[metric][4]
    if not lo <= value <= hi:
        raise IngestError(f"{metric} {value} is outside {lo}–{hi}")
    return value


def _metric(raw: Any) -> str:
    if raw not in METRICS:
        raise IngestError(f"unknown metric {str(raw)[:40]!r}; "
                          f"known: {', '.join(METRICS)}")
    return raw


def parse_payload(payload: Any) -> list[tuple[str, datetime, float]]:
    """Every sample in a request, or IngestError for the first bad one.

    Two shapes, because building a list of dictionaries in Shortcuts is
    miserable and joining lines of text is not:

        {"samples": [{"metric": "steps", "at": "...", "value": 812}, ...]}
        {"metric": "heart_rate", "lines": "2026-10-27T10:00:00-03:00;72\\n..."}
    """
    if not isinstance(payload, dict):
        raise IngestError("the body must be a JSON object")
    out: list[tuple[str, datetime, float]] = []
    if "samples" in payload:
        items = payload["samples"]
        if not isinstance(items, list):
            raise IngestError("samples must be a list")
        for item in items:
            if not isinstance(item, dict):
                raise IngestError("each sample must be an object")
            m = _metric(item.get("metric"))
            out.append((m, _parse_at(item.get("at")), _parse_value(m, item.get("value"))))
    elif "lines" in payload:
        m = _metric(payload.get("metric"))
        lines = payload["lines"]
        if isinstance(lines, list):
            lines = "\n".join(str(x) for x in lines)
        if not isinstance(lines, str):
            raise IngestError("lines must be text")
        for line in lines.splitlines():
            if not line.strip():
                continue
            at, sep, value = line.rpartition(";")
            if not sep:
                raise IngestError("each line is <date>;<value>")
            out.append((m, _parse_at(at), _parse_value(m, value)))
    else:
        raise IngestError("send either samples or metric + lines")
    if len(out) > MAX_SAMPLES:
        raise IngestError(f"at most {MAX_SAMPLES} samples per request")
    return out


def store(samples: Iterable[tuple[str, datetime, float]]) -> int:
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    rows = [(m, at.isoformat(timespec="seconds"), v, now) for m, at, v in samples]
    with contextlib.closing(_connect()) as conn, conn:
        conn.executemany(
            "INSERT OR REPLACE INTO health_samples (metric, at, value, received_at)"
            " VALUES (?, ?, ?, ?)", rows)
    return len(rows)


def ingest(payload: Any) -> int:
    return store(parse_payload(payload))


# ---------------------------------------------------------------------------
# Reading back
# ---------------------------------------------------------------------------

def _local_day(at_utc: str) -> str:
    return datetime.fromisoformat(at_utc).astimezone().date().isoformat()


def daily(days: int = 7, today: Optional[datetime] = None) -> list[dict]:
    """One entry per local day, oldest first, each metric aggregated."""
    today_local = (today or datetime.now().astimezone()).date()
    first = today_local - timedelta(days=days - 1)
    since = datetime.combine(first, datetime.min.time()).astimezone() \
        .astimezone(timezone.utc).isoformat(timespec="seconds")
    with contextlib.closing(_connect()) as conn:
        rows = conn.execute(
            "SELECT metric, at, value FROM health_samples WHERE at >= ?"
            " ORDER BY at", (since,)).fetchall()
    buckets: dict[str, dict[str, list[float]]] = {}
    for metric, at, value in rows:
        if metric in METRICS:
            buckets.setdefault(_local_day(at), {}).setdefault(metric, []).append(value)
    out = []
    for i in range(days):
        day = (first + timedelta(days=i)).isoformat()
        entry: dict[str, Any] = {"day": day}
        for metric, values in buckets.get(day, {}).items():
            kind = METRICS[metric][2]
            if kind == "sum":
                entry[metric] = round(sum(values), 2)
            elif kind == "range":
                entry[metric] = {"min": min(values), "max": max(values),
                                 "avg": round(sum(values) / len(values), 1)}
            else:
                entry[metric] = values[-1]
        out.append(entry)
    return out


def latest() -> dict[str, dict]:
    """The newest reading of every metric ever received."""
    with contextlib.closing(_connect()) as conn:
        rows = conn.execute(
            "SELECT metric, at, value FROM health_samples s WHERE at ="
            " (SELECT MAX(at) FROM health_samples WHERE metric = s.metric)").fetchall()
    return {m: {"at": at, "value": v} for m, at, v in rows if m in METRICS}


def last_received() -> Optional[str]:
    with contextlib.closing(_connect()) as conn:
        (when,) = conn.execute("SELECT MAX(received_at) FROM health_samples").fetchone()
    return when


def _fmt(value: float) -> str:
    return f"{value:,.0f}".replace(",", ".") if value >= 100 else f"{value:g}"


def describe(today: Optional[datetime] = None) -> str:
    """What the brain is told. Numbers and dates only — nothing to obey."""
    week = daily(7, today)
    if not any(len(d) > 1 for d in week):
        return ("No health data has arrived from the watch yet. Say so; the user "
                "sets up the iPhone Shortcut from /painel → Saúde.")
    lines = [f"Health watch (E800 via HealthWear → Apple Health). "
             f"Last sync: {last_received()} UTC."]
    for d in reversed(week):
        if len(d) == 1:
            continue
        parts = []
        for metric, (label, unit, kind, *_ ) in METRICS.items():
            if metric not in d:
                continue
            v = d[metric]
            if kind == "range":
                parts.append(f"{label} {_fmt(v['min'])}–{_fmt(v['max'])} "
                             f"(média {_fmt(v['avg'])}) {unit}")
            else:
                parts.append(f"{label} {_fmt(v)} {unit}".rstrip())
        lines.append(f"{d['day']}: " + "; ".join(parts))
    lines.append("This is a consumer watch, not a medical device: never "
                 "diagnose from it.")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# The ingest listener and its token
# ---------------------------------------------------------------------------

def ensure_token() -> str:
    """The phone's token, created on first use. Narrower than the tool token."""
    path = data_paths.health_token_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        fd = os.open(str(path), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        token = path.read_text(encoding="utf-8").strip()
        if token:
            return token
        return rotate_token()
    token = secrets.token_urlsafe(24)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(token)
    return token


def rotate_token() -> str:
    path = data_paths.health_token_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    token = secrets.token_urlsafe(24)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(token, encoding="utf-8")
    os.replace(tmp, path)
    return token


def _token_ok(header: Optional[str]) -> bool:
    if not header or not header.lower().startswith("bearer "):
        return False
    return hmac.compare_digest(header[7:].strip().encode(), ensure_token().encode())


def ingest_port() -> Optional[int]:
    raw = os.getenv("JARVIS_HEALTH_PORT", "").strip()
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError:
        log.warning("JARVIS_HEALTH_PORT is not a number: %r", raw)
        return None


def ingest_host() -> str:
    return os.getenv("JARVIS_HEALTH_HOST", "0.0.0.0").strip() or "0.0.0.0"


def lan_addresses() -> list[str]:
    """Where the phone can reach this PC. Best effort; no packets sent."""
    found: list[str] = []
    with contextlib.suppress(OSError):
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))     # UDP connect: routes, sends nothing
            found.append(s.getsockname()[0])
    with contextlib.suppress(OSError):
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith("127.") and ip not in found:
                found.append(ip)
    return found


def build_ingest_app():
    """One route. No Origin logic: no browser has any business here."""
    from starlette.applications import Starlette
    from starlette.requests import Request
    from starlette.responses import JSONResponse
    from starlette.routing import Route

    import web_auth

    async def ingest_route(request: Request):
        if not _token_ok(request.headers.get("authorization")):
            return JSONResponse({"error": "missing or wrong health token"}, 401)
        body = await request.body()
        if len(body) > MAX_BODY_BYTES:
            return JSONResponse({"error": "body too large"}, 413)
        try:
            import json
            stored = ingest(json.loads(body or b"null"))
        except (IngestError, ValueError) as e:
            return JSONResponse({"error": str(e)}, 400)
        log.info("health: stored %d sample(s)", stored)
        return JSONResponse({"stored": stored})

    class _SecurityHeaders:
        def __init__(self, app):
            self.app = app

        async def __call__(self, scope, receive, send):
            async def wrapped(message):
                if message["type"] == "http.response.start":
                    message["headers"] = web_auth.apply_security_headers(
                        message.get("headers"))
                await send(message)
            await self.app(scope, receive, wrapped)

    app = Starlette(routes=[Route("/health/ingest", ingest_route, methods=["POST"])])
    return _SecurityHeaders(app)


async def serve_ingest(port: int, host: Optional[str] = None) -> None:
    """Run the listener until cancelled, inside the API server's own loop."""
    import uvicorn

    class _Quiet(uvicorn.Server):
        # The API server already owns SIGINT; a second capture would swallow it.
        @contextlib.contextmanager
        def capture_signals(self):
            yield

    config = uvicorn.Config(build_ingest_app(), host=host or ingest_host(),
                            port=port, log_level="warning", lifespan="off")
    await _Quiet(config).serve()
