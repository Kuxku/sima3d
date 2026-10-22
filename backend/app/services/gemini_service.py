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