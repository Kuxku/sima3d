from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

class Position3D(BaseModel):
    x: float
    y: float
    z: float

class NodeMetrics(BaseModel):
    volume: int
    estrato_median: Optional[float] = None
    rural_share: Optional[float] = None
    degree: int
    strength: int

class GraphNode(BaseModel):
    id: str
    label: str
    type: str
    cluster: str
    position: Position3D
    metrics: NodeMetrics

class GraphEdge(BaseModel):
    source: str
    target: str
    weight: int

class GraphMetaLayout(BaseModel):
    algorithm: str
    seed: int
    scale: float

class GraphMeta(BaseModel):
    generated_at: str
    total_records: int 
    node_count: int
    edge_count: int
    layout: GraphMetaLayout
    matrix_comuna_facultad: Dict[str, Dict[str, int]]

class GraphPayload(BaseModel):
    meta: GraphMeta
    nodes: List[GraphNode]
    edges: List[GraphEdge]