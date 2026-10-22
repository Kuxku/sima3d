import * as THREE from 'three';
import type { GraphNode, GraphEdge } from '../../types/graph';
import { V2_CONFIG } from '../config';

/**
 * Algoritmo original de la versión estable (v1) para fallback idéntico cuando improvedLayout = false.
 */
export function computeOriginalPositions(nodes: GraphNode[]): Map<string, THREE.Vector3> {
  const positions = new Map<string, THREE.Vector3>();
  if (!nodes || nodes.length === 0) return positions;

  const GRAPH_SCALE = 0.35;
  const MAX_ORBIT = 25;

  let sumX = 0, sumY = 0, sumZ = 0;
  nodes.forEach((n) => {
    sumX += (n.position?.x || 0) * GRAPH_SCALE;
    sumY += (n.position?.y || 0) * GRAPH_SCALE;
    sumZ += (n.position?.z || 0) * GRAPH_SCALE;
  });
  const rawCentroid = new THREE.Vector3(
    sumX / nodes.length,
    sumY / nodes.length,
    sumZ / nodes.length
  );

  nodes.forEach((n) => {
    const x = (n.position?.x || 0) * GRAPH_SCALE - rawCentroid.x;
    const y = (n.position?.y || 0) * GRAPH_SCALE - rawCentroid.y;
    const z = (n.position?.z || 0) * GRAPH_SCALE - rawCentroid.z;

    const vec = new THREE.Vector3(x, y, z);
    const dist = vec.length();

    if (dist > MAX_ORBIT) {
      vec.normalize().multiplyScalar(MAX_ORBIT + Math.log10(dist - MAX_ORBIT + 1) * 2);
    }
    positions.set(n.id, vec);
  });

  let finalSumX = 0, finalSumY = 0, finalSumZ = 0;
  positions.forEach((pos) => {
    finalSumX += pos.x;
    finalSumY += pos.y;
    finalSumZ += pos.z;
  });
  const finalCentroid = new THREE.Vector3(
    finalSumX / positions.size,
    finalSumY / positions.size,
    finalSumZ / positions.size
  );

  positions.forEach((pos, id) => {
    positions.set(id, pos.sub(finalCentroid));
  });

  return positions;
}

/**
 * Generador pseudoaleatorio determinista (LCG) para evitar Math.random() no determinista.
 */
function createDeterministicRandom(seed = 12345) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/**
 * Mejora 1: Layout Jerárquico y Legible para SIMA-3D v2.
 * - Facultades como hubs exteriores visibles y separados en 3D.
 * - Colegios orbitando la facultad a la que más estudiantes envían.
 * - Comunas ubicadas estratégicamente cerca de sus colegios principales.
 * - Pasadas síncronas de repulsión y colisión según radio del nodo para evitar empalmes.
 */
export function computeHierarchicalPositions(
  nodes: GraphNode[],
  edges: GraphEdge[]
): Map<string, THREE.Vector3> {
  if (!V2_CONFIG.flags.improvedLayout) {
    return computeOriginalPositions(nodes);
  }

  const positions = new Map<string, THREE.Vector3>();
  if (!nodes || nodes.length === 0) return positions;

  const { layout } = V2_CONFIG;
  const rand = createDeterministicRandom(42);

  // 1. Clasificar nodos por tipo
  const facultades = nodes.filter((n) => n.type === 'facultad');
  const colegios = nodes.filter((n) => n.type === 'colegio');
  const comunas = nodes.filter((n) => n.type === 'comuna');

  // Mapa de adyacencia y pesos
  const edgeWeights = new Map<string, Map<string, number>>();
  const addWeight = (from: string, to: string, w: number) => {
    if (!edgeWeights.has(from)) edgeWeights.set(from, new Map());
    if (!edgeWeights.has(to)) edgeWeights.set(to, new Map());
    edgeWeights.get(from)!.set(to, (edgeWeights.get(from)!.get(to) || 0) + w);
    edgeWeights.get(to)!.set(from, (edgeWeights.get(to)!.get(from) || 0) + w);
  };

  edges.forEach((e) => {
    addWeight(e.source, e.target, e.weight || 1);
  });

  // 2. Colocar FACULTADES como HUBS principales espaciados en anillo elipsoide 3D
  const numFacultades = Math.max(facultades.length, 1);
  facultades.forEach((fac, idx) => {
    const angle = (idx / numFacultades) * Math.PI * 2;
    // Elevación alterna para distribuir en verdadero volumen 3D
    const height = Math.sin(idx * 1.5) * layout.facultadHeightRange;
    const x = Math.cos(angle) * layout.facultadRadius;
    const y = height;
    const z = Math.sin(angle) * layout.facultadRadius;
    positions.set(fac.id, new THREE.Vector3(x, y, z));
  });

  // 3. Colocar COLEGIOS orbitando su Facultad de mayor afinidad
  const facultadColegiosCount = new Map<string, number>();

  colegios.forEach((col) => {
    const neighbors = edgeWeights.get(col.id);
    let bestFacultadId: string | null = null;
    let maxWeight = -1;

    if (neighbors) {
      neighbors.forEach((weight, neighborId) => {
        const neighborNode = nodes.find((n) => n.id === neighborId);
        if (neighborNode?.type === 'facultad' && weight > maxWeight) {
          maxWeight = weight;
          bestFacultadId = neighborId;
        }
      });
    }

    // Si no tiene enlace a facultad directo, asignar a una facultad por turno
    if (!bestFacultadId && facultades.length > 0) {
      const fallbackIdx = Math.floor(rand() * facultades.length);
      bestFacultadId = facultades[fallbackIdx].id;
    }

    const parentPos = bestFacultadId
      ? positions.get(bestFacultadId)
      : new THREE.Vector3(0, 0, 0);

    const orbitCount = facultadColegiosCount.get(bestFacultadId || '') || 0;
    facultadColegiosCount.set(bestFacultadId || '', orbitCount + 1);

    // Ángulo de órbita alrededor de la facultad
    const orbitAngle = (orbitCount * 137.5 * Math.PI) / 180; // Proporción áurea
    const radius = layout.colegioOrbitRadius + (rand() - 0.5) * layout.colegioOrbitJitter;
    const colElevation = (rand() - 0.5) * 6;

    // Vector dirección hacia el centro del grafo para que los colegios queden hacia adentro
    const towardCenter = parentPos ? parentPos.clone().negate().normalize() : new THREE.Vector3(0, 0, 1);
    const ortho = new THREE.Vector3(-towardCenter.z, 0, towardCenter.x).normalize();

    const colPos = (parentPos ? parentPos.clone() : new THREE.Vector3())
      .addScaledVector(towardCenter, Math.cos(orbitAngle) * radius)
      .addScaledVector(ortho, Math.sin(orbitAngle) * radius);
    colPos.y += colElevation;

    positions.set(col.id, colPos);
  });

  // 4. Colocar COMUNAS: se ubican en una esfera intermedia conectada a sus colegios principales
  comunas.forEach((com, idx) => {
    const neighbors = edgeWeights.get(com.id);
    let avgTarget = new THREE.Vector3(0, 0, 0);
    let totalWeight = 0;

    if (neighbors) {
      neighbors.forEach((weight, targetId) => {
        const targetPos = positions.get(targetId);
        if (targetPos) {
          avgTarget.addScaledVector(targetPos, weight);
          totalWeight += weight;
        }
      });
    }

    if (totalWeight > 0) {
      avgTarget.divideScalar(totalWeight);
      // Desplazar la comuna hacia un radio medio controlado
      const dir = avgTarget.lengthSq() > 0.001 ? avgTarget.clone().normalize() : new THREE.Vector3(1, 0, 0);
      const comPos = dir.multiplyScalar(layout.comunaDistance);
      // Elevación única para dispersar en Y
      comPos.y += Math.sin(idx * 2) * 5;
      positions.set(com.id, comPos);
    } else {
      // Si la comuna está aislada, se sitúa en un anillo intermedio
      const angle = (idx / Math.max(comunas.length, 1)) * Math.PI * 2;
      const x = Math.cos(angle) * layout.comunaDistance;
      const z = Math.sin(angle) * layout.comunaDistance;
      positions.set(com.id, new THREE.Vector3(x, (rand() - 0.5) * 8, z));
    }
  });

  // 5. Cálculo de masas e inercias físicas basadas en el volumen de estudiantes
  const nodeMasses = new Map<string, number>();
  const nodeRadii = new Map<string, number>();

  nodes.forEach((n) => {
    const vol = n.metrics?.volume || 1;
    // Masa física gravitacional: las facultades son anclas pesadas, los colegios orbitan
    let mass = 3.0 + Math.log10(vol + 1) * 2.0;
    if (n.type === 'facultad') mass = 12.0 + Math.sqrt(vol) * 0.08;
    else if (n.type === 'comuna') mass = 7.0 + Math.log10(vol + 1);

    nodeMasses.set(n.id, mass);

    // Radio volumétrico de colisión
    const r = Math.max(0.38, Math.min(Math.sqrt(vol) * 0.045, 1.45));
    nodeRadii.set(n.id, r);
  });

  // 6. SIMULACIÓN FÍSICA AVANZADA (VELOCITY VERLET CON AMORTIGUAMIENTO Y FUERZAS DE MASA)
  const nodeIds = nodes.map((n) => n.id);
  const iterations = Math.max(layout.repulsionIterations, 75);
  const baseDt = 0.42;
  const damping = 0.76; // Coeficiente de fricción viscosa

  // Vectores de velocidad e inercia por nodo
  const velocities = new Map<string, THREE.Vector3>();
  nodeIds.forEach((id) => velocities.set(id, new THREE.Vector3(0, 0, 0)));

  for (let iter = 0; iter < iterations; iter++) {
    // Factor de enfriamiento simulado (Simulated Annealing)
    const anneal = Math.pow(1 - iter / iterations, 1.3);
    const dt = baseDt * anneal;
    if (dt < 0.001) break;

    // Acumulador de fuerzas por nodo en este paso de tiempo
    const forces = new Map<string, THREE.Vector3>();
    nodeIds.forEach((id) => forces.set(id, new THREE.Vector3(0, 0, 0)));

    // 6a. FUERZA DE RESORTES PONDERADOS (Hooke's Law con Rigidez Logarítmica)
    edges.forEach((edge) => {
      const posSource = positions.get(edge.source);
      const posTarget = positions.get(edge.target);
      const fSource = forces.get(edge.source);
      const fTarget = forces.get(edge.target);
      if (!posSource || !posTarget || !fSource || !fTarget) return;

      const diff = posTarget.clone().sub(posSource);
      const dist = diff.length();
      if (dist < 0.001) return;

      const weight = edge.weight || 1;
      // Longitud natural de reposo: flujos mayores atraen a distancias más compactas
      const restLength = Math.max(4.8, 10.5 - Math.log10(weight + 1) * 1.6);
      const displacement = dist - restLength;
      // Rigidez del resorte elástico proporcional a la raíz del flujo de estudiantes
      const stiffness = Math.min(0.08, 0.015 + Math.sqrt(weight) * 0.0035);
      const springForce = diff.normalize().multiplyScalar(displacement * stiffness);

      fSource.add(springForce);
      fTarget.sub(springForce);
    });

    // 6b. REPULSIÓN MULTI-CUERPO COULOMBIANA Y FUERZA DE CONTACTO
    for (let i = 0; i < nodeIds.length; i++) {
      const idA = nodeIds[i];
      const posA = positions.get(idA);
      const fA = forces.get(idA);
      const rA = nodeRadii.get(idA) || 0.5;
      const mA = nodeMasses.get(idA) || 3.0;
      if (!posA || !fA) continue;

      for (let j = i + 1; j < nodeIds.length; j++) {
        const idB = nodeIds[j];
        const posB = positions.get(idB);
        const fB = forces.get(idB);
        const rB = nodeRadii.get(idB) || 0.5;
        const mB = nodeMasses.get(idB) || 3.0;
        if (!posB || !fB) continue;

        const diff = posA.clone().sub(posB);
        let dist = diff.length();
        const minDist = rA + rB + layout.collisionPadding;

        if (dist < 0.0001) {
          diff.set((rand() - 0.5) * 0.1, (rand() - 0.5) * 0.1, (rand() - 0.5) * 0.1);
          dist = diff.length();
        }

        const normal = diff.normalize();

        // Si hay colisión/solapamiento físico: fuerza elástica restauradora inmediata
        if (dist < minDist) {
          const overlap = minDist - dist;
          const repulsionMag = overlap * 4.5;
          fA.addScaledVector(normal, repulsionMag);
          fB.addScaledVector(normal, -repulsionMag);
        } else if (dist < minDist * 2.8) {
          // Repulsión de Coulomb cuadrática atenuada por masa
          const coulomb = (minDist * 2.8 - dist) / (minDist * 2.8);
          const repulsionMag = Math.min(1.2, (coulomb * coulomb * (mA + mB) * 0.18) / (dist * 0.5 + 1.0));
          fA.addScaledVector(normal, repulsionMag);
          fB.addScaledVector(normal, -repulsionMag);
        }
      }

      // Fuerza central armónica de confinamiento suave (evita dispersión infinita)
      const distFromOrigin = posA.length();
      if (distFromOrigin > 15.0) {
        const centerForce = posA.clone().normalize().multiplyScalar(-(distFromOrigin - 15.0) * 0.08);
        fA.add(centerForce);
      }
    }

    // 6c. INTEGRACIÓN VELOCITY VERLET CON INERCIA DE MASA (Newton F = m*a)
    nodeIds.forEach((id) => {
      const pos = positions.get(id);
      const vel = velocities.get(id);
      const force = forces.get(id);
      const mass = nodeMasses.get(id) || 3.0;
      if (!pos || !vel || !force) return;

      // a = F / m
      const accel = force.divideScalar(mass);

      // v = (v + a * dt) * gamma
      vel.addScaledVector(accel, dt).multiplyScalar(damping);

      // x = x + v * dt
      pos.addScaledVector(vel, dt);

      // Restricción al radio envolvente máximo
      const currentDist = pos.length();
      if (currentDist > layout.maxBoundingRadius) {
        pos.normalize().multiplyScalar(layout.maxBoundingRadius);
        vel.multiplyScalar(0.2); // Fricción en el borde
      }
    });
  }

  // 7. Centrado perfecto del grafo completo
  let sumX = 0, sumY = 0, sumZ = 0;
  positions.forEach((pos) => {
    sumX += pos.x;
    sumY += pos.y;
    sumZ += pos.z;
  });
  const centroid = new THREE.Vector3(
    sumX / positions.size,
    sumY / positions.size,
    sumZ / positions.size
  );

  positions.forEach((pos, id) => {
    positions.set(id, pos.sub(centroid));
  });

  return positions;
}
