import json
import logging
from datetime import datetime
import networkx as nx
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

OUTPUT_PATH = Path("data/processed/grafo_3d.json")

def export_graph_to_json(G: nx.Graph):
    """
    Validates and exports the NetworkX graph to a JSON file 
    matching the strict contract defined in AGENTS.md.
    """
    logger.info(f"Exporting graph to {OUTPUT_PATH}...")
    
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    
    # 1. Build Nodes Array
    nodes = []
    for node_id, data in G.nodes(data=True):
        if 'position' not in data:
            raise ValueError(f"Node '{node_id}' is missing 3D 'position' data.")
            
        nodes.append({
            "id": str(node_id),
            "label": str(data.get('label', node_id)),
            "type": str(data.get('type', 'unknown')),
            "cluster": str(data.get('cluster', 'unknown')),
            "position": data['position'],
            "metrics": data.get('metrics', {})
        })
        
    # 2. Build Edges Array
    edges = []
    for u, v, data in G.edges(data=True):
        edges.append({
            "source": str(u),
            "target": str(v),
            "weight": int(data.get('weight', 1))
        })
        
    # 3. Build Meta object
    original_meta = G.graph.get('meta', {})
    meta = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "total_records": original_meta.get('total_records_raw', 0),
        "node_count": len(nodes),
        "edge_count": len(edges),
        "layout": original_meta.get('layout', {}),
        "matrix_comuna_facultad": original_meta.get('matrix_comuna_facultad', {})
    }
    
    # 4. Assemble Final Payload
    payload = {
        "meta": meta,
        "nodes": nodes,
        "edges": edges
    }
    
    # 5. Write to Disk
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        
    logger.info("Graph successfully exported! Ready for Backend.")

if __name__ == "__main__":
    # Integration test snippet (assumes build_graph and compute_layout exist)
    try:
        from pipeline.build_graph import build_aggregated_graph
        from pipeline.compute_layout import compute_3d_layout
        
        g_base = build_aggregated_graph()
        g_layout = compute_3d_layout(g_base)
        export_graph_to_json(g_layout)
    except ImportError:
        logger.warning("Pipeline modules not found. Run from the project root using 'python -m pipeline.export_graph'")