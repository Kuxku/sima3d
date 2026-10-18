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
    labels: true,          // Mejora 4: Etiquetas fijas y tooltips ricos
    depthStyle: true,      // Mejora 5: Estilo visual, niebla y paleta accesible
    uiPolish: true,        // Mejora 6: UI pulida y modo presentación
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
### Mejora 4: Etiquetas Inteligentes y Tooltip Enriquecido (`labels`)
- **Problema solucionado:** Etiquetas que colisionan entre sí o crean ruido visual excesivo, y falta de contexto detallado al inspeccionar nodos.
- **Etiquetas Permanentes con Umbral:**
  1. Solo los nodos más representativos de la red (`volume >= 800`, como facultades principales y comunas masivas) muestran etiqueta fija permanente, reduciendo el ruido visual en más del 80%.
  2. **Anti-colisión en pantalla 2D:** Proyecta las posiciones tridimensionales a píxeles de pantalla y descarta automáticamente etiquetas secundarias si colisionan con una de mayor volumen.
  3. **Desvanecimiento por Distancia (Distance Fade):** La opacidad de las etiquetas fijas se interpola dinámicamente según la distancia a la cámara, desvaneciéndose con elegancia al alejarse (`maxVisibleDistance: 55`).
- **Tooltip Enriquecido (Hover y Selección):**
  1. Al pasar el cursor o hacer clic sobre cualquier nodo, se despliega una tarjeta HUD con glassmorphism que detalla: tipo y color oficial, nombre completo, volumen exacto de estudiantes, estrato socioeconómico mediano, porcentaje de población rural y número de conexiones directas.
### Mejora 5: Tamaño y Profundidad (`depthStyle`)
- **Problema solucionado:** La compresión logarítmica aplastaba las diferencias visuales entre entidades pequeñas y grandes, faltaba profundidad atmosférica en el fondo 3D y los tonos azul/verde podían generar confusión visual.
- **Dimensionamiento Físico Proporcional a $\sqrt{\text{estudiantes}}$:**
  1. El radio de cada nodo se calcula proporcional a la raíz cuadrada del volumen (`sqrtFactor: 0.022`) acotado entre un mínimo de 0.28 y un máximo de 1.45 unidades. Esto otorga una jerarquía visual inmediata donde las facultades y comunas masivas destacan sin tapar a colegios pequeños.
- **Niebla Tridimensional Sutil (`fog`):**
  1. Incorpora un gradiente atmosférico (`#020617`, near: 22, far: 105) que atenúa suavemente los nodos más lejanos en Z, potenciando la sensación de inmersión espacial tridimensional.
- **Bloom Selectivo y Acabado Translúcido:**
  1. Los nodos utilizan materiales PBR con rugosidad controlada y un 90% de opacidad cristalina.
  2. El resplandor emisivo (Bloom) se concentra selectivamente en nodos seleccionados, activos o vecinos inmediatos.
- **Paleta de Alto Contraste y Accesible:**
  1. Comunas: `#0ea5e9` (Azul zafiro puro).
  2. Colegios: `#10b981` (Verde esmeralda nítido).
  3. Facultades: `#f59e0b` (Ámbar dorado cálido).
### Mejora 6: Interfaz Pulida y Modo Presentación (`uiPolish`)
- **Problema solucionado:** Chips de preguntas rápidas que se cortaban horizontalmente, contraste subóptimo en etiquetas secundarias y necesidad de una vista limpia para presentaciones ejecutivas o demostraciones en pantallas de Ruta N.
- **Chips de Sugerencias Envolventes (`flex-wrap`):**
  1. Los chips de preguntas predefinidas se adaptan en múltiples líneas dinámicas con padding y bordes suaves, sin cortarse ni generar scroll horizontal incómodo.
- **Accesibilidad y Contraste WCAG AA:**
  1. Tipografías secundarias (`kpi-label`, `brand-subtitle`, métricas) elevadas a contrastes superiores a 4.5:1 (`#94a3b8` y `#cbd5e1`) y tamaños mínimos de 11px/12px para visualización cómoda en cualquier proyector o pantalla.
- **Panel de Chat Colapsable:**
  1. Botón de minimizado en la cabecera del chat (◀) que oculta el panel lateral con una transición fluida.
  2. Pestaña flotante "Abrir Chat Copilot" para reabrirlo con un solo clic, liberando el 100% del lienzo cuando no se conversa con la IA.
- **Leyenda Interactiva Filtrable:**
  1. Clic en "Comunas", "Colegios" o "Facultades" en el pie de página para aislar y resaltar esa categoría en el espacio 3D, atenuando las demás para análisis temático inmediato.
  2. Un segundo clic sobre la categoría desactiva el filtro y restaura la vista global.
- **Modo Presentación Cinemático ("📽️ Presentación"):**
  1. Botón dedicado en el HUD que oculta el chat y controles secundarios, manteniendo visibles únicamente los KPIs globales.
  2. Activa una **rotación continua y cinemática lenta a 60 FPS** (`autoRotateSpeed: 0.75`), ideal para proyectar en pantallas durante la demo en Ruta N.
  3. Barra flotante estilizada en la parte inferior para salir del modo presentación con un clic o pulsando la tecla Escape.
- **Fallback defensivo:** Si `uiPolish: false`, regresa al HUD clásico estático de v1.






---

## 4. Cómo Revertir

1. Eliminar la carpeta `frontend/v2/` y `frontend/src/v2/`.
2. Revertir la adición de entrada `v2` en `frontend/vite.config.ts`.
3. Borrar este archivo `README_V2.md`.
4. Regresar a la rama principal (`git checkout main` o `master`).
