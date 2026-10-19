import { useMemo, useRef, useState } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { GraphNode } from '../../types/graph';
import { V2_CONFIG } from '../config';

interface NodeLabelsProps {
  nodes: GraphNode[];
  nodePositions: Map<string, THREE.Vector3>;
  hoveredNode: GraphNode | null;
  selectedNode: GraphNode | null;
  enabled: boolean;
}

export function NodeLabels({
  nodes,
  nodePositions,
  hoveredNode,
  selectedNode,
  enabled,
}: NodeLabelsProps) {
  const { camera, size } = useThree();
  const [cameraDistances, setCameraDistances] = useState<Map<string, number>>(new Map());
  const lastUpdateRef = useRef(0);

  // Umbral configurable de volumen para etiquetas permanentes
  const threshold = V2_CONFIG.labels.permanentVolumeThreshold;
  const maxVisibleDist = V2_CONFIG.labels.maxVisibleDistance;

  // Filtrar nodos candidatos a etiqueta fija por volumen
  const candidateNodes = useMemo(() => {
    if (!enabled) return [];
    return nodes
      .filter((n) => (n.metrics?.volume || 0) >= threshold)
      .sort((a, b) => (b.metrics?.volume || 0) - (a.metrics?.volume || 0));
  }, [nodes, threshold, enabled]);

  // Actualizar distancias y filtrar colisiones en pantalla cada ~6 frames para rendimiento
  useFrame((state) => {
    if (!enabled) return;
    const now = state.clock.getElapsedTime();
    if (now - lastUpdateRef.current < 0.1) return; // ~10 Hz es ideal para opacidad suave
    lastUpdateRef.current = now;

    const distMap = new Map<string, number>();
    nodes.forEach((n) => {
      const pos = nodePositions.get(n.id);
      if (pos) {
        distMap.set(n.id, state.camera.position.distanceTo(pos));
      }
    });
    setCameraDistances(distMap);
  });

  // Anti-colisión en pantalla 2D para etiquetas permanentes
  const visiblePermanentNodes = useMemo(() => {
    if (!enabled || candidateNodes.length === 0) return [];

    const projectedPoints: { id: string; x: number; y: number; node: GraphNode }[] = [];
    const minPixelDistance = 55; // Distancia mínima en píxeles para evitar colisión

    const accepted: GraphNode[] = [];

    candidateNodes.forEach((node) => {
      const pos = nodePositions.get(node.id);
      if (!pos) return;

      const pDist = cameraDistances.get(node.id) || 30;
      if (pDist > maxVisibleDist) return; // Fuera del rango de visibilidad

      // Proyectar a coordenadas de pantalla normalizadas (-1 a 1) y luego a píxeles
      const tempVec = pos.clone().project(camera);
      // Solo si está delante de la cámara
      if (tempVec.z > 1.0) return;

      const screenX = ((tempVec.x + 1) * size.width) / 2;
      const screenY = ((-tempVec.y + 1) * size.height) / 2;

      // Verificar si colisiona con alguna etiqueta de mayor prioridad ya aceptada
      const collides = projectedPoints.some((pt) => {
        const dx = pt.x - screenX;
        const dy = pt.y - screenY;
        return Math.sqrt(dx * dx + dy * dy) < minPixelDistance;
      });

      if (!collides) {
        projectedPoints.push({ id: node.id, x: screenX, y: screenY, node });
        accepted.push(node);
      }
    });

    return accepted;
  }, [candidateNodes, nodePositions, cameraDistances, camera, size, maxVisibleDist, enabled]);

  if (!enabled) return null;

  // Nodo activo en foco para el tooltip enriquecido
  const activeFocusNode = hoveredNode || selectedNode || null;
  const activePos = activeFocusNode ? nodePositions.get(activeFocusNode.id) : null;

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
    <group>
      {/* 1. ETIQUETAS PERMANENTES DISCRETAS CON DESVANECIMIENTO POR DISTANCIA */}
      {visiblePermanentNodes.map((node) => {
        // No mostrar la etiqueta fija si este nodo ya tiene el tooltip de hover/selección encima
        if (activeFocusNode?.id === node.id) return null;

        const pos = nodePositions.get(node.id);
        if (!pos) return null;

        const dist = cameraDistances.get(node.id) || 30;
        // Opacidad decae cuando la distancia se acerca a maxVisibleDist
        const fadeRatio = Math.max(0, Math.min(1, 1 - (dist - 25) / (maxVisibleDist - 25)));
        if (fadeRatio <= 0.05) return null;

        const color = getColor(node.type);

        return (
          <Html
            key={`perm-lbl-${node.id}`}
            position={[pos.x, pos.y + 0.9, pos.z]}
            center
            distanceFactor={22}
            zIndexRange={[50, 0]}
          >
            <div
              className="v2-permanent-label"
              style={{
                opacity: fadeRatio,
                borderColor: `${color}44`,
              }}
            >
              <span className="v2-label-indicator" style={{ backgroundColor: color }} />
              <span className="v2-label-text">{node.label}</span>
            </div>
          </Html>
        );
      })}

      {/* 2. TOOLTIP ENRIQUECIDO EN HOVER O SELECCIÓN */}
      {activeFocusNode && activePos && (
        <Html
          position={[activePos.x, activePos.y + 1.2, activePos.z]}
          center
          distanceFactor={18}
          zIndexRange={[100, 10]}
        >
          <div className="v2-rich-tooltip">
            <div className="v2-tooltip-header">
              <span
                className="v2-tooltip-badge"
                style={{ backgroundColor: getColor(activeFocusNode.type) }}
              >
                {activeFocusNode.type.toUpperCase()}
              </span>
              <span className="v2-tooltip-title">{activeFocusNode.label}</span>
            </div>

            <div className="v2-tooltip-body">
              <div className="v2-tooltip-row">
                <span className="v2-tooltip-lbl">Estudiantes:</span>
                <span className="v2-tooltip-val">
                  {activeFocusNode.metrics.volume.toLocaleString()}
                </span>
              </div>

              {activeFocusNode.metrics.estrato_median !== undefined &&
                activeFocusNode.metrics.estrato_median !== null && (
                  <div className="v2-tooltip-row">
                    <span className="v2-tooltip-lbl">Estrato Mediano:</span>
                    <span className="v2-tooltip-val">
                      Estrato {activeFocusNode.metrics.estrato_median}
                    </span>
                  </div>
                )}

              {activeFocusNode.metrics.rural_share !== undefined && (
                <div className="v2-tooltip-row">
                  <span className="v2-tooltip-lbl">Pob. Rural:</span>
                  <span className="v2-tooltip-val">
                    {((activeFocusNode.metrics.rural_share || 0) * 100).toFixed(1)}%
                  </span>
                </div>
              )}

              {activeFocusNode.metrics.degree !== undefined && (
                <div className="v2-tooltip-row">
                  <span className="v2-tooltip-lbl">Conexiones:</span>
                  <span className="v2-tooltip-val">{activeFocusNode.metrics.degree}</span>
                </div>
              )}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}
