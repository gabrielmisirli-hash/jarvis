"""Weather and official public-safety warnings for where the user is.

Two sources, both free and keyless:

- Open-Meteo for the weather itself: now, and what is left of today.
- INMET's active warnings (`apiprevmet3.inmet.gov.br/avisos/ativos`). These
  are the official meteorological warnings Brazil's Defesa Civil relays — the
  storm, rain, wind and dry-air warnings that also go out as the 40199 SMS
  and cell broadcast. Each warning carries a GeoJSON polygon, so "does this
  one cover me" is a point-in-polygon test on the coordinates JARVIS already
  has for the weather, with no city-name or IBGE lookup in between.

Polícia Militar and Corpo de Bombeiros publish no machine-readable alert
feed; their notices go out on social media. That is said in the tool's
description, so the brain knows to search for those rather than pretend this
covers them.

Parsing is pure and separate from fetching, so tests never touch the network.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Optional

import httpx

log = logging.getLogger("jarvis.local_alerts")

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
INMET_ACTIVE_URL = "https://apiprevmet3.inmet.gov.br/avisos/ativos"

# Each fetch is bounded well inside `jarvis_mcp.TIMEOUT_SEC` (20s), and the two
# run one after the other in the worst case.
FETCH_TIMEOUT_SEC = 8.0

# WMO weather interpretation codes, as Open-Meteo reports them.
WMO_CODES_PT = {
    0: "céu limpo", 1: "predominantemente limpo", 2: "parcialmente nublado",
    3: "nublado", 45: "nevoeiro", 48: "nevoeiro com geada",
    51: "garoa fraca", 53: "garoa", 55: "garoa forte",
    56: "garoa congelante", 57: "garoa congelante forte",
    61: "chuva fraca", 63: "chuva", 65: "chuva forte",
    66: "chuva congelante", 67: "chuva congelante forte",
    71: "neve fraca", 73: "neve", 75: "neve forte", 77: "grãos de neve",
    80: "pancadas de chuva fracas", 81: "pancadas de chuva",
    82: "pancadas de chuva violentas", 85: "pancadas de neve",
    86: "pancadas de neve fortes", 95: "trovoadas",
    96: "trovoadas com granizo", 99: "trovoadas com granizo forte",
}

# Long official texts are cut to what can usefully be said aloud.
_MAX_ITEM_CHARS = 280
_MAX_INSTRUCTIONS = 3


# --- weather -----------------------------------------------------------------

def weather_params(lat: float, lon: float, unit: str) -> dict:
    return {
        "latitude": lat,
        "longitude": lon,
        "current": ("temperature_2m,apparent_temperature,relative_humidity_2m,"
                    "precipitation,weather_code,wind_speed_10m,wind_gusts_10m"),
        "daily": ("temperature_2m_max,temperature_2m_min,"
                  "precipitation_probability_max,precipitation_sum,"
                  "uv_index_max"),
        "forecast_days": 1,
        "timezone": "auto",
        "temperature_unit": unit,
        "wind_speed_unit": "kmh",
    }


def _first(daily: dict, key: str):
    values = daily.get(key)
    if isinstance(values, list) and values:
        return values[0]
    return None


def format_weather(data: dict, label: str, unit: str) -> Optional[str]:
    """Open-Meteo's answer as a few plain lines, or None if it has no reading."""
    current = data.get("current") or {}
    temp = current.get("temperature_2m")
    if temp is None:
        return None
    sym = "°F" if unit == "fahrenheit" else "°C"

    sky = WMO_CODES_PT.get(current.get("weather_code"), "condição desconhecida")
    lines = [f"Clima agora em {label}: {temp}{sym}, {sky}."]
    feels = current.get("apparent_temperature")
    humidity = current.get("relative_humidity_2m")
    extras = []
    if feels is not None:
        extras.append(f"sensação de {feels}{sym}")
    if humidity is not None:
        extras.append(f"umidade {humidity}%")
    wind = current.get("wind_speed_10m")
    gusts = current.get("wind_gusts_10m")
    if wind is not None:
        extras.append(f"vento {wind} km/h"
                      + (f" com rajadas de {gusts} km/h" if gusts is not None else ""))
    if extras:
        lines.append(", ".join(extras).capitalize() + ".")

    daily = data.get("daily") or {}
    tmax, tmin = _first(daily, "temperature_2m_max"), _first(daily, "temperature_2m_min")
    rain_p = _first(daily, "precipitation_probability_max")
    rain_mm = _first(daily, "precipitation_sum")
    uv = _first(daily, "uv_index_max")
    today = []
    if tmax is not None and tmin is not None:
        today.append(f"mínima {tmin}{sym}, máxima {tmax}{sym}")
    if rain_p is not None:
        today.append(f"{rain_p}% de chance de chuva"
                     + (f" ({rain_mm} mm previstos)" if rain_mm else ""))
    if uv is not None:
        today.append(f"índice UV máximo {uv}")
    if today:
        lines.append("Hoje: " + "; ".join(today) + ".")
    return "\n".join(lines)


async def fetch_weather(lat: float, lon: float, label: str,
                        unit: str = "celsius") -> Optional[str]:
    try:
        async with httpx.AsyncClient(timeout=FETCH_TIMEOUT_SEC) as client:
            resp = await client.get(OPEN_METEO_URL,
                                    params=weather_params(lat, lon, unit))
            resp.raise_for_status()
            return format_weather(resp.json(), label, unit)
    except Exception as e:
        log.warning("weather fetch failed: %s", e)
        return None


# --- INMET warnings ----------------------------------------------------------

def _point_in_ring(lon: float, lat: float, ring: list) -> bool:
    """Ray casting. GeoJSON rings are [lon, lat] pairs."""
    inside = False
    n = len(ring)
    if n < 3:
        return False
    j = n - 1
    for i in range(n):
        try:
            xi, yi = float(ring[i][0]), float(ring[i][1])
            xj, yj = float(ring[j][0]), float(ring[j][1])
        except (TypeError, ValueError, IndexError):
            return False
        if (yi > lat) != (yj > lat):
            x_cross = (xj - xi) * (lat - yi) / (yj - yi) + xi
            if lon < x_cross:
                inside = not inside
        j = i
    return inside


def _point_in_polygon(lon: float, lat: float, rings: list) -> bool:
    """Inside the outer ring and outside every hole."""
    if not rings or not _point_in_ring(lon, lat, rings[0]):
        return False
    return not any(_point_in_ring(lon, lat, hole) for hole in rings[1:])


def _geometries(geo) -> list:
    """Every Polygon / MultiPolygon geometry in a GeoJSON value, flattened."""
    if not isinstance(geo, dict):
        return []
    kind = geo.get("type")
    if kind == "FeatureCollection":
        return [g for f in geo.get("features") or [] for g in _geometries(f)]
    if kind == "Feature":
        return _geometries(geo.get("geometry"))
    if kind in ("Polygon", "MultiPolygon"):
        return [geo]
    return []


def covers(polygon, lat: float, lon: float) -> bool:
    """Whether a warning's `poligono` (a GeoJSON string or object) covers the
    point. Anything unparseable covers nothing — better silent than a warning
    for the wrong state read aloud as the user's own."""
    if isinstance(polygon, str):
        try:
            polygon = json.loads(polygon)
        except ValueError:
            return False
    for geom in _geometries(polygon):
        coords = geom.get("coordinates") or []
        polys = coords if geom["type"] == "MultiPolygon" else [coords]
        if any(_point_in_polygon(lon, lat, rings) for rings in polys):
            return True
    return False


@dataclass
class Alert:
    event: str
    severity: str
    starts: str
    ends: str
    when: str                       # "hoje" or "futuro"
    risks: list[str] = field(default_factory=list)
    instructions: list[str] = field(default_factory=list)


def _clip(text) -> str:
    text = " ".join(str(text or "").split())
    return text if len(text) <= _MAX_ITEM_CHARS else text[:_MAX_ITEM_CHARS] + "…"


def _as_list(value) -> list[str]:
    if isinstance(value, list):
        return [_clip(v) for v in value if str(v or "").strip()]
    if isinstance(value, str) and value.strip():
        return [_clip(value)]
    return []


def warnings_for(data: dict, lat: float, lon: float) -> list[Alert]:
    """The active warnings whose polygon covers the point, most urgent first."""
    found: list[tuple[int, Alert]] = []
    if not isinstance(data, dict):
        return []
    for when in ("hoje", "futuro"):
        for item in data.get(when) or []:
            if not isinstance(item, dict) or item.get("encerrado"):
                continue
            if not covers(item.get("poligono"), lat, lon):
                continue
            try:
                rank = int(item.get("id_severidade") or 0)
            except (TypeError, ValueError):
                rank = 0
            found.append((rank, Alert(
                event=_clip(item.get("descricao")) or "Aviso",
                severity=_clip(item.get("severidade")) or "severidade não informada",
                starts=_clip(item.get("inicio")),
                ends=_clip(item.get("fim")),
                when=when,
                risks=_as_list(item.get("riscos")),
                instructions=_as_list(item.get("instrucoes"))[:_MAX_INSTRUCTIONS],
            )))
    # Today's before tomorrow's, then the more severe first.
    found.sort(key=lambda pair: (pair[1].when != "hoje", -pair[0]))
    return [w for _, w in found]


def format_warnings(warnings: list[Alert]) -> str:
    lines = []
    for w in warnings:
        period = "em vigor" if w.when == "hoje" else "previsto"
        lines.append(f"- {w.event} ({w.severity}), {period}, de {w.starts} "
                     f"até {w.ends}.")
        for risk in w.risks:
            lines.append(f"  Riscos: {risk}")
        for step in w.instructions:
            lines.append(f"  Orientação: {step}")
    return "\n".join(lines)


async def fetch_warnings(lat: float, lon: float) -> Optional[list[Alert]]:
    """The warnings covering the point, [] if none, None if INMET could not
    be reached — those last two must never be read aloud the same way."""
    try:
        async with httpx.AsyncClient(timeout=FETCH_TIMEOUT_SEC) as client:
            resp = await client.get(INMET_ACTIVE_URL)
            resp.raise_for_status()
            return warnings_for(resp.json(), lat, lon)
    except Exception as e:
        log.warning("INMET warnings fetch failed: %s", e)
        return None
