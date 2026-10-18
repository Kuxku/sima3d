import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { V2_CONFIG } from '../config';

interface AutoFitCameraProps {
  nodePositions: Map<string, THREE.Vector3>;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  enabled: boolean;
  targetPos: THREE.Vector3 | null;
  fitTrigger: number;
}

/**
 * Calcula la distancia de cámara necesaria para que una esfera envolvente
 * de radio `radius` quepa perfectamente en el viewport según el FOV y Aspect Ratio.
 */
export function calculateFitDistance(
  radius: number,
  camera: THREE.PerspectiveCamera,
  paddingFactor = 1.25
): number {
  const vFov = (camera.fov * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  // Usar el ángulo menor para garantizar que nada se salga horizontal ni verticalmente
  const minFov = Math.min(vFov, hFov);
  const distance = (radius / Math.sin(minFov / 2)) * paddingFactor;
  return distance;
}

export function AutoFitCamera({
  nodePositions,
  controlsRef,
  enabled,
  targetPos,
  fitTrigger,
}: AutoFitCameraProps) {
  const { camera, size } = useThree();
  const isFitting = useRef(false);
  const desiredCamPos = useRef(new THREE.Vector3(0, 0, 38));
  const desiredTarget = useRef(new THREE.Vector3(0, 0, 0));

  // Función para calcular el encuadre óptimo
  const performFit = () => {
    if (!enabled || nodePositions.size === 0) {
      desiredCamPos.current.set(0, 0, V2_CONFIG.autoFit.defaultCameraZ);
      desiredTarget.current.set(0, 0, 0);
      isFitting.current = true;
      return;
    }

    // 1. Calcular centroide y radio envolvente (Bounding Sphere)
    let sumX = 0, sumY = 0, sumZ = 0;
    nodePositions.forEach((pos) => {
      sumX += pos.x;
      sumY += pos.y;
      sumZ += pos.z;
    });

    const center = new THREE.Vector3(
      sumX / nodePositions.size,
      sumY / nodePositions.size,
      sumZ / nodePositions.size
    );

    let maxDistSq = 0;
    nodePositions.forEach((pos) => {
      const dSq = pos.distanceToSquared(center);
      if (dSq > maxDistSq) maxDistSq = dSq;
    });

    // Añadir un margen para el tamaño del propio nodo más grande (aprox 1.8 unidades)
    const boundingRadius = Math.sqrt(maxDistSq) + 2.0;

    // 2. Calcular distancia de cámara
    const pCam = camera as THREE.PerspectiveCamera;
    const optimalDistance = Math.min(
      V2_CONFIG.autoFit.maxDistance,
      Math.max(
        V2_CONFIG.autoFit.minDistance,
        calculateFitDistance(boundingRadius, pCam, V2_CONFIG.autoFit.paddingFactor)
      )
    );

    desiredTarget.current.copy(center);
    desiredCamPos.current.set(center.x, center.y, center.z + optimalDistance);
    isFitting.current = true;
  };

  // Reencuadre al inicializar o al cambiar posiciones
  useEffect(() => {
    performFit();
  }, [nodePositions, enabled]);

  // Reencuadre manual vía botón o evento
  useEffect(() => {
    if (fitTrigger > 0) {
      performFit();
    }
  }, [fitTrigger]);

  // Reencuadre automático ante resize de ventana
  useEffect(() => {
    if (!targetPos && enabled) {
      performFit();
    }
  }, [size.width, size.height]);

  // Si hay un targetPos específico (selección de nodo o comando Copilot), pausar autoFit
  useEffect(() => {
    if (targetPos) {
      isFitting.current = false;
    }
  }, [targetPos]);

  // Animación suave hacia el encuadre óptimo
  useFrame((_, delta) => {
    if (!isFitting.current || !controlsRef.current || targetPos) return;

    const step = V2_CONFIG.autoFit.animationSpeed * delta;
    camera.position.lerp(desiredCamPos.current, step);
    controlsRef.current.target.lerp(desiredTarget.current, step);
    controlsRef.current.update();

    if (
      camera.position.distanceTo(desiredCamPos.current) < 0.1 &&
      controlsRef.current.target.distanceTo(desiredTarget.current) < 0.1
    ) {
      isFitting.current = false;
    }
  });

  return null;
}
