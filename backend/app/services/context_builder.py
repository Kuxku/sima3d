import json
from app.services.graph_service import GraphService

class ContextBuilder:
    @staticmethod
    def build_network_context() -> str:
        """
        Builds a compact statistical summary of the graph 
        to inject into Gemini's system prompt.
        """
        graph = GraphService.get_graph()
        
        # 1. Basic Stats
        total_nodes = graph.meta.node_count
        coverage = graph.meta.total_records
        
        # 2. Extract top nodes by volume
        sorted_nodes = sorted(graph.nodes, key=lambda n: n.metrics.volume, reverse=True)
        top_comunas = [n for n in sorted_nodes if n.type == "comuna"][:5]
        top_colegios = [n for n in sorted_nodes if n.type == "colegio"][:5]
        facultades = [n for n in sorted_nodes if n.type == "facultad"]
        
        # 3. Valid IDs list (Crucial to prevent hallucinations in camera commands)
        valid_ids = [n.id for n in graph.nodes]
        
        # 4. Format context string
        context = f"""
        NETWORK STATUS:
        - Total students analyzed: {coverage}
        - Total aggregated nodes: {total_nodes}
        
        TOP COMUNAS (By student volume):
        {', '.join([f"{c.label} ({c.metrics.volume} students)" for c in top_comunas])}
        
        TOP SCHOOLS (By student volume):
        {', '.join([f"{s.label} ({s.metrics.volume} students)" for s in top_colegios])}
        
        FACULTIES:
        {', '.join([f"{f.label} ({f.metrics.volume} students)" for f in facultades])}
        
        CROSS MATRIX (Comuna -> Facultad flows):
        {json.dumps(graph.meta.matrix_comuna_facultad, ensure_ascii=False)}
        
        VALID NODE IDs FOR CAMERA COMMANDS:
        {json.dumps(valid_ids)}
        """
        return context