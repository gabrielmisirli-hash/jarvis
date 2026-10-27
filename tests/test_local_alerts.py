"""Weather and official warnings, where the user is.

"Is there an alert?" has three honest answers — yes and which, no, and "I
could not reach the service" — and the last two must never be said the same
way: "no warnings" when INMET was simply unreachable is the confident
falsehood someone decides to drive through a flood on. Everything here runs
on fakes; nothing touches the network.
"""

import asyncio
import json

import pytest

import local_alerts

# A square around central Rio (lon, lat), and one far away in Manaus.
RIO = (-22.9064, -43.1822)
RIO_SQUARE = {"type": "Polygon", "coordinates": [[
    [-43.5, -23.1], [-43.0, -23.1], [-43.0, -22.7], [-43.5, -22.7], [-43.5, -23.1]]]}
MANAUS_SQUARE = {"type": "Polygon", "coordinates": [[
    [-60.2, -3.3], [-59.8, -3.3], [-59.8, -2.9], [-60.2, -2.9], [-60.2, -3.3]]]}


def _warning(polygon, **over):
    item = {
        "descricao": "Tempestade", "severidade": "Perigo Potencial",
        "id_severidade": 6, "inicio": "2026-10-26 08:33",
        "fim": "2026-10-26 23:59", "encerrado": False,
        "poligono": json.dumps(polygon),
        "riscos": ["Chuva entre 20 e 30 mm/h."],
        "instrucoes": ["Não se abrigue debaixo de árvores.",
                       "Defesa Civil: 199. Bombeiros: 193."],
    }
    item.update(over)
    return item


def test_a_polygon_covers_a_point_inside_it_and_not_one_outside():
    assert local_alerts.covers(json.dumps(RIO_SQUARE), *RIO)
    assert not local_alerts.covers(json.dumps(MANAUS_SQUARE), *RIO)


def test_a_hole_in_the_polygon_is_not_covered():
    holed = {"type": "Polygon", "coordinates": [
        RIO_SQUARE["coordinates"][0],
        [[-43.3, -23.0], [-43.1, -23.0], [-43.1, -22.8], [-43.3, -22.8], [-43.3, -23.0]]]}
    assert not local_alerts.covers(holed, *RIO)


def test_multipolygons_and_features_are_understood():
    multi = {"type": "MultiPolygon", "coordinates": [
        MANAUS_SQUARE["coordinates"], RIO_SQUARE["coordinates"]]}
    feature = {"type": "Feature", "geometry": multi}
    assert local_alerts.covers(feature, *RIO)


def test_an_unparseable_polygon_covers_nothing():
    assert not local_alerts.covers("not geojson", *RIO)
    assert not local_alerts.covers(None, *RIO)


def test_only_the_warnings_covering_the_user_are_kept_today_first():
    data = {
        "hoje": [_warning(MANAUS_SQUARE),
                 _warning(RIO_SQUARE, descricao="Acumulado de Chuva",
                          id_severidade=7, severidade="Perigo")],
        "futuro": [_warning(RIO_SQUARE, descricao="Ventos Costeiros"),
                   _warning(RIO_SQUARE, encerrado=True, descricao="Encerrado")],
    }
    found = local_alerts.warnings_for(data, *RIO)
    assert [w.event for w in found] == ["Acumulado de Chuva", "Ventos Costeiros"]
    assert found[0].when == "hoje" and found[1].when == "futuro"


def test_a_warning_reads_out_its_risks_and_instructions():
    found = local_alerts.warnings_for({"hoje": [_warning(RIO_SQUARE)]}, *RIO)
    text = local_alerts.format_warnings(found)
    assert "Tempestade (Perigo Potencial), em vigor" in text
    assert "Riscos: Chuva entre 20 e 30 mm/h." in text
    assert "Bombeiros: 193" in text


def test_weather_is_formatted_in_portuguese():
    data = {"current": {"temperature_2m": 27.4, "apparent_temperature": 30.1,
                        "relative_humidity_2m": 78, "weather_code": 81,
                        "wind_speed_10m": 14, "wind_gusts_10m": 32},
            "daily": {"temperature_2m_max": [31], "temperature_2m_min": [22],
                      "precipitation_probability_max": [80],
                      "precipitation_sum": [12.5], "uv_index_max": [9]}}
    text = local_alerts.format_weather(data, "Rio de Janeiro", "celsius")
    assert "27.4°C, pancadas de chuva" in text
    assert "80% de chance de chuva (12.5 mm previstos)" in text
    assert local_alerts.format_weather({"current": {}}, "x", "celsius") is None


# --- the tool ----------------------------------------------------------------

@pytest.fixture
def srv(monkeypatch):
    import server
    monkeypatch.setattr(server, "_get_weather_location", lambda: {
        "latitude": RIO[0], "longitude": RIO[1], "label": "Rio de Janeiro"})

    async def weather(*a, **k):
        return "Clima agora em Rio de Janeiro: 27°C, nublado."
    monkeypatch.setattr(local_alerts, "fetch_weather", weather)
    return server


def _say(srv, monkeypatch, warnings):
    async def fake(*a, **k):
        return warnings
    monkeypatch.setattr(local_alerts, "fetch_warnings", fake)
    return asyncio.run(srv.tool_weather_and_alerts({}))


def test_unreachable_inmet_is_never_said_as_no_warnings(srv, monkeypatch):
    said = _say(srv, monkeypatch, None)
    assert "could not be reached" in said and "never say there are none" in said


def test_no_warnings_is_said_plainly(srv, monkeypatch):
    assert "No INMET / Defesa Civil warning" in _say(srv, monkeypatch, [])


def test_warnings_arrive_wrapped_as_untrusted(srv, monkeypatch):
    found = local_alerts.warnings_for({"hoje": [_warning(RIO_SQUARE)]}, *RIO)
    said = _say(srv, monkeypatch, found)
    assert '<session-output name="official warning" untrusted="true">' in said
    assert "Tempestade" in said


def test_the_tool_is_registered_reads_but_does_not_act(srv):
    import brain
    import jarvis_mcp
    assert "weather_and_alerts" in srv.TOOL_HANDLERS
    assert "weather_and_alerts" not in srv.ACTING_TOOLS
    assert "weather_and_alerts" in srv.TAINTING_TOOLS
    assert "mcp__jarvis__weather_and_alerts" in brain.ALLOWED_TOOLS
    assert "weather_and_alerts" in {t["name"] for t in jarvis_mcp.TOOL_SPECS}
