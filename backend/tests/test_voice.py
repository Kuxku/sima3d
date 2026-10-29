import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch

from app.main import app
from app.services.action_registry import action_registry, ActionResult
from app.services.live_service import live_session_manager
from app.core.config import settings

client = TestClient(app)

def test_action_registry_declarations():
    """Verifica que el ActionRegistry declare las 5 acciones requeridas con esquemas válidos."""
    decls = action_registry.get_function_declarations()
    names = [d.name for d in decls]
    assert "focus_node" in names
    assert "reset_view" in names
    assert "highlight_nodes" in names
    assert "filter_by_type" in names
    assert "inspect_node" in names
    assert len(decls) == 5

def test_action_registry_execution_valid():
    """Verifica la ejecución exitosa de acciones en el grafo."""
    # 1. focus_node
    res_focus = action_registry.execute("focus_node", {"node_id": "belen"})
    assert res_focus.success is True
    assert "belen" in res_focus.args["node_id"]
    assert res_focus.camera_command["action"] == "focus_node"

    # 2. reset_view
    res_reset = action_registry.execute("reset_view", {})
    assert res_reset.success is True
    assert res_reset.camera_command["action"] == "reset_view"

    # 3. filter_by_type
    res_filter = action_registry.execute("filter_by_type", {"node_type": "facultad"})
    assert res_filter.success is True
    assert len(res_filter.highlighted_node_ids) > 0

def test_action_registry_execution_invalid():
    """Verifica que acciones o argumentos inválidos sean rechazados con error claro."""
    # Acción inexistente
    res_unknown = action_registry.execute("destroy_graph", {})
    assert res_unknown.success is False
    assert res_unknown.error == "ACTION_NOT_FOUND"

    # Argumentos que no cumplen el esquema
    res_bad_args = action_registry.execute("focus_node", {})  # falta node_id
    assert res_bad_args.success is False
    assert res_bad_args.error == "VALIDATION_ERROR"

def test_voice_query_validation():
    """Verifica rechazo de transcripciones vacías o que exceden el límite de caracteres."""
    # Vacía
    res_empty = client.post("/api/copilot/voice/query", json={"message": "   "})
    assert res_empty.status_code == 400

    # Exceso de caracteres (> VOICE_MAX_TRANSCRIPT_CHARS)
    long_msg = "x" * (settings.VOICE_MAX_TRANSCRIPT_CHARS + 20)
    res_long = client.post("/api/copilot/voice/query", json={"message": long_msg})
    assert res_long.status_code == 400
    assert "excede el límite" in res_long.json()["detail"]

@pytest.mark.anyio
async def test_voice_query_single_request_mocked():
    """
    Verifica que el Modo 1 económico procese la petición en EXACTAMENTE una llamada a Gemini,
    ejecute la acción y devuelva la confirmación estructurada sin segundas peticiones.
    """
    with patch("app.services.gemini_service.GeminiService.generate_voice_response") as mock_voice:
        mock_voice.return_value = {
            "answer": "Enfocando la Facultad de Ingenierías en el lienzo 3D.",
            "action_executed": {
                "action": "focus_node",
                "args": {"node_id": "facultad:facultad-de-ingenierias"},
                "confirmation": "Enfocando Facultad De Ingenierias."
            },
            "camera_command": {
                "action": "focus_node",
                "target_node_id": "facultad:facultad-de-ingenierias"
            },
            "highlighted_node_ids": ["facultad:facultad-de-ingenierias"],
            "status": "ok",
            "error_code": None
        }

        res = client.post("/api/copilot/voice/query", json={"message": "Enfoca la Facultad de Ingeniería"})
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ok"
        assert data["camera_command"]["target_node_id"] == "facultad:facultad-de-ingenierias"
        # Confirmamos que se llamó exactamente una vez
        assert mock_voice.call_count == 1

def test_get_available_actions_endpoint():
    """Verifica que el endpoint GET /api/copilot/actions exponga el contrato del ActionRegistry."""
    res = client.get("/api/copilot/actions")
    assert res.status_code == 200
    data = res.json()
    assert data["count"] == 5
    action_names = [a["name"] for a in data["actions"]]
    assert "focus_node" in action_names
    assert "reset_view" in action_names

@pytest.mark.anyio
async def test_live_session_concurrency_limit():
    """Verifica que el LiveSessionManager aplique estrictamente el tope de sesiones simultáneas."""
    mgr = live_session_manager
    # Limpiar estado
    mgr._active_sessions.clear()

    # Iniciar hasta el límite (3)
    assert await mgr.can_start_session("s1") is True
    assert await mgr.can_start_session("s2") is True
    assert await mgr.can_start_session("s3") is True
    assert mgr.active_count == 3

    # La 4ta sesión debe ser rechazada
    assert await mgr.can_start_session("s4") is False

    # Liberar una y permitir nueva
    await mgr.end_session("s1")
    assert mgr.active_count == 2
    assert await mgr.can_start_session("s4") is True

    # Limpiar al terminar
    mgr._active_sessions.clear()
