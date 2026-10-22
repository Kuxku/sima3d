import { useMemo, useState, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { GraphPayload, GraphNode } from '../../types/graph';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { V2_CONFIG } from '../config';
import { SmartEdges } from './SmartEdges';
import { EdgeParticles } from './EdgeParticles';
import { NodeLabels } from './NodeLabels';
import { FeatureBoundary } from './FeatureBoundary';

interface NetworkGraphV2Props {
  data: GraphPayload;
  nodePositions: Map<string, THREE.Vector3>;
  selectedNode: GraphNode | null;
  highlightedIds: string[];
  onSelectNode: (node: GraphNode | null) => void;
  onHoverNode?: (node: GraphNode | null) => void;
  smartEdgesEnabled: boolean;
  particlesEnabled: boolean;
  labelsEnabled: boolean;
  depthStyleEnabled: boolean;
  filterType?: string | null;
}

export function NetworkGraphV2({
  data,
  nodePositions,
  selectedNode,
  highlightedIds,
  onSelectNode,
  onHoverNode,
  smartEdgesEnabled,
  particlesEnabled,
  labelsEnabled,
  depthStyleEnabled,
  filterType = null,
}: NetworkGraphV2Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const nodes = useMemo(() => data.nodes || [], [data]);
  const edges = useMemo(() => data.edges || [], [data]);

  // El nodo activo es el seleccionado, o el que tiene hover si no hay ninguno seleccionado
  const activeNodeId = selectedNode?.id || hoveredId || null;
  const hasActiveFilter = activeNodeId !== null || highlightedIds.length > 0 || filterType !== null;

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

      {/* 3. ETIQUETAS PERMANENTES Y TOOLTIPS ENRIQUECIDOS (Mejora 4) */}
      <FeatureBoundary featureName="NodeLabels">
        <NodeLabels
          nodes={nodes}
          nodePositions={nodePositions}
          hoveredNode={nodes.find((n) => n.id === hoveredId) || null}
          selectedNode={selectedNode}
          enabled={labelsEnabled}
        />
      </FeatureBoundary>

      {/* 4. NODOS INTERACTIVOS */}
      {nodes.map((node) => {
        const volume = node.metrics?.volume || 1;

        // Mejora 5: Escala proporcional a sqrt(estudiantes) si depthStyle está activo
        const baseScale = depthStyleEnabled
          ? Math.max(
              V2_CONFIG.depth.minScale,
              Math.min(Math.sqrt(volume) * V2_CONFIG.depth.sqrtFactor, V2_CONFIG.depth.maxScale)
            )
          : Math.max(0.2, Math.min(Math.log10(volume) * 0.24, 0.85));

        const pos = nodePositions.get(node.id);
        if (!pos) return null;

        const color = getColor(node.type);
        const isSelected = selectedNode?.id === node.id;
        const isHovered = hoveredId === node.id;
        const isHighlighted = highlightedIds.includes(node.id);
        const isNeighbor = connectedIds.has(node.id);
        const matchesType = filterType === null || node.type === filterType;

        // Tamaño estable sin saltos de zoom in/out en hover
        const activeScale = isSelected ? baseScale * 1.12 : baseScale;

        // Bloom selectivo: boost solo en nodos en foco o activos
        const emissiveIntensity =
          isSelected || isHovered
            ? 2.3
            : isHighlighted
              ? 1.7
              : hasActiveFilter
                ? matchesType && (isNeighbor || filterType !== null)
                  ? 0.85
                  : 0.04
                : 0.55;

        // Translucidez sutil para orbes de cristal espacial
        const baseOpacity = depthStyleEnabled ? V2_CONFIG.depth.translucentOpacity : 0.95;
        const nodeOpacity = hasActiveFilter
          ? matchesType && (isNeighbor || filterType !== null)
            ? 1.0
            : 0.12
          : baseOpacity;

        // Solo mostrar etiqueta básica si labels está apagado
        const showFallbackLabel = !labelsEnabled && (isSelected || isHovered || isHighlighted);

        return (
          <NodeMeshWithPhysics
            key={node.id}
            node={node}
            pos={pos}
            activeScale={activeScale}
            color={color}
            emissiveIntensity={emissiveIntensity}
            nodeOpacity={nodeOpacity}
            isSelected={isSelected}
            isHovered={isHovered}
            isHighlighted={isHighlighted}
            showFallbackLabel={showFallbackLabel}
            onSelectNode={onSelectNode}
            setHoveredId={setHoveredId}
            onHoverNode={onHoverNode}
          />
        );
      })}
    </group>
  );
}

/**
 * Componente individual de nodo con micro-física armónica de levitación Zero-G,
 * respuesta táctil elástica al pasar el cursor y etiquetas didácticas amigables.
 */
function NodeMeshWithPhysics({
  node,
  pos,
  activeScale,
  color,
  emissiveIntensity,
  nodeOpacity,
  isSelected,
  isHovered,
  isHighlighted,
  showFallbackLabel,
  onSelectNode,
  setHoveredId,
  onHoverNode,
}: {
  node: GraphNode;
  pos: THREE.Vector3;
  activeScale: number;
  color: string;
  emissiveIntensity: number;
  nodeOpacity: number;
  isSelected: boolean;
  isHovered: boolean;
  isHighlighted: boolean;
  showFallbackLabel: boolean;
  onSelectNode: (node: GraphNode) => void;
  setHoveredId: (id: string | null) => void;
  onHoverNode?: (node: GraphNode | null) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);

  // Hash determinista para desfase armónico único por nodo
  const phase = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < node.id.length; i++) hash += node.id.charCodeAt(i) * 19;
    return (hash % 1000) * 0.01;
  }, [node.id]);

  // Micro-física armónica continua: flotación ingrávida suave y respuesta al hover
  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.getElapsedTime();
    // Oscilación vertical suave (amplitud de 0.12 unidades a 1.2 rad/s)
    const floatY = Math.sin(t * 1.2 + phase) * 0.12;
    // Elevación suave e intuitiva al pasar el cursor o enfocar
    const hoverOffset = isSelected ? 0.35 : isHovered ? 0.22 : 0;

    groupRef.current.position.y = THREE.MathUtils.lerp(
      groupRef.current.position.y,
      pos.y + floatY + hoverOffset,
      0.1
    );
  });

  return (
    <group ref={groupRef} position={[pos.x, pos.y, pos.z]}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onSelectNode(node);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHoveredId(node.id);
          onHoverNode?.(node);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHoveredId(null);
          onHoverNode?.(null);
          document.body.style.cursor = 'auto';
        }}
      >
        <sphereGeometry args={[activeScale, 32, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emissiveIntensity}
          roughness={0.72}
          metalness={0.06}
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

      {showFallbackLabel && (
        <Html distanceFactor={18} position={[0, activeScale + 0.45, 0]} center zIndexRange={[100, 0]}>
          <div className="node-tooltip">
            <span className="node-tooltip-title">{node.label}</span>
            <span className="node-tooltip-metric">
              {node.metrics.volume.toLocaleString()} estudiantes · {node.type.toUpperCase()}
            </span>
          </div>
        </Html>
      )}
    </group>
  );
}
