import { useMemo } from 'react';
import * as THREE from 'three';

interface GridRoomProps {
  stageWidth?: number;
  stageDepth?: number;
  wallHeight?: number;
  floorY?: number;
  wallZ?: number;
  gridStep?: number;
  lineColor?: string;
  opacity?: number;
}

/**
 * GridRoom (Studio Infinity Grid Stage / Cyclorama):
 * Recrea con exactitud matemática el fondo de estudio virtual de la imagen de referencia:
 * 1. Piso horizontal con líneas en fuga hacia la profundidad Z.
 * 2. Pared vertical de fondo que nace exactamente donde termina el piso.
 * 3. Líneas de cuadrícula perfectamente alineadas en la juntura (seam) del horizonte.
 * 4. Espacio negro azabache puro con líneas blancas finas y limpias.
 */
export function GridRoom({
  stageWidth = 180,
  stageDepth = 110,
  wallHeight = 90,
  floorY = -22,
  wallZ = -45,
  gridStep = 6,
  lineColor = '#475569',
  opacity = 0.22,
}: GridRoomProps) {
  const { lineGeometry, floorBackdrop, wallBackdrop } = useMemo(() => {
    const halfW = stageWidth / 2;
    const zFront = wallZ + stageDepth; // Frente del piso (cerca de la cámara)
    const zBack = wallZ;              // Juntura horizonte con la pared
    const yFloor = floorY;
    const yTop = floorY + wallHeight; // Tope de la pared vertical

    const positions: number[] = [];
    const colors: number[] = [];

    const color = new THREE.Color(lineColor);

    const addSegment = (
      x1: number,
      y1: number,
      z1: number,
      x2: number,
      y2: number,
      z2: number,
      alphaFactor = 1.0
    ) => {
      positions.push(x1, y1, z1, x2, y2, z2);
      const c = color.clone().multiplyScalar(alphaFactor);
      colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
    };

    // ========================================================
    // 1. PISO HORIZONTAL (Desde zFront hacia zBack en yFloor)
    // ========================================================

    // Líneas longitudinales en Z (convergen hacia la pared)
    for (let x = -halfW; x <= halfW + 0.01; x += gridStep) {
      addSegment(x, yFloor, zFront, x, yFloor, zBack, 0.95);
    }

    // Líneas transversales en X a lo largo del piso
    for (let z = zBack; z <= zFront + 0.01; z += gridStep) {
      // Atenuación suave hacia el frente para no deslumbrar en cámara cercana
      const distRatio = Math.max(0.4, 1 - (z - zBack) / (zFront - zBack) * 0.45);
      addSegment(-halfW, yFloor, z, halfW, yFloor, z, distRatio);
    }

    // ========================================================
    // 2. PARED VERTICAL DE FONDO (Nace en yFloor en zBack hasta yTop)
    // ========================================================

    // Líneas verticales en Y (continúan exactamente las líneas del piso)
    for (let x = -halfW; x <= halfW + 0.01; x += gridStep) {
      addSegment(x, yFloor, zBack, x, yTop, zBack, 0.95);
    }

    // Líneas horizontales en X a lo largo de la pared vertical
    for (let y = yFloor; y <= yTop + 0.01; y += gridStep) {
      addSegment(-halfW, y, zBack, halfW, y, zBack, 0.9);
    }

    // ========================================================
    // 3. LÍNEA DE JUNTURA HORIZONTE (Destacada y precisa)
    // ========================================================
    addSegment(-halfW, yFloor, zBack, halfW, yFloor, zBack, 1.2);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    return {
      lineGeometry: geometry,
      floorBackdrop: {
        width: stageWidth + 2,
        depth: stageDepth + 2,
        position: [0, yFloor - 0.05, (zBack + zFront) / 2] as [number, number, number],
      },
      wallBackdrop: {
        width: stageWidth + 2,
        height: wallHeight + 2,
        position: [0, (yFloor + yTop) / 2, zBack - 0.05] as [number, number, number],
      },
    };
  }, [stageWidth, stageDepth, wallHeight, floorY, wallZ, gridStep, lineColor]);

  return (
    <group position={[0, 0, 0]}>
      {/* Fondo institucional sobrio para el piso */}
      <mesh
        position={floorBackdrop.position}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[floorBackdrop.width, floorBackdrop.depth]} />
        <meshBasicMaterial color="#0b0f19" depthWrite={false} />
      </mesh>

      {/* Fondo institucional sobrio para la pared vertical */}
      <mesh position={wallBackdrop.position}>
        <planeGeometry args={[wallBackdrop.width, wallBackdrop.height]} />
        <meshBasicMaterial color="#0b0f19" depthWrite={false} />
      </mesh>

      {/* Líneas de rejilla del estudio infinito */}
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
