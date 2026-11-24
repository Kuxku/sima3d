import json
import logging
from pathlib import Path
from app.core.config import settings
from app.schemas.graph import GraphPayload

logger = logging.getLogger(__name__)


class GraphService:
    _cached_graph: GraphPayload | None = None

    @classmethod
    def _resolve_graph_path(cls) -> Path:
        configured = Path(settings.GRAPH_DATA_PATH)
        if configured.is_absolute():
            return configured

        # Resolver relativo a backend/ (coincide con "../data/processed/grafo_3d.json")
        backend_dir = Path(__file__).resolve().parent.parent.parent
        candidate_backend = (backend_dir / configured).resolve()
        if candidate_backend.exists():
            return candidate_backend

        # Fallback: relativo a la raíz del repositorio
        repo_root = backend_dir.parent
        candidate_root = (repo_root / configured).resolve()
        if candidate_root.exists():
            return candidate_root

        return candidate_backend

    @classmethod
    def load_graph(cls) -> None:
        """Loads and validates the graph JSON file into memory."""
        path = cls._resolve_graph_path()

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
        assert cls._cached_graph is not None
        return cls._cached_graph
