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
    autoFit: false,        // Mejora 2: Auto-centrado y botón reencuadre
    smartEdges: false,     // Mejora 3: Aristas inteligentes y jerarquía
    particles: false,      // Mejora 3b: Partículas en aristas
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


---

## 4. Cómo Revertir

1. Eliminar la carpeta `frontend/v2/` y `frontend/src/v2/`.
2. Revertir la adición de entrada `v2` en `frontend/vite.config.ts`.
3. Borrar este archivo `README_V2.md`.
4. Regresar a la rama principal (`git checkout main` o `master`).
