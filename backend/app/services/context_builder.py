import json
from typing import Any, Dict, List, Optional
from app.core.config import settings
from app.services.graph_service import GraphService

# Regla anti-alucinación de posiciones. Viaja dentro del contexto, por lo que aplica
# a todos los prompts que lo consumen (chat, voz Modo 1 y Gemini Live).
RANKING_RULES = """
        RANKING RULES (MANDATORY):
        - Positions (#1, #2, "la segunda", "la quinta"...) may ONLY be stated exactly as listed in the RANKINGS below
          or in the 'ranking' field returned by a tool. Never compute, guess or approximate a position.
        - Aggregate groups (AGGREGATE GROUPS) are NOT real entities: never assign them a rank and never call them a comuna or school.
        - If an entity's position is not listed, do not mention any position; state only its volume.
"""


class ContextBuilder:
    _cached_context: Optional[str] = None
    _cached_rankings: Optional[Dict[str, Dict[str, Any]]] = None

    @classmethod
    def _build_rankings(cls) -> Dict[str, Dict[str, Any]]:
        """
        Calcula (una vez) el ranking por volumen de cada nodo dentro de su tipo,
        excluyendo los nodos agregados configurados en AGGREGATE_NODE_IDS.
        """
        if cls._cached_rankings is not None:
            return cls._cached_rankings

        graph = GraphService.get_graph()
        aggregate_ids = set(settings.AGGREGATE_NODE_IDS)
        rankings: Dict[str, Dict[str, Any]] = {}

        node_types = sorted({n.type for n in graph.nodes})
        for node_type in node_types:
            ranked = sorted(
                (n for n in graph.nodes if n.type == node_type and n.id not in aggregate_ids),
                key=lambda n: n.metrics.volume,
                reverse=True,
            )
            for position, node in enumerate(ranked, start=1):
                rankings[node.id] = {
                    "rank_by_volume": position,
                    "total_in_type": len(ranked),
                    "type": node_type,
                }

        for node in graph.nodes:
            if node.id in aggregate_ids:
                rankings[node.id] = {
                    "is_aggregate_group": True,
                    "type": node.type,
                    "note": "Grupo agregado de entidades pequeñas; no tiene posición en el ranking.",
                }

        cls._cached_rankings = rankings
        return rankings

    @classmethod
    def get_node_ranking(cls, node_id: str) -> Optional[Dict[str, Any]]:
        """Devuelve la posición verificada de un nodo (o su condición de grupo agregado)."""
        return cls._build_rankings().get(node_id)

    @classmethod
    def _format_ranking(cls, node_type: str) -> str:
        graph = GraphService.get_graph()
        rankings = cls._build_rankings()
        ranked = sorted(
            (n for n in graph.nodes if rankings.get(n.id, {}).get("rank_by_volume") and n.type == node_type),
            key=lambda n: rankings[n.id]["rank_by_volume"],
        )
        return "\n".join(
            f"        #{rankings[n.id]['rank_by_volume']} {n.label} [{n.id}] ({n.metrics.volume} students)"
            for n in ranked
        )

    @classmethod
    def build_network_context(cls) -> str:
        """
        Builds a compact statistical summary of the graph 
        to inject into Gemini's system prompt.
        Caches the static network summary in memory for instant reuse.
        """
        if cls._cached_context is not None:
            return cls._cached_context

        graph = GraphService.get_graph()
        
        # 1. Basic Stats
        total_nodes = graph.meta.node_count
        coverage = graph.meta.total_records
        
        # 2. Rankings verificados por tipo (los tipos se infieren del grafo)
        node_types = sorted({n.type for n in graph.nodes})
        rankings_block = "\n\n".join(
            f"        RANKING {t.upper()} (by student volume, aggregate groups excluded):\n{cls._format_ranking(t)}"
            for t in node_types
        )

        aggregate_ids = set(settings.AGGREGATE_NODE_IDS)
        aggregates: List[str] = [
            f"{n.label} [{n.id}] ({n.metrics.volume} students)"
            for n in graph.nodes
            if n.id in aggregate_ids
        ]
        
        # 3. Valid IDs list (Crucial to prevent hallucinations in camera commands)
        valid_ids = [n.id for n in graph.nodes]
        
        # 4. Format context string
        context = f"""
        NETWORK STATUS:
        - Total students analyzed: {coverage}
        - Total aggregated nodes: {total_nodes}
{RANKING_RULES}
        RANKINGS:
{rankings_block}

        AGGREGATE GROUPS (not real entities, no rank):
        {', '.join(aggregates) if aggregates else 'None'}
        
        CROSS MATRIX (Comuna -> Facultad flows):
        {json.dumps(graph.meta.matrix_comuna_facultad, ensure_ascii=False)}
        
        VALID NODE IDs FOR CAMERA COMMANDS:
        {json.dumps(valid_ids)}
        """
        cls._cached_context = context
        return context

    @classmethod
    def invalidate_cache(cls) -> None:
        """Clears the cached network context if the underlying graph changes."""
        cls._cached_context = None
        cls._cached_rankings = None
