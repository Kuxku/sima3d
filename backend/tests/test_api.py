import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock
from app.main import app

@pytest.fixture(scope="module")
def client():
    """
    Inicia el TestClient usando un bloque 'with' para obligar a FastAPI 
    a ejecutar los eventos de 'lifespan' (carga del grafo) antes de las pruebas.
    """
    with TestClient(app) as c:
        yield c

def test_health_check(client):
    """Valida que el servidor levante y el grafo se cargue en memoria."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["graph_loaded"] is True

def test_get_graph(client):
    """Valida que el endpoint del grafo entregue la estructura requerida."""
    response = client.get("/api/graph")
    assert response.status_code == 200
    data = response.json()
    
    assert "meta" in data
    assert "nodes" in data
    assert "edges" in data
    assert len(data["nodes"]) > 0
    assert data["meta"]["node_count"] == len(data["nodes"])

def test_chat_copilot_mocked(client, mocker):
    """Valida el endpoint del copiloto aislando la dependencia de Gemini."""
    
    # 1. Definir la respuesta simulada estructurada
    mock_response = {
        "answer": "Análisis simulado perfecto.",
        "camera_command": {
            "action": "focus_node", 
            "target_node_id": "comuna:robledo", 
            "cluster_id": None
        },
        "highlighted_node_ids": ["comuna:robledo"],
        "status": "ok",
        "error_code": None
    }
    
    # 2. Interceptar la función asíncrona del servicio
    mocker.patch(
        "app.api.routes.copilot.gemini_service.generate_response",
        new_callable=AsyncMock,
        return_value=mock_response
    )
    
    # 3. Ejecutar la petición HTTP
    payload = {
        "message": "Mensaje de prueba",
        "history": [],
        "selected_node_id": None
    }
    response = client.post("/api/copilot/chat", json=payload)
    
    # 4. Validar el contrato de salida
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["answer"] == "Análisis simulado perfecto."
    assert data["camera_command"]["target_node_id"] == "comuna:robledo"

def test_fallback_engine_direct():
    """Valida que FallbackEngine construya respuestas estructuradas sin fallar."""
    from app.services.fallback_engine import FallbackEngine
    
    # 1. Prueba de consulta de comunas
    resp_comunas = FallbackEngine.generate_response("¿Cuáles son las comunas con mayor movilidad?")
    assert resp_comunas["status"] == "fallback"
    assert "comuna" in resp_comunas["answer"].lower()
    assert resp_comunas["camera_command"]["action"] == "focus_node"
    assert len(resp_comunas["highlighted_node_ids"]) > 0

    # 2. Prueba con nodo seleccionado
    resp_node = FallbackEngine.generate_response("Analiza este nodo", selected_node_id="comuna:robledo")
    assert resp_node["status"] == "fallback"
    assert "robledo" in resp_node["answer"].lower()
    assert resp_node["camera_command"]["target_node_id"] == "comuna:robledo"