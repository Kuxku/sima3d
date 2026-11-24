import time
import uuid
import logging
from collections import defaultdict
from fastapi import APIRouter, Request, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from typing import Optional, List, Dict

from app.core.config import settings
from app.services.gemini_service import GeminiService
from app.services.action_registry import action_registry
from app.services.fallback_engine import FallbackEngine
from app.services.live_service import live_session_manager, GeminiLiveBridge

logger = logging.getLogger(__name__)

router = APIRouter()
gemini_service = GeminiService()

# --- Rate Limiters en Memoria (por IP) ---
_chat_request_timestamps: Dict[str, List[float]] = defaultdict(list)
_voice_request_timestamps: Dict[str, List[float]] = defaultdict(list)


def _check_rate_limit(
    bucket: Dict[str, List[float]],
    client_ip: str,
    max_per_minute: int,
) -> bool:
    now = time.time()
    window = 60.0
    bucket[client_ip] = [t for t in bucket[client_ip] if now - t < window]
    if len(bucket[client_ip]) >= max_per_minute:
        return False
    bucket[client_ip].append(now)
    return True


def check_chat_rate_limit(client_ip: str) -> bool:
    return _check_rate_limit(
        _chat_request_timestamps,
        client_ip,
        settings.COPILOT_RATE_LIMIT_PER_MINUTE,
    )


def check_voice_rate_limit(client_ip: str) -> bool:
    return _check_rate_limit(
        _voice_request_timestamps,
        client_ip,
        settings.VOICE_CONVENTIONAL_RATE_LIMIT_PER_MINUTE,
    )


# --- DTOs ---

class CopilotRequest(BaseModel):
    message: str
    history: List[Dict[str, str]] = Field(default_factory=list)
    selected_node_id: Optional[str] = None


class VoiceQueryRequest(BaseModel):
    message: str = Field(description="Transcripción de voz del usuario capturada vía Web Speech API")
    selected_node_id: Optional[str] = None


# --- Endpoints ---

@router.post("/chat")
async def chat_with_copilot(request: CopilotRequest, req: Request):
    """Processes user chat messages and returns AI analysis with validated camera commands."""
    client_ip = req.client.host if req.client else "unknown"
    if not check_chat_rate_limit(client_ip):
        raise HTTPException(
            status_code=429,
            detail=(
                f"Límite de consultas alcanzado (máx {settings.COPILOT_RATE_LIMIT_PER_MINUTE}/min). "
                "Por favor espera unos segundos."
            ),
        )

    message = request.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="El mensaje no puede estar vacío.")

    if len(message) > settings.COPILOT_MAX_PROMPT_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"El mensaje excede el límite permitido de {settings.COPILOT_MAX_PROMPT_CHARS} caracteres.",
        )

    try:
        return await gemini_service.generate_response(
            user_message=message,
            selected_node_id=request.selected_node_id,
            history=request.history,
        )
    except Exception as e:
        logger.error(f"Error en chat copilot: {e}", exc_info=True)
        fallback = FallbackEngine.generate_response(
            user_message=message,
            selected_node_id=request.selected_node_id,
        )
        fallback["status"] = "fallback"
        fallback["error_code"] = "INTERNAL_FALLBACK"
        return fallback


@router.post("/voice/query")
async def handle_voice_query(request: VoiceQueryRequest, req: Request):
    """
    Modo 1 (Económico): Procesa una transcripción de voz con EXACTAMENTE una llamada a Gemini.
    Ejecuta acciones reales del ActionRegistry y devuelve la respuesta oral y visual.
    """
    client_ip = req.client.host if req.client else "unknown"
    if not check_voice_rate_limit(client_ip):
        raise HTTPException(
            status_code=429,
            detail=(
                f"Límite de consultas de voz alcanzado (máx {settings.VOICE_CONVENTIONAL_RATE_LIMIT_PER_MINUTE}/min). "
                "Por favor espera unos segundos."
            ),
        )

    transcript = request.message.strip()
    if not transcript:
        raise HTTPException(status_code=400, detail="La transcripción de voz no puede estar vacía.")

    if len(transcript) > settings.VOICE_MAX_TRANSCRIPT_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"La consulta oral excede el límite permitido de {settings.VOICE_MAX_TRANSCRIPT_CHARS} caracteres.",
        )

    try:
        return await gemini_service.generate_voice_response(
            user_message=transcript,
            selected_node_id=request.selected_node_id,
        )
    except Exception as e:
        logger.error(f"Error en voice query: {e}", exc_info=True)
        fallback = FallbackEngine.generate_response(
            user_message=transcript,
            selected_node_id=request.selected_node_id,
        )
        return {
            "answer": fallback["answer"],
            "action_executed": None,
            "camera_command": fallback.get("camera_command"),
            "highlighted_node_ids": fallback.get("highlighted_node_ids", []),
            "status": "fallback",
            "error_code": "VOICE_INTERNAL_FALLBACK",
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
                "parameters": d.parameters,
            }
            for d in decls
        ],
    }


@router.websocket("/ws/live")
async def live_voice_websocket(websocket: WebSocket, selected_node_id: Optional[str] = None):
    """
    Modo 2 (Tiempo Real): Gemini Multimodal Live API bidireccional vía WebSocket persistente.
    Gestiona límites de concurrencia, duración de sesión y audio streaming PCM.
    """
    await websocket.accept()
    session_id = str(uuid.uuid4())[:8]

    allowed = await live_session_manager.can_start_session(session_id)
    if not allowed:
        logger.warning(
            f"Rechazando conexión WebSocket Live: cupo de {settings.VOICE_LIVE_MAX_CONCURRENT_SESSIONS} sesiones superado."
        )
        await websocket.send_json({
            "type": "error",
            "code": "CONCURRENCY_LIMIT_EXCEEDED",
            "message": (
                f"Capacidad máxima alcanzada ({settings.VOICE_LIVE_MAX_CONCURRENT_SESSIONS} sesiones simultáneas). "
                "Intenta de nuevo en un momento."
            ),
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
