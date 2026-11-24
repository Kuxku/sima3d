import { useMemo, useState, useEffect, memo } from 'react';
import type { GraphPayload, GraphNode } from '../types/graph';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

interface NetworkGraphProps {
  data: GraphPayload;
  nodePositions: Map<string, THREE.Vector3>;
  selectedNode: GraphNode | null;
  highlightedIds: string[];
  onSelectNode: (node: GraphNode | null) => void;
}

const TYPE_COLORS: Record<string, string> = {
  comuna: '#38bdf8',   // Azul cian brillante
  colegio: '#34d399',  // Verde neón esmeralda
  facultad: '#fbbf24', // Ámbar dorado
  default: '#ffffff',
};

function getNodeColor(type: string): string {
  return TYPE_COLORS[type] || TYPE_COLORS.default;
}

export const NetworkGraph = memo(function NetworkGraph({
  data,
  nodePositions,
  selectedNode,
  highlightedIds,
  onSelectNode,
}: NetworkGraphProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const nodes = useMemo(() => data.nodes || [], [data]);
  const edges = useMemo(() => data.edges || [], [data]);

  const hasActiveFilter = selectedNode !== null || highlightedIds.length > 0;

  // Nodos conectados directamente al nodo seleccionado
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

  // 1. GEOMETRÍAS COMPARTIDAS (Instanciación única en memoria GPU)
  const sharedSphereGeometry = useMemo(() => new THREE.SphereGeometry(1, 24, 24), []);
  const sharedRingGeometry = useMemo(() => new THREE.RingGeometry(1.35, 1.48, 32), []);

  useEffect(() => {
    return () => {
      sharedSphereGeometry.dispose();
      sharedRingGeometry.dispose();
    };
  }, [sharedSphereGeometry, sharedRingGeometry]);

  // 2. ARISTAS: BUFFER ÚNICO DE ALTO RENDIMIENTO (1 o 2 draw calls en lugar de 380 componentes <Line>)
  const { bgGeometry, activeGeometry } = useMemo(() => {
    const bgPos: number[] = [];
    const actPos: number[] = [];

    edges.forEach((edge) => {
      const sourcePos = nodePositions.get(edge.source);
      const targetPos = nodePositions.get(edge.target);
      if (!sourcePos || !targetPos) return;

      const isConnectedToSelected =
        selectedNode &&
        (edge.source === selectedNode.id || edge.target === selectedNode.id);
      const isHighlightedEdge =
        highlightedIds.includes(edge.source) && highlightedIds.includes(edge.target);

      const isActive = isConnectedToSelected || isHighlightedEdge;

      if (isActive) {
        actPos.push(sourcePos.x, sourcePos.y, sourcePos.z);
        actPos.push(targetPos.x, targetPos.y, targetPos.z);
      } else {
        bgPos.push(sourcePos.x, sourcePos.y, sourcePos.z);
        bgPos.push(targetPos.x, targetPos.y, targetPos.z);
      }
    });

    const bgGeom = new THREE.BufferGeometry();
    bgGeom.setAttribute('position', new THREE.Float32BufferAttribute(bgPos, 3));

    let actGeom: THREE.BufferGeometry | null = null;
    if (actPos.length > 0) {
      actGeom = new THREE.BufferGeometry();
      actGeom.setAttribute('position', new THREE.Float32BufferAttribute(actPos, 3));
    }

    return { bgGeometry: bgGeom, activeGeometry: actGeom };
  }, [edges, nodePositions, selectedNode, highlightedIds]);

  // Liberar buffers de aristas al actualizar
  useEffect(() => {
    return () => {
      bgGeometry.dispose();
      activeGeometry?.dispose();
    };
  }, [bgGeometry, activeGeometry]);

  return (
    <group
      onPointerMissed={() => {
        onSelectNode(null);
      }}
    >
      {/* Aristas en segundo plano (1 draw call) */}
      <lineSegments geometry={bgGeometry}>
        <lineBasicMaterial
          color={hasActiveFilter ? '#1e293b' : '#334155'}
          transparent
          opacity={hasActiveFilter ? 0.08 : 0.22}
          depthWrite={false}
        />
      </lineSegments>

      {/* Aristas activas/resaltadas (1 draw call) */}
      {activeGeometry && (
        <lineSegments geometry={activeGeometry}>
          <lineBasicMaterial
            color="#38bdf8"
            transparent
            opacity={0.85}
            depthWrite={false}
          />
        </lineSegments>
      )}

      {/* NODOS (Geometría reutilizada sin re-alocación de buffers en GPU) */}
      {nodes.map((node) => {
        const volume = node.metrics?.volume || 1;
        const baseScale = Math.max(0.2, Math.min(Math.log10(volume) * 0.24, 0.85));
        const pos = nodePositions.get(node.id);
        if (!pos) return null;

        const color = getNodeColor(node.type);
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
              geometry={sharedSphereGeometry}
              scale={[activeScale, activeScale, activeScale]}
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

            {/* Anillo orbital para nodos seleccionados o destacados */}
            {(isSelected || isHighlighted) && (
              <mesh
                geometry={sharedRingGeometry}
                scale={[activeScale, activeScale, 1]}
                rotation={[Math.PI / 2, 0, 0]}
              >
                <meshBasicMaterial
                  color={color}
                  side={THREE.DoubleSide}
                  transparent
                  opacity={0.85}
                  depthWrite={false}
                />
              </mesh>
            )}

            {/* Etiqueta flotante bajo demanda */}
            {showLabel && (
              <Html
                distanceFactor={18}
                position={[0, activeScale + 0.45, 0]}
                center
                zIndexRange={[100, 0]}
              >
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
});
