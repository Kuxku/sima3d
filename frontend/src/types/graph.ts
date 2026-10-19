export interface Metrics {
    volume: number;
    rural_share: number;
    estrato_median: number;
    degree?: number;
    strength?: number;
}

export interface GraphNode {
    id: string;
    label: string;
    type: "comuna" | "colegio" | "facultad";
    cluster?: string;
    metrics: Metrics;
    position: {
        x: number;
        y: number;
        z: number;
    };
}

export interface GraphEdge {
    source: string;
    target: string;
    weight: number;
}

export interface GraphMeta {
    generated_at: string;
    total_records: number;
    node_count: number;
    edge_count: number;
    matrix_comuna_facultad?: Record<string, unknown>;
}

export interface GraphPayload {
    meta: GraphMeta;
    nodes: GraphNode[];
    edges: GraphEdge[];
}

export interface CameraCommand {
    action: "focus_node" | "focus_cluster" | "reset_view";
    target_node_id: string | null;
    cluster_id: string | null;
}