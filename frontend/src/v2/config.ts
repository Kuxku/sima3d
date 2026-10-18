export interface FeatureFlags {
  improvedLayout: boolean; // Mejora 1
  autoFit: boolean;        // Mejora 2
  smartEdges: boolean;     // Mejora 3
  particles: boolean;      // Mejora 3 (opcional)
  labels: boolean;         // Mejora 4
  depthStyle: boolean;     // Mejora 5
  uiPolish: boolean;       // Mejora 6
}

export const V2_CONFIG = {
  flags: {
    improvedLayout: true,  // Habilitado
    autoFit: true,         // Mejora 2: Habilitado
    smartEdges: false,
    particles: false,
    labels: false,
    depthStyle: false,
    uiPolish: false,
  } as FeatureFlags,

  // Parámetros de auto-encuadre y centrado (Mejora 2)
  autoFit: {
    paddingFactor: 1.28,      // Margen de seguridad para que ningún nodo quede al ras del borde
    animationSpeed: 4.0,      // Velocidad del lerp de transición
    defaultCameraZ: 38.0,     // Fallback si no hay nodos
    minDistance: 15.0,
    maxDistance: 120.0,
  },

  // Parámetros expuestos para el Layout (Mejora 1)
  layout: {
    // Escala global del espacio
    scale: 1.0,
    // Radio de distribución de Facultades (Hubs exteriores)
    facultadRadius: 24.0,
    // Separación vertical (Z) entre facultades para crear volumen 3D
    facultadHeightRange: 8.0,
    // Distancia media de colegios respecto a su facultad principal
    colegioOrbitRadius: 7.5,
    colegioOrbitJitter: 2.5,
    // Distancia de comunas respecto a su centro de gravedad
    comunaDistance: 13.0,
    // Fuerza de repulsión y colisión (simulación síncrona offline en useMemo)
    repulsionIterations: 60,
    repulsionStrength: 0.85,
    collisionPadding: 0.6,
    // Límite de radio para evitar nodos disparados
    maxBoundingRadius: 36.0,
  },

  // Parámetros de aristas (Preparados para Mejora 3)
  edges: {
    defaultOpacity: 0.12,
    activeOpacity: 0.85,
    dimmedOpacity: 0.03,
    defaultWidth: 0.5,
    activeWidth: 2.0,
  },

  // Parámetros de etiquetas (Preparados para Mejora 4)
  labels: {
    permanentVolumeThreshold: 1500, // Volumen mínimo para etiqueta fija
    maxVisibleDistance: 45,
  },

  // Estilos de profundidad y paleta accesible (Preparados para Mejora 5)
  colors: {
    // Paleta optimizada para contraste y daltonismo
    comuna: '#0284c7',    // Azul cielo saturado y legible
    colegio: '#10b981',   // Esmeralda vibrante
    facultad: '#f59e0b',  // Ámbar / Oro cálido
    neutral: '#94a3b8',
  },
};
