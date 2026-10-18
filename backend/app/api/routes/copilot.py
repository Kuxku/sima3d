import traceback
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, List, Dict
from app.services.gemini_service import GeminiService

router = APIRouter()
gemini_service = GeminiService()

class CopilotRequest(BaseModel):
    message: str
    history: List[Dict[str, str]] = []
    selected_node_id: Optional[str] = None

@router.post("/chat")
async def chat_with_copilot(request: CopilotRequest):
    """Processes user chat messages and returns AI analysis with camera commands."""
    try:
        # Añadimos await porque el servicio ahora es asíncrono
        response_data = await gemini_service.generate_response(
            user_message=request.message,
            selected_node_id=request.selected_node_id
        )
        return response_data
    except Exception as e:
        # Capturamos fallos estructurales antes de que explote el servidor
        return {
            "answer": "Error catastrófico en el servidor",
            "status": "error",
            "error_code": str(e),
            "traceback": traceback.format_exc()
        }