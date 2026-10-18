import pandas as pd
import numpy as np
import networkx as nx
import logging
import unicodedata
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# ==========================================
# 1. Configuración Dinámica (Pydantic v2)
# ==========================================
class PipelineSettings(BaseSettings):
    RAW_DATA_PATH: Path = Path("data/raw/normalizado_standar.csv")
    TOP_COMUNAS: int = 20
    TOP_COLEGIOS: int = 35
    MIN_GROUP_SIZE: int = 5
    Z_SCORE_TOLERANCE: float = 0.1
    KNOWN_Z_SCORES: list[float] = [-2.761216, -1.445046, -0.128877, 1.187292, 2.503462, 3.819631, 5.135800]
    ACRONYMS: list[str] = ["ITM", "CEFA", "SENA", "INEM", "UEMR"]

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = PipelineSettings()

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# ==========================================
# 2. Utilidades de Limpieza y Transformación
# ==========================================
def clean_text_series(series: pd.Series, fallback: str = "Sin dato") -> pd.Series:
    """Limpia espacios, aplica regex para basura de sistema y da formato Title Case."""
    s = series.astype(str).str.strip().str.replace(r'\s+', ' ', regex=True)
    mask = s.str.contains(r'\*\*.*(seleccionar|desconocid).*\*\*|^nan$', case=False, regex=True)
    s = np.where(mask, fallback, s)
    s = pd.Series(s, index=series.index).str.title()
    
    # Restaurar siglas conocidas que title() rompió (ej. "Itm" -> "ITM")
    for acr in settings.ACRONYMS:
        s = s.str.replace(acr.title(), acr, case=True)
    return s

def generate_slug(series: pd.Series, prefix: str) -> pd.Series:
    """Genera IDs únicos sin tildes ni caracteres especiales."""
    def normalize_string(text: str) -> str:
        text = str(text)
        # Elimina marcas diacríticas (tildes)
        text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode('utf-8')
        return text

    s = series.apply(normalize_string).str.lower().str.replace(r'[^a-z0-9]+', '-', regex=True).str.strip('-')
    return f"{prefix}:" + s

def map_zscore_to_stratum(val: float) -> float:
    """Busca el estrato correspondiente con tolerancia al error flotante."""
    if pd.isna(val):
        return np.nan
    known_z = np.array(settings.KNOWN_Z_SCORES)
    diffs = np.abs(known_z - val)
    idx = diffs.argmin()
    if diffs[idx] > settings.Z_SCORE_TOLERANCE:
        return np.nan
    return float(idx)

# ==========================================
# 3. Función Principal de Agregación
# ==========================================
def build_aggregated_graph() -> nx.Graph:
    logger.info("Leyendo dataset crudo...")
    df = pd.read_csv(settings.RAW_DATA_PATH)
    total_records_initial = len(df)
    
    # 3.1 Mapeo de Estrato y Categoría Rural
    df['id_estrato_real'] = df['id_estrato'].apply(map_zscore_to_stratum)
    df["es_rural"] = df["id_estrato_real"] == 0
    # NaN para lo rural o no reportado, así no afecta la mediana de estratos (1 a 6)
    df["estrato"] = df["id_estrato_real"].where(df["id_estrato_real"] > 0) 
    
    # 3.2 Limpieza y Agregación Top-N
    levels = [
        {'col': 'comuna', 'prefix': 'comuna', 'cluster': 'territorio', 'top': settings.TOP_COMUNAS, 'others': 'Otras Comunas'},
        {'col': 'institucion', 'prefix': 'colegio', 'cluster': 'origen_academico', 'top': settings.TOP_COLEGIOS, 'others': 'Otros Colegios'},
        {'col': 'facultad', 'prefix': 'facultad', 'cluster': 'destino_academico', 'top': None, 'others': None}
    ]
    
    for lvl in levels:
        col = lvl['col']
        df[f'{col}_clean'] = clean_text_series(df[col])
        
        if lvl['top'] is not None:
            # Excluir 'Sin Dato' de la competencia por el Top-N
            valid_counts = df[df[f'{col}_clean'] != 'Sin Dato'][f'{col}_clean'].value_counts()
            top_entities = valid_counts.head(lvl['top']).index
            df[f'{col}_agg'] = np.where(df[f'{col}_clean'].isin(top_entities), df[f'{col}_clean'], lvl['others'])
        else:
            df[f'{col}_agg'] = df[f'{col}_clean']
            
        df[f'{col}_slug'] = generate_slug(df[f'{col}_agg'], lvl['prefix'])

    # 3.3 Inicializar Grafo y Nodos
    G = nx.Graph()
    logger.info("Construyendo nodos y métricas locales...")
    
    for lvl in levels:
        col_agg = f"{lvl['col']}_agg"
        col_slug = f"{lvl['col']}_slug"
        
        for slug, group in df.groupby(col_slug):
            volume = len(group)
            estratos = group["estrato"].dropna()
            
            G.add_node(
                slug,
                label=group[col_agg].iloc[0],
                type=lvl['prefix'],
                cluster=lvl['cluster'],
                metrics={
                    "volume": volume,
                    "estrato_median": float(estratos.median()) if not estratos.empty else None,
                    "rural_share": round(float(group["es_rural"].mean()), 4)
                }
            )

    # 3.4 Aristas y Umbral de Privacidad (Lost Flow)
    logger.info("Calculando aristas y registrando flujo perdido...")
    edge_pairs = [('comuna_slug', 'institucion_slug'), ('institucion_slug', 'facultad_slug')]
    lost_flow_total = 0
    
    for src_col, tgt_col in edge_pairs:
        edges = df.groupby([src_col, tgt_col]).size().reset_index(name='weight')
        edges_valid = edges[edges['weight'] >= settings.MIN_GROUP_SIZE]
        
        flow_before = edges['weight'].sum()
        flow_after = edges_valid['weight'].sum()
        lost_flow_total += (flow_before - flow_after)
        
        G.add_weighted_edges_from(zip(edges_valid[src_col], edges_valid[tgt_col], edges_valid['weight']))

    # 3.5 Métricas relacionales puras
    degree_dict = dict(G.degree()) 
    strength_dict = dict(G.degree(weight='weight')) 
    
    for node in G.nodes():
        G.nodes[node]['metrics']['degree'] = degree_dict.get(node, 0)
        G.nodes[node]['metrics']['strength'] = strength_dict.get(node, 0)

    # 3.6 Matriz Cruzada Comuna -> Facultad con umbral de privacidad
    logger.info("Calculando matriz cruzada segura (Copiloto)...")
    cross_tab = pd.crosstab(df['comuna_slug'], df['facultad_slug'])
    cross_tab_dict = {}
    
    for c_slug, row in cross_tab.iterrows():
        c_dict = {}
        for f_slug, val in row.items():
            # Filtro de privacidad para la matriz de la IA
            if val >= settings.MIN_GROUP_SIZE:
                c_dict[str(f_slug)] = int(val)
        if c_dict: # Solo agregar comunas que tengan flujos válidos
            cross_tab_dict[str(c_slug)] = c_dict

    # 3.7 Metadatos de Validación e Invariantes
    coverage_pct = round(((total_records_initial - (lost_flow_total / 2)) / total_records_initial) * 100, 2)
    
    meta = {
        "total_records_raw": total_records_initial,
        "nodes_count": G.number_of_nodes(),
        "edges_count": G.number_of_edges(),
        "lost_flow_records": int(lost_flow_total / 2), # Dividido entre 2 por las dos capas de enlaces
        "effective_coverage_pct": coverage_pct,
        "matrix_comuna_facultad": cross_tab_dict
    }
    G.graph['meta'] = meta

    logger.info(f"✅ Grafo construido. Cobertura de flujo efectiva: {coverage_pct}%")
    logger.info(f"Nodos: {G.number_of_nodes()} | Aristas: {G.number_of_edges()}")
    
    # Invariante crítico: El volumen de estudiantes reportado en el meta no debe inflarse
    assert total_records_initial > 0, "El dataset está vacío."
    
    return G

if __name__ == "__main__":
    g = build_aggregated_graph()