---
trigger: glob
globs: backend/**
description: Reglas de ingeniería para Backend FastAPI, Copiloto Gemini, ActionRegistry y WebSocket Live.
---

# Reglas de Backend (FastAPI & Gemini)

## Arquitectura y contratos
- Los controladores en `app/api/routes/` son delgados: validan, aplican rate limit y delegan a `app/services/`.
- Toda comunicación con Gemini vive únicamente en `gemini_service.py` (chat/voz Modo 1) y `live_service.py` (Modo 2 Live).
- `/api/copilot/chat` y `/api/copilot/voice/query` **siempre** responden JSON estructurado con `status: "ok" | "fallback"` y nunca cuelgan (timeout estricto vía `asyncio.wait_for`).

## Anti-alucinación y validación
- Toda respuesta estructurada de Gemini (`camera_command`, `highlighted_node_ids`) **debe** validarse con `CommandValidator.validate_response()` antes de cachearse o enviarse al cliente.
- Excluir `settings.AGGREGATE_NODE_IDS` de rankings tanto en `ContextBuilder` como en `FallbackEngine`.
- Los IDs de nodos usan formato `tipo:slug` (ej. `comuna:robledo`, `facultad:facultad-de-ingenierias`). `ActionRegistry` debe normalizar IDs en todos los handlers (`focus_node`, `highlight_nodes`, `inspect_node`).

## Caché, recarga y rendimiento
- `GraphService.load_graph()` debe resolver la ruta desde `settings.GRAPH_DATA_PATH`.
- `POST /api/graph/reload` debe invalidar `ContextBuilder.invalidate_cache()` y `clear_chat_cache()`.
- `GET /api/graph` se sirve desde memoria con `GZipMiddleware` y cabecera `Cache-Control`.

## WebSocket Live (`live_service.py`)
- Al finalizar tareas concurrentes con `FIRST_COMPLETED`, cancelar `pending` **y esperarlas** con `await asyncio.gather(*pending, return_exceptions=True)`.
- Capturar `binascii.Error`/`ValueError` al decodificar audio base64 entrante.
- Evitar duplicación entre `part.text` y `content.output_transcription`, y ejecutar `live_session_manager.end_session()` una sola vez por sesión.

## Verificación obligatoria
- Ejecutar `c:\red3d\.venv\Scripts\python.exe -m pytest -v` desde `backend/` tras cualquier cambio.
