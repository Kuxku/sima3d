# SIMA-3D: Sistema Inteligente de Análisis y Mapeo Tridimensional de Movilidad Académica

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat&logo=fastapi)](https://fastapi.tiangolo.com/)
[![React Three Fiber](https://img.shields.io/badge/3D-React_Three_Fiber-black?style=flat&logo=threedotjs)](https://docs.pmnd.rs/react-three-fiber)
[![Gemini API](https://img.shields.io/badge/AI-Google_Gemini_Flash-4285F4?style=flat&logo=google)](https://aistudio.google.com/)
[![NetworkX](https://img.shields.io/badge/Graph-NetworkX-orange?style=flat)](https://networkx.org/)

SIMA-3D es una plataforma analítica interactiva que transforma registros masivos de admisiones estudiantiles en una **red de grafos tridimensional (3D)** asistida por un **Copiloto de Inteligencia Artificial**. 

Diseñada para entornos de toma de decisiones educativas e innovación territorial (como Ruta N), la plataforma permite explorar flujos de absorción, desiertos de talento, brechas socioeconómicas y patrones de acceso a programas universitarios desde las comunas y colegios de origen.

---

## Problema y Justificación
El acceso a la educación superior y la formación de talento tecnológico en Medellín presenta asimetrías territoriales y socioeconómicas complejas. Analizar estas dinámicas a través de tablas planas de datos oculta la naturaleza relacional del fenómeno:
* ¿Qué comunas alimentan preferentemente qué áreas del conocimiento?
* ¿Cuáles colegios actúan como nodos ancla de atracción hacia las ingenierías?
* ¿Dónde se concentran las brechas de acceso por estrato socioeconómico?

SIMA-3D resuelve esto integrando **teoría de redes complejas**, **visualización espacial 3D fluida** y **análisis asistido por LLM en tiempo real**.

---

## Arquitectura del Sistema

```text
[ Dataset: 29,014 registros ]
              │
              ▼ (Limpieza y mapeo Z-Score)
      [ dataset_limpio.csv ]
              │
              ▼ (NetworkX: Centralidad + Kamada-Kawai / Force-Directed 3D)
       [ grafo_3d.json ]
              │
       ┌──────┴──────────────────────────┐
       ▼                                 ▼
[ Backend: FastAPI ]            [ Frontend: React / Next.js ]
   ├─ GET /api/graph               ├─ Canvas 3D (React Three Fiber)
   └─ POST /api/copilot/chat       ├─ OrbitControls + Raycasting
              │                    ├─ Panel de Control (Lentes Estratégicos)
              ▼                    └─ Chat Copilot sincronizado con cámara 3D
   [ Google Gemini API ]