import logging
from pathlib import Path
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from typing import Optional, List
from app.core.config import settings
from app.services.context_builder import ContextBuilder

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

        try:
            # Utilizamos self.client.aio para evitar el bloqueo del event loop (loading infinito)
            response = await self.client.aio.models.generate_content(
                model=settings.GEMINI_MODEL,
                contents=user_message,
                config=types.GenerateContentConfig(
                    system_instruction=full_system_instruction,
                    temperature=settings.GEMINI_TEMPERATURE,
                    response_mime_type="application/json",
                    response_schema=CopilotResponseSchema,
                ),
            )
            # Retornar como diccionario puro
            return response.parsed.model_dump()
            
        except Exception as e:
            logger.error(f"Gemini API Error: {str(e)}")
            return {
                "answer": f"El análisis en tiempo real está temporalmente saturado. Detalle técnico: {str(e)}",
                "camera_command": None,
                "highlighted_node_ids": [],
                "status": "fallback",
                "error_code": "API_UNAVAILABLE"
            }