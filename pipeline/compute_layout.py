import networkx as nx
import numpy as np
import logging

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

def compute_3d_layout(G: nx.Graph, scale: float = 100.0) -> nx.Graph:
    """
    Computes 3D coordinates using Kamada-Kawai layout.
    Uses a spring layout with a fixed seed to generate deterministic initial positions.
    Normalizes the output to a bounded [-scale, scale] space for stable frontend rendering.
    """
    logger.info("Computing 3D layout (Kamada-Kawai)...")
    
    # 1. Deterministic initial positions
    initial_pos = nx.spring_layout(G, dim=3, seed=42)
    
    # 2. Compute Layout
    pos = nx.kamada_kawai_layout(G, pos=initial_pos, dim=3)
    
    # 3. Min-Max Normalization to [-scale, scale]
    pos_array = np.array(list(pos.values()))
    min_val, max_val = pos_array.min(), pos_array.max()
    
    for node, coords in pos.items():
        norm_coords = 2.0 * (coords - min_val) / (max_val - min_val) - 1.0
        norm_coords = norm_coords * scale
        
        # 4. Attach to node attributes
        G.nodes[node]['position'] = {
            "x": round(float(norm_coords[0]), 2),
            "y": round(float(norm_coords[1]), 2),
            "z": round(float(norm_coords[2]), 2)
        }
        
    logger.info("3D Layout computed and normalized successfully.")
    
    # Update meta layout info
    if 'meta' not in G.graph:
        G.graph['meta'] = {}
    G.graph['meta']['layout'] = {"algorithm": "Kamada-Kawai 3D", "seed": 42, "scale": scale}
    
    return G