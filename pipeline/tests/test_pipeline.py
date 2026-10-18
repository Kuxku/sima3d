import pytest
import pandas as pd
import numpy as np
import networkx as nx
import json
from pathlib import Path

# Importar funciones del pipeline
from pipeline.build_graph import clean_text_series, map_zscore_to_stratum, build_aggregated_graph, settings as pipeline_settings
from pipeline.compute_layout import compute_3d_layout
from pipeline.export_graph import export_graph_to_json
import pipeline.export_graph as export_module

# ==========================================
# 1. Pruebas Unitarias: Limpieza y Transformación
# ==========================================
def test_clean_text_series():
    """Valida la limpieza de placeholders, espacios y capitalización de siglas."""
    raw_data = pd.Series([
        "  belén  ", 
        "** desconocida **", 
        "itm", 
        "cefa", 
        "** seleccionar**", 
        "nan"
    ])
    
    cleaned = clean_text_series(raw_data, fallback="Sin dato")
    
    assert cleaned.iloc[0] == "Belén"
    assert cleaned.iloc[1] == "Sin dato"
    assert cleaned.iloc[2] == "ITM"  # Validar que la sigla se respeta
    assert cleaned.iloc[3] == "CEFA"
    assert cleaned.iloc[4] == "Sin dato"
    assert cleaned.iloc[5] == "Sin dato"

def test_map_zscore_to_stratum():
    """Valida el mapeo de Z-score con tolerancias e ignorando corruptos."""
    # Mapeo exacto
    assert map_zscore_to_stratum(-1.445046) == 1.0
    
    # Mapeo con pequeña variación flotante (dentro de Z_SCORE_TOLERANCE 0.1)
    assert map_zscore_to_stratum(-1.430000) == 1.0
    
    # Mapeo fallido (corrupto que excede tolerancia)
    assert np.isnan(map_zscore_to_stratum(9.999999))
    
    # Mapeo nulo
    assert np.isnan(map_zscore_to_stratum(np.nan))

# ==========================================
# 2. Pruebas de Integración: Pipeline Completo
# ==========================================
@pytest.fixture
def synthetic_csv(tmp_path):
    """Genera un CSV sintético temporal para inyectar en el pipeline."""
    data = """comuna,institucion,facultad,id_estrato
robledo,itm,ingenierias,-1.445046
robledo,itm,ingenierias,-1.445046
robledo,itm,ingenierias,0
robledo,itm,ingenierias,5.135800
belen,cefa,ciencias,-0.128877
belen,cefa,ciencias,-0.128877
** desconocida **,** seleccionar**,Sin Dato,9.999
"""
    file_path = tmp_path / "synthetic_data.csv"
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(data)
    return file_path

@pytest.fixture
def override_settings(synthetic_csv):
    """Sobreescribe configuraciones globales solo para la ejecución del test."""
    original_path = pipeline_settings.RAW_DATA_PATH
    original_min_group = pipeline_settings.MIN_GROUP_SIZE
    
    # Ajustar para el dataset sintético
    pipeline_settings.RAW_DATA_PATH = synthetic_csv
    pipeline_settings.MIN_GROUP_SIZE = 2  # Bajamos el umbral para permitir los flujos sintéticos
    
    yield
    
    # Restaurar
    pipeline_settings.RAW_DATA_PATH = original_path
    pipeline_settings.MIN_GROUP_SIZE = original_min_group

def test_build_aggregated_graph(override_settings):
    """Valida la agregación, métricas relacionales y matriz cruzada."""
    G = build_aggregated_graph()
    
    assert isinstance(G, nx.Graph)
    assert G.number_of_nodes() > 0
    assert G.number_of_edges() > 0
    
    # Validar que el nodo 'robledo' agrupo correctamente los 4 registros
    node_data = G.nodes.get('comuna:robledo')
    assert node_data is not None
    assert node_data['type'] == 'comuna'
    assert node_data['metrics']['volume'] == 4
    # rural_share debe ser 0.25 (1 registro rural de 4 totales)
    assert node_data['metrics']['rural_share'] == 0.25
    
    # Validar filtro MIN_GROUP_SIZE: La fila corrupta (1 solo registro) no debe generar arista
    # Robledo->ITM tiene 4 (pasa), Belen->CEFA tiene 2 (pasa)
    assert 'comuna:sin-dato' not in G.nodes
    
    # Validar la existencia de la matriz cruzada
    meta = G.graph.get('meta', {})
    assert 'matrix_comuna_facultad' in meta
    assert 'comuna:robledo' in meta['matrix_comuna_facultad']

def test_compute_layout_and_export(override_settings, tmp_path):
    """Valida que Kamada-Kawai normaliza correctamente y la exportación cumple el esquema."""
    # 1. Construir e inyectar layout
    G = build_aggregated_graph()
    G = compute_3d_layout(G, scale=100.0)
    
    # Verificar posiciones
    for node, data in G.nodes(data=True):
        assert 'position' in data
        pos = data['position']
        assert 'x' in pos and 'y' in pos and 'z' in pos
        # Validar límites de escala
        assert -100.0 <= pos['x'] <= 100.0
        
    # 2. Exportar a JSON
    test_out_path = tmp_path / "test_grafo.json"
    export_module.OUTPUT_PATH = test_out_path
    
    export_graph_to_json(G)
    
    assert test_out_path.exists()
    
    # 3. Validar contrato del JSON resultante
    with open(test_out_path, "r", encoding="utf-8") as f:
        payload = json.load(f)
        
    assert "meta" in payload
    assert "nodes" in payload
    assert "edges" in payload
    assert payload["meta"]["total_records"] == 7
    assert len(payload["nodes"]) > 0
    assert payload["meta"]["layout"]["algorithm"] == "Kamada-Kawai 3D"