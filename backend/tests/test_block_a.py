import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock

from app.main import app
from app.core.config import settings
from app.services.command_validator import CommandValidator
from app.services.context_builder import ContextBuilder
from app.services.action_registry import action_registry
from app.services.fallback_engine import FallbackEngine
from app.services import gemini_service as gemini_mod
from app.api.routes import copilot as copilot_route


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def reset_rate_limits():
    copilot_route._chat_request_timestamps.clear()
    copilot_route._voice_request_timestamps.clear()
    yield
    copilot_route._chat_request_timestamps.clear()
    copilot_route._voice_request_timestamps.clear()


def test_config_has_no_invalid_fallback_model():
    assert "gemini-3.8-flash" not in settings.GEMINI_FALLBACK_MODELS
    assert settings.GEMINI_MAX_OUTPUT_TOKENS >= 500


def test_graph_cache_control_header(client):
    res = client.get("/api/graph")
    assert res.status_code == 200
    assert "max-age=" in res.headers.get("cache-control", "")


def test_reload_graph_invalidates_caches(client):
    ContextBuilder.build_network_context()
    gemini_mod._set_cached_response("test|key|", {"answer": "cached"})
    assert ContextBuilder._cached_context is not None
    assert len(gemini_mod._CHAT_CACHE) > 0

    res = client.post("/api/graph/reload")
    assert res.status_code == 200
    assert ContextBuilder._cached_context is None
    assert len(gemini_mod._CHAT_CACHE) == 0


def test_command_validator_filters_hallucinations():
    raw = {
        "answer": "Prueba",
        "camera_command": {
            "action": "focus_node",
            "target_node_id": "comuna:no-existe-jamas",
            "cluster_id": None,
        },
        "highlighted_node_ids": [
            "comuna:robledo",
            "comuna-robledo",  # duplicado normalizado
            "nodo:falso",
        ],
        "status": "ok",
        "error_code": None,
    }
    validated = CommandValidator.validate_response(raw)
    assert validated["camera_command"] is None
    assert validated["highlighted_node_ids"] == ["comuna:robledo"]


def test_command_validator_normalizes_dash_id():
    raw = {
        "answer": "Enfocando Robledo",
        "camera_command": {
            "action": "focus_node",
            "target_node_id": "comuna-robledo",
            "cluster_id": None,
        },
        "highlighted_node_ids": [],
        "status": "ok",
        "error_code": None,
    }
    validated = CommandValidator.validate_response(raw)
    assert validated["camera_command"] is not None
    assert validated["camera_command"]["target_node_id"] == "comuna:robledo"


def test_chat_validation_and_no_traceback_leak(client, mocker):
    # 1. Mensaje vacío -> 400
    res_empty = client.post("/api/copilot/chat", json={"message": "   "})
    assert res_empty.status_code == 400

    # 2. Excede COPILOT_MAX_PROMPT_CHARS -> 400
    long_msg = "a" * (settings.COPILOT_MAX_PROMPT_CHARS + 10)
    res_long = client.post("/api/copilot/chat", json={"message": long_msg})
    assert res_long.status_code == 400

    # 3. Excepción interna -> fallback limpio sin traceback
    mocker.patch(
        "app.api.routes.copilot.gemini_service.generate_response",
        new_callable=AsyncMock,
        side_effect=RuntimeError("secret internal path /etc/passwd"),
    )
    res_err = client.post("/api/copilot/chat", json={"message": "¿Cuáles son las comunas?"})
    assert res_err.status_code == 200
    body = res_err.json()
    assert body["status"] == "fallback"
    assert body["error_code"] == "INTERNAL_FALLBACK"
    assert "traceback" not in body
    assert "/etc/passwd" not in str(body)


def test_chat_rate_limit(client, mocker):
    mocker.patch(
        "app.api.routes.copilot.gemini_service.generate_response",
        new_callable=AsyncMock,
        return_value={
            "answer": "ok",
            "camera_command": None,
            "highlighted_node_ids": [],
            "status": "ok",
            "error_code": None,
        },
    )
    original_limit = settings.COPILOT_RATE_LIMIT_PER_MINUTE
    settings.COPILOT_RATE_LIMIT_PER_MINUTE = 2
    try:
        assert client.post("/api/copilot/chat", json={"message": "hola 1"}).status_code == 200
        assert client.post("/api/copilot/chat", json={"message": "hola 2"}).status_code == 200
        res_3 = client.post("/api/copilot/chat", json={"message": "hola 3"})
        assert res_3.status_code == 429
    finally:
        settings.COPILOT_RATE_LIMIT_PER_MINUTE = original_limit


def test_action_registry_highlight_nodes_normalizes_ids():
    res = action_registry.execute("highlight_nodes", {"node_ids": ["comuna-robledo", "belen"]})
    assert res.success is True
    assert "comuna:robledo" in res.highlighted_node_ids
    assert any("belen" in nid for nid in res.highlighted_node_ids)


def test_fallback_engine_excludes_aggregates_and_computes_rural():
    resp_col = FallbackEngine.generate_response("¿Qué colegios tienen más estudiantes?")
    for agg_id in settings.AGGREGATE_NODE_IDS:
        assert agg_id not in resp_col["highlighted_node_ids"]

    resp_rural = FallbackEngine.generate_response("¿Cuál es la distribución rural y de estratos?")
    assert resp_rural["status"] == "fallback"
    assert "%" in resp_rural["answer"]
