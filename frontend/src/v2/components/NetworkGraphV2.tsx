import { useMemo, useState } from 'react';
import type { GraphPayload, GraphNode } from '../../types/graph';
import { Line, Html } from '@react-three/drei';
import * as THREE from 'three';
import { V2_CONFIG } from '../config';

interface NetworkGraphV2Props {
  data: GraphPayload;
  nodePositions: Map<string, THREE.Vector3>;
  selectedNode: GraphNode | null;
  highlightedIds: string[];
  onSelectNode: (node: GraphNode | null) => void;
}

export function NetworkGraphV2({
  data,
  nodePositions,
  selectedNode,
  highlightedIds,
  onSelectNode,
}: NetworkGraphV2Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const nodes = useMemo(() => data.nodes || [], [data]);
  const edges = useMemo(() => data.edges || [], [data]);

  const hasActiveFilter = selectedNode !== null || highlightedIds.length > 0;

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
        return V2_CONFIG.colors.comuna;
      case 'colegio':
        return V2_CONFIG.colors.colegio;
      case 'facultad':
        return V2_CONFIG.colors.facultad;
      default:
        return V2_CONFIG.colors.neutral;
    }
  };

  return (
    <group
      onPointerMissed={() => {
        onSelectNode(null);
      }}
    >
      {/* 1. ARISTAS */}
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
        const lineColor = isActiveEdge ? '#38bdf8' : '#334155';
        const lineOpacity = hasActiveFilter ? (isActiveEdge ? 0.75 : 0.05) : 0.22;
        const lineWidth = isActiveEdge ? 1.5 : 0.5;

        return (
          <Line
            key={`edge-v2-${idx}`}
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

        const activeScale =
          isSelected || isHovered
            ? baseScale * 1.35
            : isHighlighted
              ? baseScale * 1.2
              : baseScale;

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
