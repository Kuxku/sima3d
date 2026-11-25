---
name: sima3d-backend
description: >-
  Use this skill when modifying or debugging the SIMA-3D FastAPI backend,
  Gemini chat/voice services, ActionRegistry tools, CommandValidator,
  ContextBuilder, FallbackEngine, or the Gemini Multimodal Live WebSocket bridge.
---

# SIMA-3D — Backend Engineering Skill

## 1. Mapa de módulos clave (`backend/app/`)
- `core/config.py`: única fuente de configuración (`Settings`). Cualquier variable nueva debe añadirse también a `backend/.env.example`.
- `main.py`: `lifespan`, `GZipMiddleware`, `CORSMiddleware`, handler global de excepciones, `/api/health` y `/api/graph/reload`.
- `api/routes/copilot.py`: endpoints `/chat`, `/voice/query`, `/actions` y WebSocket `/ws/live` con rate limiting y validación de longitud.
- `services/gemini_service.py`: llamadas a Gemini (chat estructurado con `CopilotResponseSchema` y voz Modo 1) + caché LRU `_CHAT_CACHE`.
- `services/command_validator.py`: valida `camera_command` y `highlighted_node_ids` contra los IDs reales del grafo.
- `services/action_registry.py`: herramientas declaradas para Gemini (`focus_node`, `reset_view`, `highlight_nodes`, `filter_by_type`, `inspect_node`).
- `services/context_builder.py`: construye y cachea el contexto topológico y rankings (excluyendo `AGGREGATE_NODE_IDS`).
- `services/fallback_engine.py`: motor analítico determinista local (métricas 100 % calculadas del grafo).
- `services/live_service.py`: `LiveSessionManager` y `GeminiLiveBridge` (audio PCM 16kHz in / 24kHz out).

## 2. Procedimiento al agregar o modificar una acción del Copiloto
1. Definir el DTO de argumentos (`BaseModel`) en `action_registry.py` usando ejemplos con el formato real de IDs (`tipo:slug`, ej. `comuna:robledo`).
2. Resolver todo `node_id` mediante `self._find_node(...)` para tolerar variaciones de formato (`:` vs `-`, mayúsculas).
3. En errores internos del handler, devolver un código de error limpio (ej. `HANDLER_EXECUTION_ERROR`), nunca `str(e)`.
4. Agregar prueba de ejecución válida e inválida en `backend/tests/test_voice.py`.

## 3. Procedimiento al modificar Chat / Fallback / WebSocket Live
1. **Chat (`/chat`):** pasar siempre la respuesta de Gemini por `CommandValidator.validate_response()` antes de guardar en `_CHAT_CACHE` y retornar. Si se recarga el grafo, invalidar `ContextBuilder` y `clear_chat_cache()`.
2. **Errores:** en ningún endpoint HTTP ni evento WebSocket devolver `traceback` ni `str(e)` crudo; usar `status: "fallback"` y códigos de error estandarizados.
3. **WebSocket Live (`live_service.py`):**
   - Cancelar tareas `pending` y esperarlas con `await asyncio.gather(*pending, return_exceptions=True)`.
   - Proteger `base64.b64decode` contra `binascii.Error`/`ValueError`.
   - Evitar emitir texto duplicado entre `part.text` y `content.output_transcription`.
   - Asegurar una sola llamada a `live_session_manager.end_session()` por sesión.

## 4. Ejecución local y validación
- Levantar servidor local:
  ```powershell
  cd c:\red3d\backend; c:\red3d\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
  ```
- Ejecutar suite de pruebas:
  ```powershell
  cd c:\red3d\backend; c:\red3d\.venv\Scripts\python.exe -m pytest -v
  ```
- Confirmar que todas las pruebas pasan (incluyendo `test_api.py`, `test_voice.py` y `test_block_a.py`).
