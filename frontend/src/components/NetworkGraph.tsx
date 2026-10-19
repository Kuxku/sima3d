import { useMemo, useState } from 'react';
import type { GraphPayload, GraphNode } from '../types/graph';
import { Line, Html } from '@react-three/drei';
import * as THREE from 'three';

interface NetworkGraphProps {
    data: GraphPayload;
    nodePositions: Map<string, THREE.Vector3>;
    selectedNode: GraphNode | null;
    highlightedIds: string[];
    onSelectNode: (node: GraphNode | null) => void;
}

export function NetworkGraph({
    data,
    nodePositions,
    selectedNode,
    highlightedIds,
    onSelectNode,
}: NetworkGraphProps) {
    const [hoveredId, setHoveredId] = useState<string | null>(null);

    const nodes = useMemo(() => data.nodes || [], [data]);
    const edges = useMemo(() => data.edges || [], [data]);

    // Determinar si hay algún filtro visual activo (selección o respuesta del Copilot)
    const hasActiveFilter = selectedNode !== null || highlightedIds.length > 0;

    // Nodos conectados directamente al nodo seleccionado para no apagarlos del todo
    const connectedIds = useMemo(() => {
        const set = new Set<string>();
        if (selectedNode) {
            set.add(selectedNode.id);
            edges.forEach((e) => {
                if (e.source === selectedNode.id) set.add(e.target);
                if (e.target === selectedNode.id) set.add(e.source);
            });
        }
        highlightedIds.forEach((id) => set.add(id));
        return set;
    }, [selectedNode, highlightedIds, edges]);

    const getColor = (type: string) => {
        switch (type) {
            case 'comuna':
                return '#38bdf8'; // Azul cian brillante
            case 'colegio':
                return '#34d399'; // Verde neón esmeralda
            case 'facultad':
                return '#fbbf24'; // Ámbar dorado
            default:
                return '#ffffff';
        }
    };

    return (
        <group
            onPointerMissed={() => {
                // Al hacer clic en el vacío, limpiamos la selección
                onSelectNode(null);
            }}
        >
            {/* 1. ARISTAS INTELIGENTES */}
            {edges.map((edge, idx) => {
                const sourcePos = nodePositions.get(edge.source);
                const targetPos = nodePositions.get(edge.target);
                if (!sourcePos || !targetPos) return null;

                const isConnectedToSelected =
                    selectedNode &&
                    (edge.source === selectedNode.id || edge.target === selectedNode.id);
                const isHighlightedEdge =
                    highlightedIds.includes(edge.source) &&
                    highlightedIds.includes(edge.target);

                const isActiveEdge = isConnectedToSelected || isHighlightedEdge;

                // Si hay un nodo seleccionado, resaltamos sus conexiones y atenuamos el resto
                const lineColor = isActiveEdge ? '#38bdf8' : '#334155';
                const lineOpacity = hasActiveFilter ? (isActiveEdge ? 0.75 : 0.05) : 0.22;
                const lineWidth = isActiveEdge ? 1.5 : 0.5;

                return (
                    <Line
                        key={`edge-${idx}`}
                        points={[sourcePos, targetPos]}
                        color={lineColor}
                        lineWidth={lineWidth}
                        transparent
                        opacity={lineOpacity}
                    />
                );
            })}

            {/* 2. NODOS INTERACTIVOS */}
            {nodes.map((node) => {
                const volume = node.metrics?.volume || 1;
                const baseScale = Math.max(0.2, Math.min(Math.log10(volume) * 0.24, 0.85));
                const pos = nodePositions.get(node.id);
                if (!pos) return null;

                const color = getColor(node.type);
                const isSelected = selectedNode?.id === node.id;
                const isHovered = hoveredId === node.id;
                const isHighlighted = highlightedIds.includes(node.id);
                const isNeighbor = connectedIds.has(node.id);

                // Multiplicador de tamaño al interactuar
                const activeScale =
                    isSelected || isHovered
                        ? baseScale * 1.35
                        : isHighlighted
                            ? baseScale * 1.2
                            : baseScale;

                // Intensidad lumínica dinámica para el motor Bloom
                const emissiveIntensity =
                    isSelected || isHovered
                        ? 2.0
                        : isHighlighted
                            ? 1.5
                            : hasActiveFilter
                                ? isNeighbor
                                    ? 0.6
                                    : 0.08
                                : 0.65;

                const nodeOpacity = hasActiveFilter ? (isNeighbor ? 1.0 : 0.2) : 0.95;

                // Solo mostramos etiqueta si el usuario interactúa o el Copilot lo pide (Cero ruido visual)
                const showLabel = isSelected || isHovered || isHighlighted;

                return (
                    <group key={node.id} position={[pos.x, pos.y, pos.z]}>
                        <mesh
                            onClick={(e) => {
                                e.stopPropagation();
                                onSelectNode(node);
                            }}
                            onPointerOver={(e) => {
                                e.stopPropagation();
                                setHoveredId(node.id);
                                document.body.style.cursor = 'pointer';
                            }}
                            onPointerOut={() => {
                                setHoveredId(null);
                                document.body.style.cursor = 'auto';
                            }}
                        >
                            <sphereGeometry args={[activeScale, 32, 32]} />
                            <meshStandardMaterial
                                color={color}
                                emissive={color}
                                emissiveIntensity={emissiveIntensity}
                                roughness={0.15}
                                metalness={0.8}
                                transparent
                                opacity={nodeOpacity}
                            />
                        </mesh>

                        {/* Anillo Sci-Fi orbital para nodos seleccionados o destacados por IA */}
                        {(isSelected || isHighlighted) && (
                            <mesh rotation={[Math.PI / 2, 0, 0]}>
                                <ringGeometry args={[activeScale * 1.35, activeScale * 1.48, 32]} />
                                <meshBasicMaterial
                                    color={color}
                                    side={THREE.DoubleSide}
                                    transparent
                                    opacity={0.85}
                                />
                            </mesh>
                        )}

                        {/* Etiqueta Flotante Bajo Demanda */}
                        {showLabel && (
                            <Html distanceFactor={18} position={[0, activeScale + 0.45, 0]} center zIndexRange={[100, 0]}>
                                <div className="node-tooltip">
                                    <span className="node-tooltip-badge" style={{ backgroundColor: color }} />
                                    <span className="node-tooltip-title">{node.label}</span>
                                    <span className="node-tooltip-metric">
                                        {node.metrics.volume.toLocaleString()} est.
                                    </span>
                                </div>
                            </Html>
                        )}
                    </group>
                );
            })}
        </group>
    );
}