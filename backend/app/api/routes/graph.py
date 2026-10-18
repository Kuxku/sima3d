from fastapi import APIRouter
from app.schemas.graph import GraphPayload
from app.services.graph_service import GraphService

router = APIRouter()

@router.get("/graph", response_model=GraphPayload)
async def get_graph():
    """Returns the precomputed 3D graph payload."""
    return GraphService.get_graph()