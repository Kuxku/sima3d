import { useMemo, useState } from 'react';
import type { GraphPayload, GraphNode } from '../../types/graph';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { V2_CONFIG } from '../config';
import { SmartEdges } from './SmartEdges';
import { EdgeParticles } from './EdgeParticles';
import { FeatureBoundary } from './FeatureBoundary';

interface NetworkGraphV2Props {
  data: GraphPayload;
  nodePositions: Map<string, THREE.Vector3>;
  selectedNode: GraphNode | null;
  highlightedIds: string[];
  onSelectNode: (node: GraphNode | null) => void;
  smartEdgesEnabled: boolean;
  particlesEnabled: boolean;
}

export function NetworkGraphV2({
  data,
  nodePositions,
  selectedNode,
  highlightedIds,
  onSelectNode,
  smartEdgesEnabled,
  particlesEnabled,
}: NetworkGraphV2Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const nodes = useMemo(() => data.nodes || [], [data]);
  const edges = useMemo(() => data.edges || [], [data]);

  // El nodo activo es el seleccionado, o el que tiene hover si no hay ninguno seleccionado
  const activeNodeId = selectedNode?.id || hoveredId || null;
  const hasActiveFilter = activeNodeId !== null || highlightedIds.length > 0;

  // Nodos vecinos conectados al nodo activo
  const connectedIds = useMemo(() => {
    const set = new Set<string>();
    if (activeNodeId) {
      set.add(activeNodeId);
      edges.forEach((e) => {
        if (e.source === activeNodeId) set.add(e.target);
        if (e.target === activeNodeId) set.add(e.source);
      });
    }
    highlightedIds.forEach((id) => set.add(id));
    return set;
  }, [activeNodeId, highlightedIds, edges]);

  // Aristas activas para el sistema de partículas
  const activeEdges = useMemo(() => {
    if (!activeNodeId) return [];
    return edges.filter((e) => e.source === activeNodeId || e.target === activeNodeId);
  }, [edges, activeNodeId]);

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
      {/* 1. ARISTAS INTELIGENTES CON JERARQUÍA Y DEGRADADO (Mejora 3) */}
      <FeatureBoundary featureName="SmartEdges">
        <SmartEdges
          edges={edges}
          nodes={nodes}
          nodePositions={nodePositions}
          activeNodeId={activeNodeId}
          highlightedIds={highlightedIds}
          enabled={smartEdgesEnabled}
        />
      </FeatureBoundary>

      {/* 2. PARTÍCULAS EN ARISTAS ACTIVAS (Mejora 3b) */}
      <FeatureBoundary featureName="EdgeParticles">
        <EdgeParticles
          activeEdges={activeEdges}
          nodePositions={nodePositions}
          enabled={particlesEnabled && activeEdges.length > 0}
        />
      </FeatureBoundary>

      {/* 3. NODOS INTERACTIVOS */}
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

        // Si hay un nodo activo en foco, atenuamos fuertemente los no conectados
        const emissiveIntensity =
          isSelected || isHovered
            ? 2.2
            : isHighlighted
              ? 1.6
              : hasActiveFilter
                ? isNeighbor
                  ? 0.75
                  : 0.04
                : 0.65;

        const nodeOpacity = hasActiveFilter ? (isNeighbor ? 1.0 : 0.15) : 0.95;
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
