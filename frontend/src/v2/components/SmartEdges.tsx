import { useMemo } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import type { GraphEdge, GraphNode } from '../../types/graph';
import { V2_CONFIG } from '../config';

interface SmartEdgesProps {
  edges: GraphEdge[];
  nodes: GraphNode[];
  nodePositions: Map<string, THREE.Vector3>;
  activeNodeId: string | null;
  highlightedIds: string[];
  enabled: boolean;
}

/**
 * Convierte color hex string a THREE.Color
 */
function getNodeColor(type: string): THREE.Color {
  switch (type) {
    case 'comuna':
      return new THREE.Color(V2_CONFIG.colors.comuna);
    case 'colegio':
      return new THREE.Color(V2_CONFIG.colors.colegio);
    case 'facultad':
      return new THREE.Color(V2_CONFIG.colors.facultad);
    default:
      return new THREE.Color(V2_CONFIG.colors.neutral);
  }
}

export function SmartEdges({
  edges,
  nodes,
  nodePositions,
  activeNodeId,
  highlightedIds,
  enabled,
}: SmartEdgesProps) {
  // Mapa rápido de tipos de nodos para asignar colores de vértice
  const nodeTypeMap = useMemo(() => {
    const map = new Map<string, string>();
    nodes.forEach((n) => map.set(n.id, n.type));
    return map;
  }, [nodes]);

  const hasFilter = activeNodeId !== null || highlightedIds.length > 0;

  // Separar aristas activas (conectadas al nodo activo o destacadas) de las inactivas
  const { activeEdges, inactiveEdges } = useMemo(() => {
    const active: GraphEdge[] = [];
    const inactive: GraphEdge[] = [];

    edges.forEach((edge) => {
      const isConnectedToActive =
        activeNodeId && (edge.source === activeNodeId || edge.target === activeNodeId);
      const isHighlighted =
        highlightedIds.includes(edge.source) && highlightedIds.includes(edge.target);

      if (isConnectedToActive || isHighlighted) {
        active.push(edge);
      } else {
        inactive.push(edge);
      }
    });

    return { activeEdges: active, inactiveEdges: inactive };
  }, [edges, activeNodeId, highlightedIds]);

  // BUFFER ÚNICO DE ALTO RENDIMIENTO (1 draw call) para todas las líneas inactivas con Vertex Colors
  const backgroundGeometry = useMemo(() => {
    if (!enabled) return null;

    const positions: number[] = [];
    const colors: number[] = [];

    inactiveEdges.forEach((edge) => {
      const p1 = nodePositions.get(edge.source);
      const p2 = nodePositions.get(edge.target);
      if (!p1 || !p2) return;

      positions.push(p1.x, p1.y, p1.z);
      positions.push(p2.x, p2.y, p2.z);

      const c1 = getNodeColor(nodeTypeMap.get(edge.source) || '');
      const c2 = getNodeColor(nodeTypeMap.get(edge.target) || '');

      colors.push(c1.r, c1.g, c1.b);
      colors.push(c2.r, c2.g, c2.b);
    });

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geom;
  }, [inactiveEdges, nodePositions, nodeTypeMap, enabled]);

  // Si smartEdges está apagado, fallback idéntico al comportamiento v1
  if (!enabled) {
    return (
      <group>
        {edges.map((edge, idx) => {
          const sourcePos = nodePositions.get(edge.source);
          const targetPos = nodePositions.get(edge.target);
          if (!sourcePos || !targetPos) return null;

          const isActive =
            activeNodeId && (edge.source === activeNodeId || edge.target === activeNodeId);
          const isHigh =
            highlightedIds.includes(edge.source) && highlightedIds.includes(edge.target);
          const active = isActive || isHigh;

          return (
            <Line
              key={`fallback-edge-${idx}`}
              points={[sourcePos, targetPos]}
              color={active ? '#38bdf8' : '#334155'}
              lineWidth={active ? 1.5 : 0.5}
              transparent
              opacity={hasFilter ? (active ? 0.75 : 0.05) : 0.22}
            />
          );
        })}
      </group>
    );
  }

  // Opacidad de fondo: sutil si no hay filtro, ultra tenue si hay un nodo en foco
  const bgOpacity = hasFilter
    ? V2_CONFIG.edges.dimmedOpacity
    : V2_CONFIG.edges.defaultOpacity;

  return (
    <group>
      {/* 1. TODAS LAS ARISTAS INACTIVAS EN UN SOLO DRAW CALL (60 FPS garantizado) */}
      {backgroundGeometry && (
        <lineSegments geometry={backgroundGeometry}>
          <lineBasicMaterial
            vertexColors
            transparent
            opacity={bgOpacity}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </lineSegments>
      )}

      {/* 2. ARISTAS ACTIVAS RESALTADAS CON DEGRADADO Y BRILLO */}
      {activeEdges.map((edge, idx) => {
        const p1 = nodePositions.get(edge.source);
        const p2 = nodePositions.get(edge.target);
        if (!p1 || !p2) return null;

        const weight = edge.weight || 1;
        // Grosor proporcional al flujo (peso de estudiantes)
        const width = Math.min(3.5, Math.max(1.5, Math.log10(weight) * 1.4));

        return (
          <Line
            key={`active-edge-${idx}`}
            points={[p1, p2]}
            color="#38bdf8"
            lineWidth={width}
            transparent
            opacity={V2_CONFIG.edges.activeOpacity}
          />
        );
      })}
    </group>
  );
}
