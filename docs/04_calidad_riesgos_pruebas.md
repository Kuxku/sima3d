# 03_Matriz_Riesgos_Casos_Prueba.md

# Gestión de Calidad, Riesgos y Pruebas

## 1. Matriz de Riesgos

La siguiente matriz clasifica los riesgos del proyecto en base a su Probabilidad de ocurrencia (Alta/Media/Baja) y su Impacto en el éxito de la presentación (Alto/Medio/Bajo).

| ID | Descripción del Riesgo | Probabilidad | Impacto | Estrategia de Mitigación / Plan de Acción |
| :--- | :--- | :--- | :--- | :--- |
| **R-01** | **Degradación de rendimiento (Caída de FPS)** debido a una cantidad excesiva de nodos o físicas en React Three Fiber. | Media | Alto | Agrupar los 29,014 registros en un máximo de 100-200 super-nodos representativos. Precalcular coordenadas estáticas espaciales en Python. Desactivar sombras y *post-processing* si es necesario. |
| **R-02** | **Fallo de la API de Gemini en plena presentación en vivo** (caída de internet, cuota excedida o latencia extrema). | Media | Alto | Implementar un sistema *Mock* local. Programar 3 comandos de teclado secretos que disparen respuestas falsas instantáneas pre-escritas en caso de que la red falle frente al jurado. |
| **R-03** | **Alucinaciones de la IA**, donde el Copiloto responda con datos inventados o analice nodos que no existen en el dataset. | Alta | Medio | Diseñar un *System Prompt* sumamente estricto (`temperature: 0.1`) que obligue a Gemini a responder "No tengo esa información" si la pregunta sale del contexto del JSON estadístico inyectado. |
| **R-04** | **Retraso en el cronograma**, no alcanzando a integrar la IA y el 3D para el día 14. | Media | Alto | Estructurar el desarrollo de manera modular. Si para el día 10 el chat de IA no es estable, congelar el código, eliminar la caja de texto y depender exclusivamente de los "Lentes Estratégicos" manuales, garantizando un producto entregable. |
| **R-05** | **Falta de legibilidad de los datos (*Hairball Effect*)**. El jurado ve un montón de puntos conectados pero no entiende qué significan. | Baja | Alto | Depender de la cinemática de cámara. Asegurar que la cámara vuele cerca de los nodos importantes e iluminar solo las conexiones directas aislando el ruido visual del fondo. |

---

## 2. Casos de Prueba Críticos (Test Cases)

Estos casos deben ser validados manualmente los días 12 y 13 del sprint para asegurar la estabilidad del MVP.

### Caso de Prueba 1: Carga Inicial de la Topología
* **Precondición:** El servidor FastAPI está en ejecución. El frontend se abre en Google Chrome o Edge.
* **Acción:** Refrescar la ventana del navegador (F5).
* **Resultado Esperado:** 
  1. El lienzo 3D carga en menos de 2 segundos.
  2. Los nodos renderizan en sus posiciones espaciales correspondientes sin moverse de forma caótica.
  3. La interfaz lateral muestra el estado base "Listo para explorar".
* **Estado:** `[ ] Pendiente`

### Caso de Prueba 2: Selección y Aislamiento de Nodo
* **Precondición:** El grafo 3D está visible y estable.
* **Acción:** Hacer clic izquierdo directamente sobre una esfera 3D que represente una Facultad.
* **Resultado Esperado:**
  1. La cámara interpola suavemente acercándose a la esfera.
  2. Las aristas (conexiones) directas hacia colegios y comunas se iluminan (opacidad 1.0).
  3. Los nodos no conectados se atenúan (opacidad 0.1).
  4. La tarjeta de detalles en el panel derecho se puebla con la información de la Facultad seleccionada.
* **Estado:** `[ ] Pendiente`

### Caso de Prueba 3: Interacción con Copiloto de IA (Ruta Feliz)
* **Precondición:** Conexión a internet activa, API Key configurada.
* **Acción:** Escribir *"Muéstrame el colegio con más conexiones"* en el chat y presionar Enviar.
* **Resultado Esperado:**
  1. Aparece el indicador de carga en el chat.
  2. En menos de 4 segundos, aparece la respuesta de texto.
  3. La escena 3D mueve automáticamente la cámara para enfocar el nodo del colegio mencionado en la respuesta.
* **Estado:** `[ ] Pendiente`

### Caso de Prueba 4: Fallback de Conexión de IA (Manejo de Errores)
* **Precondición:** Servidor backend en ejecución, pero desconectar deliberadamente el Wi-Fi o apagar el router.
* **Acción:** Enviar una pregunta cualquiera por el chat del Copiloto.
* **Resultado Esperado:**
  1. Tras un breve lapso, el chat muestra un mensaje de error estilizado y amigable indicando que el Copiloto está fuera de línea.
  2. La aplicación **no** sufre un *crash* (pantalla blanca).
  3. El usuario puede seguir haciendo clic en el grafo 3D y usando los filtros manuales sin problemas.
* **Estado:** `[ ] Pendiente`