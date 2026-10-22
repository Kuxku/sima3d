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
- **Tarjeta Inspectora Lateral HUD (Hover y Selección):**
  1. La tarjeta de información ya no flota encima del nodo dentro de la escena 3D, liberando el 100% del lienzo espacial sin tapar geometrías ni aristas.
  2. Ahora se despliega dinámicamente en el **panel lateral derecho del HUD**, mostrando al instante la telemetría del nodo activo (tipo, nombre, volumen exacto, estrato mediano, ruralidad y conexiones directas), con indicador de modo (`○ VISTA PREVIA` en hover o `● FIJADO` al hacer clic) y botón para análisis con el Copilot de IA.
- **Fallback defensivo:** Si `labels: false`, regresa al tooltip flotante básico original.
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
### Mejora 6: Interfaz Pulida, Chat Colapsable y Leyenda Interactiva (`uiPolish`)
- **Problema solucionado:** Chips de preguntas rápidas que se cortaban horizontalmente, contraste subóptimo en etiquetas secundarias y falta de espacio para explorar la red.
- **Chips de Sugerencias Envolventes (`flex-wrap`):**
  1. Los chips de preguntas predefinidas se adaptan en múltiples líneas dinámicas con padding y bordes suaves, sin cortarse ni generar scroll horizontal incómodo.
- **Accesibilidad y Contraste WCAG AA:**
  1. Tipografías secundarias (`kpi-label`, `brand-subtitle`, métricas) elevadas a contrastes superiores a 4.5:1 (`#94a3b8` y `#cbd5e1`) y tamaños mínimos de 11px/12px para visualización cómoda en cualquier pantalla.
- **Panel de Chat Colapsable:**
  1. Botón de minimizado en la cabecera del chat (◀) que oculta el panel lateral con una transición fluida.
  2. Pestaña flotante "Abrir Chat Copilot" para reabrirlo con un solo clic, liberando el 100% del lienzo cuando no se conversa con la IA.
- **Leyenda Interactiva Filtrable:**
  1. Clic en "Comunas", "Colegios" o "Facultades" en el pie de página para aislar y resaltar esa categoría en el espacio 3D, atenuando las demás para análisis temático inmediato.
  2. Un segundo clic sobre la categoría desactiva el filtro y restaura la vista global.
- **Estabilidad Visual (Anti-fatiga):**
  1. Se eliminó cualquier salto o brinco de tamaño brusco (zoom in/out) al pasar el cursor sobre los nodos; el tamaño permanece estable y sereno.
  2. El tooltip aparece con una transición de opacidad pura sin movimientos de rebote.
- **Fallback defensivo:** Si `uiPolish: false`, regresa al HUD clásico estático de v1.

### Entorno Visual: Escenario Arquitectónico Sobrio (Grid Stage)
- **Fondo de Perspectiva 3D (`GridRoom.tsx`):**
  1. Recrea un escenario de estudio sobrio y arquitectónico: plano de suelo horizontal y pared vertical de fondo con líneas de fuga limpias y no invasivas.
  2. **Perspectiva convergente sobria:** Cuadrícula en gris pizarra arquitectónico (`#475569` al 22% de opacidad) sobre fondo slate oscuro institucional (`#0b0f19`), eliminando destellos fluorescentes de estilo de ciencia ficción.
  3. **Profundidad espacial calibrada:** Niebla atmosférica suave en `#0b0f19` y bloom satinado calibrado (`0.35`) que garantiza legibilidad y presencia sin deslumbramiento.

### Barra de Navegación Institucional Master (`AppV2.tsx`)
- **Diseño Ejecutivo y Confiable:**
  1. **Zona 1 (Identidad y Contexto):** Logotipo `SIMA-3D`, badge `PRO`, indicador de estado en vivo (`#10b981`) y subtítulo institucional (`OBSERVATORIO DE MOVILIDAD · Ruta N · Medellín`).
  2. **Zona 2 (Métricas Clave Consolidadas):** Barra de métricas con tipografía de precisión (`29,014 Estudiantes` · `78 Nodos` · `380 Flujos`).
  3. **Zona 3 (Hub de Acciones):** Acciones agrupadas en un solo flexbox sin colisiones:
     - `⛶ Reencuadrar` (Centra la constelación 3D).
     - `⟲ Vista General` (Restaura la selección activa).
     - `⚙ Módulos` (Acceso al diálogo de control de módulos del sistema).

### Panel Inspector de Telemetría (Dossier Ejecutivo)
- **Tarjeta Lateral de Telemetría Institucional:**
  1. En reposo, muestra un estado limpio y sobrio sin sobrecargar la pantalla.
  2. Al enfocar o seleccionar una entidad, presenta un dossier analítico con variables cuantitativas: volumen total de estudiantes, estrato socioeconómico mediano, proporción rural y grado de red.
  3. Botón de análisis institucional con el Asistente Analítico enfocado en la entidad activa.

### Asistente Analítico (Copilot Institucional)
- **Experiencia de Inteligencia de Datos Corporativa:**
  1. Tipografía y burbujas de mensaje inspiradas en plataformas enterprise (Linear / Vercel / ChatGPT Enterprise).
  2. Consultas analíticas directas sobre distribución territorial, matrícula y flujos interinstitucionales.
  3. Paleta de alto contraste sin resplandores ni efectos distractores de ciencia ficción.

### Física Mejorada de Nodos (Dual-Layer Physics Engine)
- **Capa 1: Física de Posicionamiento Topológico (Offline Spring Relaxation):**
  - Implementación síncrona de resortes de Hooke ($F = k \cdot (d - L_0)$) con amortiguamiento y repulsión electrostática de Coulomb ($F_r = k_e / d^2$) en `hierarchicalLayout.ts`.
  - Las facultades actúan como centros gravitacionales de atracción ponderada por volumen de estudiantes; los colegios con mayores flujos son atraídos hacia su facultad principal de forma orgánica, eliminando amontonamientos y preservando relaciones espaciales reales.
- **Capa 2: Micro-Física Cero-G y Elevación Suave en Tres Dimensiones:**
  - `NodeMeshWithPhysics` con oscilación armónica de gravedad cero en `useFrame`: cada nodo respira verticalmente ($Y \pm 0.12$) con una fase periódica determinista basada en su posición.
  - Al interactuar (hover), el nodo se eleva suavemente hacia la cámara ($+0.22$ en Y) mediante interpolación matemática lerp, sin brincos bruscos de escala ni fatiga visual.

---

## 4. Cómo Revertir

1. Eliminar la carpeta `frontend/v2/` y `frontend/src/v2/`.
2. Revertir la adición de entrada `v2` en `frontend/vite.config.ts`.
3. Borrar este archivo `README_V2.md`.
4. Regresar a la rama principal (`git checkout main` o `master`).

