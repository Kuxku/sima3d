import logging
from typing import Any, Dict, List, Optional
from app.services.graph_service import GraphService

logger = logging.getLogger(__name__)

VALID_CAMERA_ACTIONS = {"focus_node", "focus_cluster", "reset_view"}


class CommandValidator:
    """
    Valida comandos de cámara y listas de nodos resaltados emitidos por Gemini
    contra la topología real cargada en memoria. Nunca se confía en el modelo
    para la validez de los IDs (AGENTS.md §8.3).
    """

    @classmethod
    def resolve_node_id(cls, raw_id: Optional[str]) -> Optional[str]:
        if not raw_id or not isinstance(raw_id, str):
            return None

        graph = GraphService.get_graph()
        cleaned = raw_id.strip()
        if not cleaned or cleaned.lower() == "string":
            return None

        # 1. Coincidencia exacta
        for node in graph.nodes:
            if node.id == cleaned:
                return node.id

        # 2. Normalización de formato (':' vs '-', mayúsculas, espacios)
        norm = cleaned.lower().replace(" ", "-")
        norm_dash = norm.replace(":", "-")
        for node in graph.nodes:
            node_lower = node.id.lower()
            if node_lower == norm or node_lower.replace(":", "-") == norm_dash:
                return node.id

        return None

    @classmethod
    def validate_camera_command(
        cls, command: Optional[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        if not command or not isinstance(command, dict):
            return None

        action = command.get("action")
        if action not in VALID_CAMERA_ACTIONS:
            logger.warning(f"Comando de cámara descartado: acción inválida '{action}'.")
            return None

        if action == "reset_view":
            return {
                "action": "reset_view",
                "target_node_id": None,
                "cluster_id": None,
            }

        graph = GraphService.get_graph()

        if action == "focus_node":
            raw_target = command.get("target_node_id")
            resolved_id = cls.resolve_node_id(raw_target)
            if not resolved_id:
                logger.warning(
                    f"Comando focus_node descartado: target_node_id '{raw_target}' no existe en el grafo."
                )
                return None

            node = next((n for n in graph.nodes if n.id == resolved_id), None)
            return {
                "action": "focus_node",
                "target_node_id": resolved_id,
                "cluster_id": node.cluster if node else None,
            }

        # action == "focus_cluster"
        raw_cluster = command.get("cluster_id")
        valid_clusters = {n.cluster for n in graph.nodes}
        if not raw_cluster or raw_cluster not in valid_clusters:
            logger.warning(
                f"Comando focus_cluster descartado: cluster_id '{raw_cluster}' no existe en el grafo."
            )
            return None

        return {
            "action": "focus_cluster",
            "target_node_id": None,
            "cluster_id": raw_cluster,
        }

    @classmethod
    def validate_highlighted_ids(cls, raw_ids: Any) -> List[str]:
        if not isinstance(raw_ids, list):
            return []

        valid: List[str] = []
        seen: set[str] = set()
        dropped: List[str] = []

        for item in raw_ids:
            resolved = cls.resolve_node_id(item if isinstance(item, str) else None)
            if resolved:
                if resolved not in seen:
                    seen.add(resolved)
                    valid.append(resolved)
            else:
                dropped.append(str(item))

        if dropped:
            logger.warning(f"IDs descartados en highlighted_node_ids por inexistentes: {dropped}")

        return valid

    @classmethod
    def validate_response(cls, response_data: Dict[str, Any]) -> Dict[str, Any]:
        validated = dict(response_data)
        validated["camera_command"] = cls.validate_camera_command(
            validated.get("camera_command")
        )
        validated["highlighted_node_ids"] = cls.validate_highlighted_ids(
            validated.get("highlighted_node_ids", [])
        )
        if validated.get("status") not in ("ok", "fallback"):
            validated["status"] = "ok"
        return validated
