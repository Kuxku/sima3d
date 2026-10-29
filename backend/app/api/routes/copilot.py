import time
import uuid
import logging
import traceback
from collections import defaultdict
from fastapi import APIRouter, Request, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

from app.core.config import settings
from app.services.gemini_service import GeminiService
from app.services.action_registry import action_registry
from app.services.live_service import live_session_manager, GeminiLiveBridge

logger = logging.getLogger(__name__)

router = APIRouter()
gemini_service = GeminiService()

# --- Rate Limiter en Memoria para Modo 1 ---
_client_request_timestamps = defaultdict(list)

def check_voice_rate_limit(client_ip: str) -> bool:
    now = time.time()
    window = 60.0  # 1 minuto
    timestamps = _client_request_timestamps[client_ip]
    # Limpiar marcas antiguas
    _client_request_timestamps[client_ip] = [t for t in timestamps if now - t < window]
    if len(_client_request_timestamps[client_ip]) >= settings.VOICE_CONVENTIONAL_RATE_LIMIT_PER_MINUTE:
        return False
    _client_request_timestamps[client_ip].append(now)
    return True


# --- DTOs ---

class CopilotRequest(BaseModel):
    message: str
    history: List[Dict[str, str]] = []
    selected_node_id: Optional[str] = None

class VoiceQueryRequest(BaseModel):
    message: str = Field(description="Transcripción de voz del usuario capturada vía Web Speech API")
    selected_node_id: Optional[str] = None


# --- Endpoints ---

@router.post("/chat")
async def chat_with_copilot(request: CopilotRequest):
    """Processes user chat messages and returns AI analysis with camera commands."""
    try:
        response_data = await gemini_service.generate_response(
            user_message=request.message,
            selected_node_id=request.selected_node_id
        )
        return response_data
    except Exception as e:
        logger.error(f"Error en chat copilot: {e}")
        return {
            "answer": "Error catastrófico en el servidor",
            "status": "error",
            "error_code": str(e),
            "traceback": traceback.format_exc()
        }


@router.post("/voice/query")
async def handle_voice_query(request: VoiceQueryRequest, req: Request):
    """
    Modo 1 (Económico): Procesa una transcripción de voz con EXACTAMENTE una llamada a Gemini.
    Ejecuta acciones reales del ActionRegistry y devuelve la respuesta oral y visual.
    """
    # 1. Protección de Rate Limit por IP
    client_ip = req.client.host if req.client else "unknown"
    if not check_voice_rate_limit(client_ip):
        raise HTTPException(
            status_code=429,
            detail="Límite de consultas de voz alcanzado (máx 30/min). Por favor espera unos segundos."
        )

    # 2. Validación de longitud de transcripción
    transcript = request.message.strip()
    if not transcript:
        raise HTTPException(status_code=400, detail="La transcripción de voz no puede estar vacía.")

    if len(transcript) > settings.VOICE_MAX_TRANSCRIPT_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"La consulta oral excede el límite permitido de {settings.VOICE_MAX_TRANSCRIPT_CHARS} caracteres."
        )

    try:
        response_data = await gemini_service.generate_voice_response(
            user_message=transcript,
            selected_node_id=request.selected_node_id
        )
        return response_data
    except Exception as e:
        logger.error(f"Error en voice query: {e}", exc_info=True)
        return {
            "answer": "No fue posible procesar la consulta de voz en este momento.",
            "action_executed": None,
            "camera_command": None,
            "highlighted_node_ids": [],
            "status": "error",
            "error_code": str(e)
        }


@router.get("/actions")
async def get_available_actions():
    """Retorna las acciones declaradas en el ActionRegistry unificado."""
    decls = action_registry.get_function_declarations()
    return {
        "count": len(decls),
        "actions": [
            {
                "name": d.name,
                "description": d.description,
                "parameters": d.parameters
            }
            for d in decls
        ]
    }


@router.websocket("/ws/live")
async def live_voice_websocket(websocket: WebSocket, selected_node_id: Optional[str] = None):
    """
    Modo 2 (Tiempo Real): Gemini Multimodal Live API bidireccional vía WebSocket persistente.
    Gestiona límites de concurrencia (máx 3), duración de sesión y audio streaming PCM.
    """
    await websocket.accept()
    session_id = str(uuid.uuid4())[:8]

    # Control estricto de concurrencia
    allowed = await live_session_manager.can_start_session(session_id)
    if not allowed:
        logger.warning(f"Rechazando conexión WebSocket Live: cupo de {settings.VOICE_LIVE_MAX_CONCURRENT_SESSIONS} sesiones superado.")
        await websocket.send_json({
            "type": "error",
            "code": "CONCURRENCY_LIMIT_EXCEEDED",
            "message": f"Capacidad máxima alcanzada ({settings.VOICE_LIVE_MAX_CONCURRENT_SESSIONS} sesiones simultáneas). Intenta de nuevo en un momento o usa el Modo Económico."
        })
        await websocket.close(code=4003)
        return

    bridge = GeminiLiveBridge(websocket=websocket, session_id=session_id)
    try:
        await bridge.run(selected_node_id=selected_node_id)
    except WebSocketDisconnect:
        logger.info(f"WebSocket Live {session_id} desconectado normalmente.")
    except Exception as e:
        logger.error(f"Error no controlado en WebSocket Live {session_id}: {e}", exc_info=True)
    finally:
        await live_session_manager.end_session(session_id)