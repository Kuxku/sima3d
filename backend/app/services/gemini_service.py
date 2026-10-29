import logging
from pathlib import Path
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from typing import Optional, List
from app.core.config import settings
from app.services.context_builder import ContextBuilder
from app.services.fallback_engine import FallbackEngine

logger = logging.getLogger(__name__)

# Output Schema matching AGENTS.md contract
class CameraCommand(BaseModel):
    action: str = Field(description="Must be: focus_node, focus_cluster, or reset_view")
    target_node_id: Optional[str] = Field(None, description="A valid node ID from the context")
    cluster_id: Optional[str] = None

class CopilotResponseSchema(BaseModel):
    answer: str = Field(description="The analytical response in Spanish")
    camera_command: Optional[CameraCommand] = None
    highlighted_node_ids: List[str] = Field(default_factory=list)
    status: str = Field(description="'ok' or 'fallback'")
    error_code: Optional[str] = None

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

    async def generate_response(self, user_message: str, selected_node_id: Optional[str] = None) -> dict:
        """Sends the contextualized prompt to Gemini using the async client."""
        network_context = ContextBuilder.build_network_context()
        
        # Append dynamic context to base instructions
        full_system_instruction = f"{self.base_system_instruction}\n\nCURRENT GRAPH CONTEXT:\n{network_context}"
        
        if selected_node_id and selected_node_id != "string":
            full_system_instruction += f"\n\nUSER IS CURRENTLY LOOKING AT NODE ID: {selected_node_id}"
        # Cadena de modelos prioritarios para alta disponibilidad
        candidate_models = [settings.GEMINI_MODEL]
        for fallback_model in ["gemini-3-flash-preview", "gemini-2.5-flash", "gemini-flash-latest"]:
            if fallback_model not in candidate_models:
                candidate_models.append(fallback_model)

        last_error = None

        for model_name in candidate_models:
            try:
                response = await self.client.aio.models.generate_content(
                    model=model_name,
                    contents=user_message,
                    config=types.GenerateContentConfig(
                        system_instruction=full_system_instruction,
                        temperature=settings.GEMINI_TEMPERATURE,
                        response_mime_type="application/json",
                        response_schema=CopilotResponseSchema,
                    ),
                )
                if response and response.parsed:
                    result = response.parsed.model_dump()
                    result["status"] = "ok"
                    return result
            except Exception as e:
                last_error = e
                logger.warning(f"Model '{model_name}' unavailable or overloaded ({type(e).__name__}): {e}. Trying next fallback...")

        # Si todos los modelos remotos están saturados (503 / 429), activar motor analítico local
        logger.error(f"All Gemini cloud models exhausted ({last_error}). Triggering local structured fallback.")
        return FallbackEngine.generate_response(
            user_message=user_message,
            selected_node_id=selected_node_id
        )

    async def generate_voice_response(self, user_message: str, selected_node_id: Optional[str] = None) -> dict:
        """
        Modo 1 (Económico): Procesa una transcripción de voz con EXACTAMENTE una llamada a Gemini.
        Utiliza el registro unificado de herramientas (ActionRegistry).
        Si el modelo retorna únicamente una llamada a función sin texto, genera la confirmación
        vocal localmente a partir de la acción validada y ejecutada.
        """
        from app.services.action_registry import action_registry

        network_context = ContextBuilder.build_network_context()
        voice_system_instruction = (
            "Eres Jarvis, el asistente de voz inteligente de SIMA-3D Medellín.\n"
            "REGLAS OBLIGATORIAS:\n"
            "1. Responde de forma ORAL, profesional y breve (máximo 1 o 2 oraciones concisas en español).\n"
            "2. Si el usuario te pide ver, enfocar o analizar una entidad (ej. 'enfoca Robledo', 'muestra Ingeniería', 'restablece la vista'), "
            "DEBES invocar la herramienta correspondiente ('focus_node', 'highlight_nodes', 'filter_by_type', 'reset_view').\n"
            "3. Basa todas tus afirmaciones estrictamente en los datos del contexto:\n"
            f"{network_context}"
        )

        if selected_node_id and selected_node_id != "string":
            voice_system_instruction += f"\n\nEL USUARIO ESTÁ MIRANDO EL NODO: {selected_node_id}"

        candidate_models = [settings.GEMINI_MODEL]
        for fallback_model in ["gemini-2.5-flash", "gemini-3-flash-preview", "gemini-flash-latest"]:
            if fallback_model not in candidate_models:
                candidate_models.append(fallback_model)

        last_error = None
        for model_name in candidate_models:
            try:
                # UNA SOLA LLAMADA a Gemini con herramientas
                response = await self.client.aio.models.generate_content(
                    model=model_name,
                    contents=user_message,
                    config=types.GenerateContentConfig(
                        system_instruction=voice_system_instruction,
                        temperature=settings.GEMINI_TEMPERATURE,
                        tools=action_registry.get_gemini_tools(),
                        max_output_tokens=250,
                    )
                )

                action_executed = None
                camera_command = None
                highlighted_node_ids = []
                spoken_text = ""

                # Verificar si Gemini invocó una herramienta
                if response.function_calls:
                    fc = response.function_calls[0]
                    exec_result = action_registry.execute(fc.name, fc.args or {})
                    action_executed = exec_result.model_dump()
                    camera_command = exec_result.camera_command
                    highlighted_node_ids = exec_result.highlighted_node_ids

                    # Si el modelo además generó texto, usarlo; de lo contrario, usar la confirmación local
                    spoken_text = response.text.strip() if response.text else exec_result.confirmation
                else:
                    spoken_text = response.text.strip() if response.text else "Entendido. No identifiqué una acción directa para esa consulta."

                return {
                    "answer": spoken_text,
                    "action_executed": action_executed,
                    "camera_command": camera_command,
                    "highlighted_node_ids": highlighted_node_ids,
                    "status": "ok",
                    "error_code": None
                }

            except Exception as e:
                last_error = e
                logger.warning(f"Error en voice query con modelo '{model_name}': {e}. Probando siguiente...")

        # Fallback estructurado local si la nube está inaccesible
        logger.error(f"Todos los modelos de Gemini fallaron para voz ({last_error}). Activando fallback local.")
        fallback_res = FallbackEngine.generate_response(user_message=user_message, selected_node_id=selected_node_id)
        return {
            "answer": fallback_res["answer"],
            "action_executed": None,
            "camera_command": fallback_res.get("camera_command"),
            "highlighted_node_ids": fallback_res.get("highlighted_node_ids", []),
            "status": "fallback",
            "error_code": "CLOUD_MODELS_UNAVAILABLE"
        }
