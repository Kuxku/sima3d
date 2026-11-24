from fastapi import APIRouter, Response
from app.core.config import settings
from app.schemas.graph import GraphPayload
from app.services.graph_service import GraphService

router = APIRouter()


@router.get("/graph", response_model=GraphPayload)
async def get_graph(response: Response):
    """Returns the precomputed 3D graph payload from memory."""
    response.headers["Cache-Control"] = f"public, max-age={settings.GRAPH_CACHE_MAX_AGE_SECONDS}"
    return GraphService.get_graph()
