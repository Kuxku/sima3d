import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { GraphEdge } from '../../types/graph';

interface EdgeParticlesProps {
  activeEdges: GraphEdge[];
  nodePositions: Map<string, THREE.Vector3>;
  enabled: boolean;
}

const MAX_PARTICLES = 120;

export function EdgeParticles({
  activeEdges,
  nodePositions,
  enabled,
}: EdgeParticlesProps) {
  const pointsRef = useRef<THREE.Points | null>(null);

  // Validar aristas que tengan posiciones válidas
  const validEdges = useMemo(() => {
    return activeEdges.filter((e) => nodePositions.has(e.source) && nodePositions.has(e.target));
  }, [activeEdges, nodePositions]);

  // Buffers y estados de progreso (t de 0 a 1) para cada partícula
  const { particleData, geometry } = useMemo(() => {
    const numParticles = Math.min(MAX_PARTICLES, Math.max(1, validEdges.length * 4));
    const positions = new Float32Array(numParticles * 3);
    const progress = new Float32Array(numParticles);
    const speeds = new Float32Array(numParticles);
    const edgeIndices = new Int32Array(numParticles);

    for (let i = 0; i < numParticles; i++) {
      progress[i] = (i / numParticles); // Distribución escalonada para que no salgan todas al mismo tiempo
      speeds[i] = 0.25 + (i % 5) * 0.08;
      edgeIndices[i] = validEdges.length > 0 ? i % validEdges.length : 0;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    return {
      particleData: { progress, speeds, edgeIndices, numParticles },
      geometry: geom,
    };
  }, [validEdges]);

  // Limpieza de memoria al desmontar o cambiar
  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  // Animación a 60 FPS sin asignaciones de memoria
  useFrame((_, delta) => {
    if (!enabled || validEdges.length === 0 || !pointsRef.current) return;

    const posAttr = geometry.attributes.position as THREE.BufferAttribute;
    const array = posAttr.array as Float32Array;
    const { progress, speeds, edgeIndices, numParticles } = particleData;

    for (let i = 0; i < numParticles; i++) {
      const edge = validEdges[edgeIndices[i]];
      if (!edge) continue;

      const p1 = nodePositions.get(edge.source);
      const p2 = nodePositions.get(edge.target);
      if (!p1 || !p2) continue;

      // Incrementar progreso
      progress[i] += speeds[i] * delta;
      if (progress[i] > 1.0) {
        progress[i] = 0.0;
      }

      const t = progress[i];
      // Interpolación lineal directa sobre el Float32Array
      const idx = i * 3;
      array[idx] = p1.x + (p2.x - p1.x) * t;
      array[idx + 1] = p1.y + (p2.y - p1.y) * t;
      array[idx + 2] = p1.z + (p2.z - p1.z) * t;
    }

    posAttr.needsUpdate = true;
  });

  if (!enabled || validEdges.length === 0) return null;

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        color="#38bdf8"
        size={0.65}
        transparent
        opacity={0.9}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}
