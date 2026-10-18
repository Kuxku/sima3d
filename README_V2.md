# SIMA-3D v2 — Mapeo Tridimensional con Arquitectura Modular

Este documento describe la versión 2 (**SIMA-3D v2**), desarrollada de forma completamente aislada de la versión estable.

---

## 1. Acceso a las Versiones

- **Versión Estable (v1):** `http://localhost:5173/` (código original intacto)
- **Versión con Mejoras (v2):** `http://localhost:5173/v2/`

---

## 2. Feature Flags (`src/v2/config.ts`)

Todas las mejoras están gobernadas por feature flags. Puedes apagarlas o encenderlas en código en `src/v2/config.ts` o interactivamente mediante el panel **"v2 Flags"** en la esquina superior derecha del HUD.

```typescript
export const V2_CONFIG = {
  flags: {
    improvedLayout: true,  // Mejora 1: Layout jerárquico 3D y repulsión
    autoFit: true,         // Mejora 2: Auto-centrado y botón reencuadre
    smartEdges: true,      // Mejora 3: Aristas inteligentes y jerarquía
    particles: true,       // Mejora 3b: Partículas en aristas
    labels: false,         // Mejora 4: Etiquetas fijas y tooltips ricos
    depthStyle: false,     // Mejora 5: Estilo visual, niebla y paleta accesible
    uiPolish: false,       // Mejora 6: UI pulida y modo presentación
  }
};
```

---

## 3. Detalle de Mejoras Implementadas

### Mejora 1: Layout Legible (`improvedLayout`)
- **Problema solucionado:** Los nodos se apilaban en un cúmulo central denso donde las facultades quedaban ocultas o aplastadas.
- **Topología jerárquica en 3D:**
  1. **Facultades como Hubs:** Se distribuyen en un anillo elipsoidal 3D exterior amplio y visible, con elevaciones alternadas para dar verdadera tridimensionalidad.
  2. **Colegios en Órbita:** Cada colegio orbita tridimensionalmente alrededor de la facultad a la que mayor número de estudiantes transfiere.
  3. **Comunas Intermedias:** Las comunas se posicionan en una esfera intermedia orientada hacia los colegios con los que guardan mayor relación de origen.
  4. **Fuerza de Repulsión y Colisión:** Módulo síncrono offline ejecutado en `useMemo` (< 5ms) con radios proporcionales al volumen de estudiantes, eliminando colisiones y empalmes visuales.
  5. **Parámetros configurables:** `facultadRadius`, `colegioOrbitRadius`, `repulsionIterations`, `collisionPadding`, etc., expuestos en `V2_CONFIG.layout`.
- **Fallback defensivo:** Si `improvedLayout: false`, se utiliza el algoritmo de posicionamiento idéntico al de v1 (`computeOriginalPositions`).

### Mejora 2: Encuadre y Centrado (`autoFit`)
- **Problema solucionado:** Nodos y aristas que quedaban fuera del viewport o cortados según el tamaño de la pantalla, y pérdida del encuadre global tras interactuar.
- **Auto-cálculo de Bounding Sphere:**
  1. Calcula en tiempo real el centro geométrico y radio envolvente de todos los nodos activos en el grafo.
  2. Mediante trigonometría esférica de cámara (`calculateFitDistance`), deduce la distancia óptima `Z` para que toda la red quepa holgadamente con un padding factor configurable (`paddingFactor: 1.28`).
  3. **Transición suave:** Interpola suavemente (lerp a 60 FPS) la cámara y los controles hacia la posición óptima de encuadre.
  4. **Auto-fit en Resize:** Se dispara automáticamente ante cambios de tamaño de ventana (`window resize`).
  5. **Botón "⛶ Reencuadrar":** Ubicado en la barra superior del HUD, permite resetear la vista y centrar la constelación completa en cualquier momento.
  6. **Respeto a la interacción:** Se pausa automáticamente cuando el usuario selecciona un nodo o cuando el Copilot ejecuta un enfoque analítico.
- **Fallback defensivo:** Si `autoFit: false`, la cámara regresa a su posición fija clásica `(0, 0, 38)`.

### Mejora 3: Aristas con Jerarquía Visual (`smartEdges` y `particles`)
- **Problema solucionado:** Neblina de 380 líneas individuales dibujadas por separado (380 draw calls en cada frame), saturando el lienzo y degradando los FPS.
- **Renderizado de Alto Rendimiento:**
  1. **Un solo Draw Call:** Todas las líneas de fondo inactivas se agrupan en una única `BufferGeometry` con `lineSegments`, reduciendo el costo de GPU a prácticamente cero.
  2. **Degradado Cromático por Vértice (`vertexColors`):** Cada arista interpola suavemente entre el color del nodo origen y el color del nodo destino (azul cian de comunas, esmeralda de colegios y ámbar de facultades).
  3. **Opacidad Sutil por Defecto:** En reposo, las aristas tienen una presencia muy elegante y no invasiva (`defaultOpacity: 0.12`).
  4. **Modo Foco Dinámico (Hover y Clic):** Al pasar el cursor o hacer clic sobre cualquier nodo, se iluminan únicamente sus conexiones directas con mayor grosor y brillo emisivo, atenuando el resto de la red (`dimmedOpacity: 0.03`).
  5. **Grosor Proporcional al Flujo:** El grosor de las líneas activas se modula en función del peso logarítmico del flujo de estudiantes.
  6. **Partículas Energéticas de Flujo (`particles`):** Cuando una o más aristas están activas, un sistema de partículas (desarrollado con `Points` y memoria preasignada sin asignaciones por frame) viaja en bucle continuo de origen a destino, indicando visualmente el sentido del flujo académico a 60 FPS.
- **Fallback defensivo:** Si `smartEdges: false`, regresa al renderizado de líneas estándar previo.



---

## 4. Cómo Revertir

1. Eliminar la carpeta `frontend/v2/` y `frontend/src/v2/`.
2. Revertir la adición de entrada `v2` en `frontend/vite.config.ts`.
3. Borrar este archivo `README_V2.md`.
4. Regresar a la rama principal (`git checkout main` o `master`).
