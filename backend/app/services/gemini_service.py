import asyncio
import hashlib
import json
import logging
from collections import OrderedDict
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from app.core.config import settings
from app.services.command_validator import CommandValidator
from app.services.context_builder import ContextBuilder
from app.services.fallback_engine import FallbackEngine

logger = logging.getLogger(__name__)


# Output Schema matching AGENTS.md contract
class CameraCommand(BaseModel):
    action: Literal["focus_node", "focus_cluster", "reset_view"] = Field(
        description="Must be: focus_node, focus_cluster, or reset_view"
    )
    target_node_id: Optional[str] = Field(None, description="A valid node ID from the context")
    cluster_id: Optional[str] = None


class CopilotResponseSchema(BaseModel):
    answer: str = Field(description="The analytical response in Spanish")
    camera_command: Optional[CameraCommand] = None
    highlighted_node_ids: List[str] = Field(default_factory=list)
    status: Literal["ok", "fallback"] = Field(description="'ok' or 'fallback'")
    error_code: Optional[str] = None


# In-memory LRU cache for identical queries (AGENTS.md section 8.5)
_CHAT_CACHE: OrderedDict[str, Dict[str, Any]] = OrderedDict()
_MAX_CACHE_SIZE = 128


def clear_chat_cache() -> None:
    """Limpia la caché en memoria del chat (p. ej. tras recargar el grafo)."""
    _CHAT_CACHE.clear()


def _sanitize_history(
    history: Optional[List[Dict[str, str]]],
) -> List[Dict[str, str]]:
    """Trunca y valida el historial conversacional para controlar costo y latencia."""
    if not history:
        return []
    max_turns = max(0, settings.COPILOT_MAX_HISTORY_TURNS)
    if max_turns == 0:
        return []

    sanitized: List[Dict[str, str]] = []
    for item in history[-max_turns:]:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        content = (item.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            sanitized.append(
                {
                    "role": role,
                    "content": content[: settings.COPILOT_MAX_PROMPT_CHARS],
                }
            )
    return sanitized


def _get_cache_key(
    user_message: str,
    selected_node_id: Optional[str],
    sanitized_history: List[Dict[str, str]],
) -> str:
    norm_msg = user_message.strip().lower()
    norm_node = (selected_node_id or "").strip().lower()
    hist_hash = ""
    if sanitized_history:
        hist_bytes = json.dumps(sanitized_history, ensure_ascii=False, sort_keys=True).encode("utf-8")
        hist_hash = hashlib.sha256(hist_bytes).hexdigest()[:12]
    return f"{norm_msg}|{norm_node}|{hist_hash}"


def _get_cached_response(key: str) -> Optional[Dict[str, Any]]:
    if key in _CHAT_CACHE:
        _CHAT_CACHE.move_to_end(key)
        return dict(_CHAT_CACHE[key])
    return None


def _set_cached_response(key: str, data: Dict[str, Any]) -> None:
    if key in _CHAT_CACHE:
        _CHAT_CACHE.move_to_end(key)
    _CHAT_CACHE[key] = data
    if len(_CHAT_CACHE) > _MAX_CACHE_SIZE:
        _CHAT_CACHE.popitem(last=False)


class GeminiService:
    def __init__(self):
        self.client = genai.Client(api_key=settings.GEMINI_API_KEY)

        # Resolución absoluta para el archivo del System Prompt
        base_dir = Path(__file__).resolve().parent.parent
        prompt_path = base_dir / "prompts" / "copilot_system.md"

        if not prompt_path.exists():
            raise FileNotFoundError(f"Falta el archivo del System Prompt en: {prompt_path}")

        with open(prompt_path, "r", encoding="utf-8") as f:
            self.base_system_instruction = f.read()

    def _get_candidate_models(self) -> List[str]:
        models = [settings.GEMINI_MODEL]
        for fallback in settings.GEMINI_FALLBACK_MODELS:
            if fallback not in models:
                models.append(fallback)
        return models

    def _build_contents(
        self,
        user_message: str,
        sanitized_history: List[Dict[str, str]],
    ) -> Any:
        if not sanitized_history:
            return user_message

        contents: List[types.Content] = []
        for turn in sanitized_history:
            gemini_role = "model" if turn["role"] == "assistant" else "user"
            contents.append(
                types.Content(
                    role=gemini_role,
                    parts=[types.Part.from_text(text=turn["content"])],
                )
            )
        contents.append(
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=user_message)],
            )
        )
        return contents

    async def generate_response(
        self,
        user_message: str,
        selected_node_id: Optional[str] = None,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> dict:
        """Sends the contextualized prompt to Gemini with strict timeout, validation, and LRU caching."""
        sanitized_history = _sanitize_history(history)

        # 1. Check in-memory cache for instant response (< 5ms)
        cache_key = _get_cache_key(user_message, selected_node_id, sanitized_history)
        cached = _get_cached_response(cache_key)
        if cached:
            logger.info("Retornando respuesta de chat desde caché en memoria.")
            return cached

        # 2. Build or retrieve static network context
        network_context = ContextBuilder.build_network_context()

        # Append dynamic context to base instructions
        full_system_instruction = f"{self.base_system_instruction}\n\nCURRENT GRAPH CONTEXT:\n{network_context}"

        resolved_selected = CommandValidator.resolve_node_id(selected_node_id)
        if resolved_selected:
            full_system_instruction += f"\n\nUSER IS CURRENTLY LOOKING AT NODE ID: {resolved_selected}"

        candidate_models = self._get_candidate_models()
        last_error: Any = None
        timeout_sec = settings.GEMINI_TIMEOUT_SECONDS
        contents = self._build_contents(user_message, sanitized_history)

        for model_name in candidate_models:
            try:
                response = await asyncio.wait_for(
                    self.client.aio.models.generate_content(
                        model=model_name,
                        contents=contents,
                        config=types.GenerateContentConfig(
                            system_instruction=full_system_instruction,
                            temperature=settings.GEMINI_TEMPERATURE,
                            max_output_tokens=settings.GEMINI_MAX_OUTPUT_TOKENS,
                            response_mime_type="application/json",
                            response_schema=CopilotResponseSchema,
                        ),
                    ),
                    timeout=timeout_sec,
                )
                if response and response.parsed:
                    raw_result = response.parsed.model_dump()
                    raw_result["status"] = "ok"
                    raw_result["error_code"] = None
                    result = CommandValidator.validate_response(raw_result)
                    _set_cached_response(cache_key, result)
                    return result

                last_error = f"Respuesta vacía o JSON truncado/inválido de '{model_name}'"
                logger.warning(f"{last_error}. Probando siguiente modelo...")
            except asyncio.TimeoutError:
                last_error = f"Timeout ({timeout_sec}s) alcanzado para modelo '{model_name}'"
                logger.warning(f"{last_error}. Probando siguiente modelo de respaldo...")
            except Exception as e:
                last_error = e
                logger.warning(
                    f"Modelo '{model_name}' no disponible ({type(e).__name__}: {e}). Probando siguiente..."
                )

        # 3. Fallback estructurado local instantáneo si los modelos en nube fallan o se agota el timeout
        logger.error(
            f"Todos los modelos de Gemini fallaron o excedieron timeout ({last_error}). Activando fallback local."
        )
        return FallbackEngine.generate_response(
            user_message=user_message,
            selected_node_id=resolved_selected or selected_node_id,
        )

    async def generate_voice_response(
        self,
        user_message: str,
        selected_node_id: Optional[str] = None,
    ) -> dict:
        """
        Modo 1 (Económico): Procesa una transcripción de voz con EXACTAMENTE una llamada a Gemini.
        Utiliza el registro unificado de herramientas (ActionRegistry) y timeout controlado.
        """
        from app.services.action_registry import action_registry

        network_context = ContextBuilder.build_network_context()
        voice_system_instruction = (
            "Eres SIMA, el asistente de voz inteligente de SIMA-3D Medellín.\n"
            "REGLAS OBLIGATORIAS:\n"
            "1. Responde de forma ORAL, profesional y breve (máximo 1 o 2 oraciones concisas en español).\n"
            "2. Si el usuario te pide ver, enfocar o analizar una entidad (ej. 'enfoca Robledo', 'muestra Ingeniería', 'restablece la vista'), "
            "DEBES invocar la herramienta correspondiente ('focus_node', 'highlight_nodes', 'filter_by_type', 'reset_view').\n"
            "3. Solo menciona posiciones ('la segunda', 'la quinta'...) si aparecen literalmente en RANKINGS; nunca las calcules.\n"
            "4. Basa todas tus afirmaciones estrictamente en los datos del contexto:\n"
            f"{network_context}"
        )

        resolved_selected = CommandValidator.resolve_node_id(selected_node_id)
        if resolved_selected:
            voice_system_instruction += f"\n\nEL USUARIO ESTÁ MIRANDO EL NODO: {resolved_selected}"

        candidate_models = self._get_candidate_models()
        last_error: Any = None
        timeout_sec = settings.GEMINI_TIMEOUT_SECONDS

        for model_name in candidate_models:
            try:
                response = await asyncio.wait_for(
                    self.client.aio.models.generate_content(
                        model=model_name,
                        contents=user_message,
                        config=types.GenerateContentConfig(
                            system_instruction=voice_system_instruction,
                            temperature=settings.GEMINI_TEMPERATURE,
                            tools=action_registry.get_gemini_tools(),
                            max_output_tokens=settings.GEMINI_VOICE_MAX_OUTPUT_TOKENS,
                        ),
                    ),
                    timeout=timeout_sec,
                )

                action_executed = None
                camera_command = None
                highlighted_node_ids: List[str] = []
                spoken_text = ""

                if response.function_calls:
                    fc = response.function_calls[0]
                    exec_result = action_registry.execute(fc.name, fc.args or {})
                    action_executed = exec_result.model_dump()
                    camera_command = exec_result.camera_command
                    highlighted_node_ids = exec_result.highlighted_node_ids
                    spoken_text = response.text.strip() if response.text else exec_result.confirmation
                else:
                    spoken_text = (
                        response.text.strip()
                        if response.text
                        else "Entendido. No identifiqué una acción directa para esa consulta."
                    )

                return {
                    "answer": spoken_text,
                    "action_executed": action_executed,
                    "camera_command": camera_command,
                    "highlighted_node_ids": highlighted_node_ids,
                    "status": "ok",
                    "error_code": None,
                }
            except asyncio.TimeoutError:
                last_error = f"Timeout ({timeout_sec}s) en voice query para '{model_name}'"
                logger.warning(f"{last_error}. Probando siguiente...")
            except Exception as e:
                last_error = e
                logger.warning(f"Error en voice query con modelo '{model_name}': {e}. Probando siguiente...")

        # Fallback estructurado local si la nube está inaccesible
        logger.error(f"Todos los modelos de Gemini fallaron para voz ({last_error}). Activando fallback local.")
        fallback_res = FallbackEngine.generate_response(
            user_message=user_message,
            selected_node_id=resolved_selected or selected_node_id,
        )
        return {
            "answer": fallback_res["answer"],
            "action_executed": None,
            "camera_command": fallback_res.get("camera_command"),
            "highlighted_node_ids": fallback_res.get("highlighted_node_ids", []),
            "status": "fallback",
            "error_code": "CLOUD_MODELS_UNAVAILABLE",
        }
