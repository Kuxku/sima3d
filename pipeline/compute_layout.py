import networkx as nx
import numpy as np
import logging

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

def compute_3d_layout(G: nx.Graph, scale: float = 100.0, algorithm: str = "Stratified Force-Directed 3D") -> nx.Graph:
    """
    Computes 3D coordinates using a Stratified Force-Directed algorithm.
    Superior to Kamada-Kawai for academic mobility networks because:
    1. Weighs attraction by actual student migration flow (weight='weight').
    2. Uses semantic stratification so faculties act as structural hubs,
       preventing central hairball collapse.
    3. Performs an explicit multi-body volumetric collision-prevention pass.
    4. Normalizes output deterministically to bounded [-scale, scale] space.
    """
    logger.info(f"Computing 3D layout ({algorithm})...")

    if algorithm == "Kamada-Kawai 3D":
        initial_pos = nx.spring_layout(G, dim=3, seed=42)
        pos = nx.kamada_kawai_layout(G, pos=initial_pos, dim=3)
    else:
        # 1. Stratified Initial Positions
        # Separate nodes into semantic strata (facultades, colegios, comunas)
        initial_pos = {}
        facultades = [n for n, d in G.nodes(data=True) if d.get('type') == 'facultad']
        colegios = [n for n, d in G.nodes(data=True) if d.get('type') == 'colegio']
        comunas = [n for n, d in G.nodes(data=True) if d.get('type') == 'comuna']

        num_fac = max(len(facultades), 1)
        fac_pos = {}
        for idx, fac in enumerate(facultades):
            theta = (idx / num_fac) * 2 * np.pi
            # Distributed on an outer ellipsoid ring
            x = np.cos(theta) * 0.85
            y = np.sin(idx * 1.8) * 0.35
            z = np.sin(theta) * 0.85
            fac_pos[fac] = np.array([x, y, z], dtype=np.float64)
            initial_pos[fac] = fac_pos[fac]

        # Colegios placed near their highest-flow faculty
        rng = np.random.RandomState(42)
        for col in colegios:
            best_fac = None
            max_w = -1
            for neighbor in G.neighbors(col):
                if G.nodes[neighbor].get('type') == 'facultad':
                    w = G[col][neighbor].get('weight', 1)
                    if w > max_w:
                        max_w = w
                        best_fac = neighbor
            if best_fac and best_fac in fac_pos:
                jitter = rng.normal(0, 0.18, size=3)
                initial_pos[col] = fac_pos[best_fac] * 0.65 + jitter
            else:
                initial_pos[col] = rng.uniform(-0.5, 0.5, size=3)

        # Comunas placed on an intermediate shell
        num_com = max(len(comunas), 1)
        for idx, com in enumerate(comunas):
            phi = (idx / num_com) * 2 * np.pi
            initial_pos[com] = np.array([
                np.cos(phi) * 0.45,
                np.sin(idx * 2.1) * 0.25,
                np.sin(phi) * 0.45
            ], dtype=np.float64)

        # 2. Weighted Force-Directed Relaxation (Hooke & Fruchterman-Reingold)
        k_optimal = 2.4 / np.sqrt(max(G.number_of_nodes(), 1))
        pos = nx.spring_layout(
            G,
            dim=3,
            pos=initial_pos,
            weight='weight',
            k=k_optimal,
            iterations=120,
            seed=42
        )

        # 3. Soft-Body Volumetric Anti-Collision Pass
        node_list = list(pos.keys())
        coords = np.array([pos[n] for n in node_list], dtype=np.float64)
        radii = np.array([
            max(0.04, min(np.sqrt(G.nodes[n].get('metrics', {}).get('volume', 1)) * 0.005, 0.12))
            for n in node_list
        ], dtype=np.float64)

        for _ in range(25):
            for i in range(len(node_list)):
                for j in range(i + 1, len(node_list)):
                    delta = coords[i] - coords[j]
                    dist = np.linalg.norm(delta)
                    min_dist = radii[i] + radii[j] + 0.02
                    if dist < min_dist:
                        if dist < 1e-4:
                            delta = rng.normal(0, 0.01, size=3)
                            dist = np.linalg.norm(delta)
                        overlap = min_dist - dist
                        correction = (delta / dist) * (overlap * 0.5)
                        coords[i] += correction
                        coords[j] -= correction

        for idx, n in enumerate(node_list):
            pos[n] = coords[idx]

    # 4. Min-Max Normalization to [-scale, scale]
    pos_array = np.array(list(pos.values()))
    min_val, max_val = pos_array.min(), pos_array.max()

    for node, coord in pos.items():
        norm_coords = 2.0 * (coord - min_val) / (max_val - min_val) - 1.0
        norm_coords = norm_coords * scale

        G.nodes[node]['position'] = {
            "x": round(float(norm_coords[0]), 2),
            "y": round(float(norm_coords[1]), 2),
            "z": round(float(norm_coords[2]), 2)
        }

    logger.info("3D Layout computed and normalized successfully.")

    if 'meta' not in G.graph:
        G.graph['meta'] = {}
    G.graph['meta']['layout'] = {"algorithm": algorithm, "seed": 42, "scale": scale}

    return G