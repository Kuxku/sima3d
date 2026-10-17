# 02_Requisitos_Funcionales_No_Funcionales.md

# Documento de Requisitos del Sistema (SRS)

## 1. Requisitos Funcionales (RF)

### 1.1 Módulo de Datos y API (Backend)
* **RF-01 [Generación de Topología]:** El backend debe agrupar los datos crudos en tres categorías de nodos mutuamente excluyentes: Territoriales (Comunas), de Origen (Colegios) y de Destino (Facultades/Programas).
* **RF-02 [Precomputación Espacial]:** El sistema debe generar y fijar atributos $(x, y, z)$ para cada nodo de manera que la distancia visual entre nodos refleje su nivel de conectividad relacional, evitando colisiones espaciales.
* **RF-03 [Servicio de Grafo]:** El backend debe exponer el endpoint GET `/api/graph` que retorne el modelo de red completo en formato JSON estándar estructurado en arreglos de `nodes` y `links`.
* **RF-04 [Inyección de Contexto IA]:** Antes de enviar el prompt del usuario a Gemini, el endpoint POST `/api/copilot/chat` debe concatenar la pregunta original con un string estadístico predefinido que resuma los nodos con mayor centralidad y volumen del grafo actual.

### 1.2 Módulo de Visualización Espacial (Frontend 3D)
* **RF-05 [Renderizado Diferenciado]:** La interfaz debe instanciar mallas (*meshes*) 3D distintas según el tipo de nodo. Ejemplo: Esferas para facultades, cubos para comunas, o diferenciación por paleta de colores. El tamaño de la malla debe ser directamente proporcional al volumen de estudiantes (`val`).
* **RF-06 [Interacción Táctil/Mouse]:** Al activar el evento `onClick` sobre un nodo, el sistema debe:
  1. Actualizar el estado global con el ID del nodo activo.
  2. Aumentar la opacidad de los enlaces (*links*) directos del nodo.
  3. Disminuir la opacidad al 20% del resto de la red.
* **RF-07 [Cinemática de Cámara]:** Al seleccionar un nodo o recibir un comando de la IA, el controlador de la cámara debe interpolar su posición actual hasta una distancia relativa de *offset* del nodo objetivo en un lapso no mayor a 1.5 segundos.

### 1.3 Módulo de Asistencia e Interfaz Analítica
* **RF-08 [Interfaz de Copiloto]:** El frontend debe incluir un panel persistente con un historial de chat estilo mensajería, un campo de entrada de texto y un indicador visual de carga (*loading spinner*) mientras se espera la respuesta del backend.
* **RF-09 [Parseo de Comandos IA]:** El frontend debe ser capaz de interpretar la respuesta JSON de Gemini, separando el mensaje de texto (para mostrarlo en el chat) de los comandos de acción (`target_node`, `highlight_cluster`) para ejecutar funciones en el canvas 3D.
* **RF-10 [Lentes Estratégicos (Filtros)]:** La interfaz debe incluir tres botones de macro-filtros que, al ser presionados, reorganicen visualmente la red instantáneamente sin consultar al backend:
  * *Lente Territorial*: Aísla y colorea por comunas.
  * *Lente Socioeconómico*: Aísla y colorea por `id_estrato`.
  * *Lente de Riesgo/Fuga*: Resalta las instituciones con menor conectividad al sistema universitario.
* **RF-11 [Panel de Detalles]:** La UI debe mostrar una tarjeta de detalles poblada dinámicamente con el nombre, estrato predominante, número total de conexiones y descripción algorítmica del nodo seleccionado en ese momento.

---

## 2. Requisitos No Funcionales (RNF)

* **RNF-01 [Rendimiento y Optimización]:** La aplicación frontend debe mantener una frecuencia de actualización estable entre **45 FPS y 60 FPS**. Se debe utilizar *InstancedMesh* en Three.js si el recuento de nodos supera los 500 elementos, limitando las texturas pesadas y las sombras dinámicas.
* **RNF-02 [Tiempos de Respuesta (Latencia)]:**
  * Las consultas al endpoint estático `/api/graph` deben resolverse en **< 300 milisegundos**.
  * Las interacciones con el endpoint de IA `/api/copilot/chat` deben mostrar una respuesta al usuario en un tiempo máximo de **4 segundos**.
* **RNF-03 [Tolerancia a Fallos (Resiliencia)]:** Si la conexión con la API de Gemini experimenta un *Timeout* o un error HTTP 429 (Too Many Requests), el sistema debe capturar la excepción (`try/catch`) y devolver una respuesta amigable estandarizada: *"El análisis en tiempo real está temporalmente saturado. Por favor, utiliza los lentes estratégicos manuales."*, garantizando que el resto del sistema 3D no se congele.
* **RNF-04 [Seguridad de Credenciales]:** La API Key de Google Gemini debe almacenarse exclusivamente como una variable de entorno (`.env`) en el backend y **nunca** debe ser expuesta, empaquetada o transitada hacia el código fuente del frontend en el navegador del cliente.
* **RNF-05 [Diseño UI/UX]:** El diseño debe adherirse a patrones de *Data Visualization Dashboard*. Debe soportar una resolución mínima de 1366x768 píxeles y emplear una paleta de colores de alto contraste (fondo oscuro, nodos luminosos) optimizada para proyectores de auditorio.