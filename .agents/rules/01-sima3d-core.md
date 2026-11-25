---
trigger: always_on
description: Reglas core del proyecto SIMA-3D (stack real, seguridad, privacidad, cero hardcoding y flujo de trabajo).
---

# SIMA-3D — Reglas Core del Workspace

## Stack real del repositorio
- **Backend:** Python 3.11+, FastAPI, Uvicorn, Pydantic v2, `pydantic-settings`, `google-genai`.
- **Frontend:** Vite + React 19 + TypeScript (`strict: true`), `@react-three/fiber`, `@react-three/drei`, Axios y CSS modular/propio.
- **Pipeline offline:** Python, Pandas, NetworkX → genera `data/processed/grafo_3d.json` (≤ 100 nodos agregados).
- **Persistencia:** 100 % memoria + archivos estáticos (`grafo_3d.json`). Cero bases de datos transaccionales y cero autenticación.

## Seguridad y privacidad (innegociable)
1. **Nunca** commitear `.env`, claves API, `data/raw/`, ni `__pycache__/*.pyc`. Mantener `.gitignore` y `.env.example` actualizados.
2. La clave `GEMINI_API_KEY` existe **solo en el backend**; jamás exponerla en el frontend ni en logs.
3. **Privacidad por agregación:** ningún endpoint, log ni prompt puede exponer registros individuales de estudiantes. Aplicar `MIN_GROUP_SIZE` en el pipeline.
4. **Nunca** devolver `traceback`, rutas internas ni `str(e)` crudo al cliente (HTTP ni WebSocket).
5. Tratar toda entrada del usuario como no confiable (limitar longitud, rate limit por IP, usuario siempre en rol `user`).

## Cero hardcoding y DRY
- **Backend:** toda configuración vive en `backend/app/core/config.py` (`Settings`). Ningún otro módulo lee `os.environ`.
- **Frontend:** URLs y límites vienen de variables `VITE_*` (`src/config/env.ts`) y constantes centralizadas. Nunca hardcodear `localhost:8000` ni nombres de modelos en la UI.
- **Datos reales:** prohibido inventar o hardcodear porcentajes/cifras estadísticas (incluso en fallbacks); toda métrica se calcula del grafo.
- No añadir dependencias nuevas sin justificación explícita.

## Flujo de trabajo y Definition of Done
- Antes de dar una tarea por terminada, ejecutar las pruebas y checks correspondientes (`pytest`, `tsc --noEmit`, `npm run lint`).
- Mantener sincronizados los contratos entre `backend/app/schemas/graph.py` y `frontend/src/types/graph.ts` en el mismo cambio.
- Referenciar el número de issue de GitHub (`#13`–`#21`) en commits y PRs.
