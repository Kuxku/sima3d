# 01_Objetivo_Alcance_Limitaciones.md

# Documento de Definición Estratégica: SIMA-3D
**Sistema Inteligente de Análisis y Mapeo Tridimensional de Movilidad Académica**

## 1. Objetivos del Proyecto

### 1.1 Objetivo General
Desarrollar y desplegar un Prototipo Mínimo Viable (MVP) de una aplicación web interactiva que transforme 29,014 registros históricos de admisiones estudiantiles en una red de grafos tridimensional (3D). El sistema estará asistido por un copiloto de Inteligencia Artificial (basado en la API de Google Gemini) para permitir a evaluadores institucionales y tomadores de decisiones de Ruta N identificar, en tiempo real, patrones de acceso territorial, brechas socioeconómicas y dinámicas de atracción de talento hacia programas de educación superior.

### 1.2 Objetivos Específicos
* **Modelado de Datos:** Procesar y normalizar el dataset estático para modelar matemáticamente las interacciones complejas entre el territorio de origen (`comuna`), el ecosistema formativo previo (`colegio`/`institucion`), la condición socioeconómica (`id_estrato`) y el destino académico (`facultad`/`nombre_programa`).
* **Visualización de Alto Impacto:** Implementar una escena espacial interactiva utilizando React Three Fiber (R3F) que renderice la red de movilidad de manera fluida, empleando coordenadas precalculadas para garantizar un alto rendimiento (mínimo 45 FPS) en hardware estándar sin tarjetas gráficas dedicadas.
* **Asistencia Inteligente:** Integrar un asistente analítico conversacional sustentado en el nivel gratuito de la API de Gemini que interprete consultas en lenguaje natural, diagnostique patrones en los datos y sincronice sus respuestas paramétricas con la navegación de la cámara 3D.
* **Usabilidad Ejecutiva:** Proveer una interfaz de usuario (UI) tipo "Centro de Comando" con paneles de métricas dinámicas y conmutadores de "Lentes Estratégicos", permitiendo la exploración de datos sin requerir conocimientos técnicos previos por parte del usuario final.

---

## 2. Alcance del Proyecto

### 2.1 En Alcance (*In-Scope*)
* **Capa de Procesamiento de Datos (Pipeline):**
  * Limpieza, capitalización de textos y corrección matemática de la variable `id_estrato` (reversión de Z-Score).
  * Agregación de 29,014 registros individuales en una topología de red macro (agrupación por comunas, colegios y facultades).
  * Precomputación estática de métricas algorítmicas de red (Centralidad de Grado, *Betweenness*) y cálculo de coordenadas espaciales $(x, y, z)$ mediante algoritmos de repulsión en Python (`NetworkX`).
* **Capa Backend (FastAPI - Python):**
  * Desarrollo de un servidor ligero con un endpoint REST (`/api/graph`) para servir la topología estática.
  * Desarrollo de un endpoint REST (`/api/copilot/chat`) que reciba consultas, inyecte el contexto estadístico estructurado del grafo y se comunique con la API de Gemini.
* **Capa Frontend (React / React Three Fiber + Tailwind CSS):**
  * Lienzo 3D (*Canvas*) interactivo con soporte nativo para *raycasting* (detección de clics sobre nodos) y controles orbitales (zoom, paneo, rotación).
  * Motor de animación de cámara (*camera fly-to*) basado en las respuestas del copiloto o la interacción manual.
  * Interfaz lateral de chat y panel de control para visualización de KPIs (Volumen de estudiantes, nodos más conectados, porcentaje de absorción).

### 2.2 Fuera de Alcance (*Out-of-Scope*)
* **Gestión de Usuarios:** Módulos de registro (Sign-up), autenticación (Login), o control de roles y permisos (RBAC). El sistema operará en un entorno abierto de demostración.
* **Ingesta Dinámica de Datos:** Subida de nuevos archivos `.csv` o `.xlsx` desde la interfaz en tiempo de ejecución. El dataset de 29,014 registros se considera el universo estático del prototipo.
* **Entrenamiento de Modelos:** Ajuste fino (*Fine-tuning*), RAG vectorial complejo o despliegue local de modelos LLM (Large Language Models) propios. Todo el procesamiento de lenguaje natural dependerá exclusivamente de la API de Gemini.
* **Físicas en Tiempo Real:** Simulación continua de gravedad tridimensional o atracción/repulsión de nodos recalculada *frame a frame* en el navegador cliente.
* **Bases de Datos Relacionales:** Uso de motores como PostgreSQL, MySQL o bases de datos de grafos pesadas como Neo4j. El almacenamiento y transferencia se basará en archivos JSON cacheados en memoria.

---

## 3. Limitaciones y Restricciones

* **Restricción de Tiempo:** El ciclo de vida del desarrollo está estrictamente limitado a 14 días calendario, obligando a priorizar el desarrollo de características centrales (MVP) y descartar refactorizaciones profundas.
* **Hardware de Demostración:** El prototipo debe ejecutarse sin degradación visual en laptops de gama media (gráficos integrados Intel UHD/Iris o AMD Radeon Graphics básicos), limitando el recuento total de polígonos y fuentes de luz simultáneas en la escena 3D.
* **Dependencia Externa (API):** El sistema depende de la disponibilidad y los límites de tasa (*Rate Limits*) del *Free Tier* de Google AI Studio. Una caída de los servidores de Google o la superación de la cuota de peticiones por minuto degradará la funcionalidad del chat, requiriendo un plan de contingencia offline.
* **Profundidad de Datos:** Al carecer de variables temporales (meses/años de ingreso consecutivos) en el dataset normalizado provisto, el sistema no podrá mostrar predicciones de series de tiempo ni animaciones de evolución cronológica, enfocándose puramente en un corte transversal del estado actual de movilidad.