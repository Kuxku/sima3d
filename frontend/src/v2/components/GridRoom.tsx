import { useMemo } from 'react';
import * as THREE from 'three';

interface GridRoomProps {
  width?: number;
  height?: number;
  depth?: number;
  centerZ?: number;
  gridStep?: number;
  lineColor?: string;
  fadeColor?: string;
  opacity?: number;
}

/**
 * GridRoom: Renderiza una sala / túnel de rejilla en perspectiva tridimensional
 * idéntica a la imagen de referencia (piso, techo y paredes con líneas en fuga
 * hacia el horizonte oscuro).
 */
export function GridRoom({
  width = 96,
  height = 54,
  depth = 140,
  centerZ = -20,
  gridStep = 6,
  lineColor = '#64748b',
  fadeColor = '#090c14',
  opacity = 0.55,
}: GridRoomProps) {
  const { lineGeometry, boxBounds } = useMemo(() => {
    const halfW = width / 2;
    const halfH = height / 2;
    const zMin = centerZ - depth / 2;
    const zMax = centerZ + depth / 2;

    const positions: number[] = [];
    const colors: number[] = [];

    const colorNear = new THREE.Color(lineColor);
    const colorFar = new THREE.Color(fadeColor);

    const addSegment = (
      x1: number,
      y1: number,
      z1: number,
      x2: number,
      y2: number,
      z2: number
    ) => {
      positions.push(x1, y1, z1, x2, y2, z2);

      // Interpolación de color según profundidad Z para desvanecer hacia el fondo
      const t1 = Math.max(0, Math.min(1, (z1 - zMin) / (zMax - zMin)));
      const t2 = Math.max(0, Math.min(1, (z2 - zMin) / (zMax - zMin)));

      const c1 = colorFar.clone().lerp(colorNear, t1 * t1);
      const c2 = colorFar.clone().lerp(colorNear, t2 * t2);

      colors.push(c1.r, c1.g, c1.b, c2.r, c2.g, c2.b);
    };

    // 1. LÍNEAS LONGITUDINALES (En fuga hacia Z)
    // Piso (y = -halfH) y Techo (y = +halfH)
    for (let x = -halfW; x <= halfW + 0.01; x += gridStep) {
      addSegment(x, -halfH, zMin, x, -halfH, zMax);
      addSegment(x, halfH, zMin, x, halfH, zMax);
    }

    // Paredes izquierda (x = -halfW) y derecha (x = +halfW)
    for (let y = -halfH; y <= halfH + 0.01; y += gridStep) {
      addSegment(-halfW, y, zMin, -halfW, y, zMax);
      addSegment(halfW, y, zMin, halfW, y, zMax);
    }

    // 2. LÍNEAS TRANSVERSALES (Anillos de cuadrícula a lo largo de Z)
    for (let z = zMin; z <= zMax + 0.01; z += gridStep) {
      // Líneas horizontales en piso y techo
      addSegment(-halfW, -halfH, z, halfW, -halfH, z);
      addSegment(-halfW, halfH, z, halfW, halfH, z);

      // Líneas verticales en pared izquierda y derecha
      addSegment(-halfW, -halfH, z, -halfW, halfH, z);
      addSegment(halfW, -halfH, z, halfW, halfH, z);
    }

    // 3. FONDO OSCURO (Pared posterior en zMin con cuadrícula sutil)
    for (let x = -halfW; x <= halfW + 0.01; x += gridStep * 2) {
      addSegment(x, -halfH, zMin, x, halfH, zMin);
    }
    for (let y = -halfH; y <= halfH + 0.01; y += gridStep * 2) {
      addSegment(-halfW, y, zMin, halfW, y, zMin);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    return {
      lineGeometry: geometry,
      boxBounds: [width, height, depth] as [number, number, number],
    };
  }, [width, height, depth, centerZ, gridStep, lineColor, fadeColor]);

  return (
    <group position={[0, 0, 0]}>
      {/* Caja envolvente oscura que absorbe la luz y recrea el abismo de la imagen */}
      <mesh position={[0, 0, centerZ]}>
        <boxGeometry args={[boxBounds[0] + 0.5, boxBounds[1] + 0.5, boxBounds[2] + 0.5]} />
        <meshBasicMaterial color="#080a10" side={THREE.BackSide} />
      </mesh>

      {/* Estructura de líneas en perspectiva */}
      <lineSegments geometry={lineGeometry}>
        <lineBasicMaterial
          vertexColors
          transparent
          opacity={opacity}
          depthWrite={false}
        />
      </lineSegments>
    </group>
  );
}
