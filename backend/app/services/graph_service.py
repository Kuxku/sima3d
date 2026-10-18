import json
import logging
from pathlib import Path
from app.core.config import settings
from app.schemas.graph import GraphPayload

logger = logging.getLogger(__name__)

class GraphService:
    _cached_graph: GraphPayload | None = None

    @classmethod
    def load_graph(cls) -> None:
        """Loads and validates the graph JSON file into memory."""
        # Resolución absoluta de ruta:
        # __file__ es graph_service.py -> services -> app -> backend -> red3d
        base_dir = Path(__file__).resolve().parent.parent.parent.parent
        path = base_dir / "data" / "processed" / "grafo_3d.json"
        
        if not path.exists():
            raise FileNotFoundError(f"Graph data not found at {path}. Run pipeline first.")
            
        with open(path, "r", encoding="utf-8") as f:
            raw_data = json.load(f)
            
        cls._cached_graph = GraphPayload.model_validate(raw_data)
        logger.info(f"Graph loaded into memory: {len(cls._cached_graph.nodes)} nodes.")

    @classmethod
    def get_graph(cls) -> GraphPayload:
        if cls._cached_graph is None:
            cls.load_graph()
        return cls._cached_graph