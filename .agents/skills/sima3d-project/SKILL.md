---
name: sima3d-project
description: >-
  Use this skill for cross-cutting SIMA-3D project workflows: managing GitHub
  issues/milestones on Kuxku/sima3d, regenerating the offline 3D graph pipeline,
  syncing backend/frontend data contracts, and running full-stack pre-demo
  verification across backend, frontend, and pipeline.
---

# SIMA-3D — Project-Wide Workflow Skill

## 1. Gestión de Issues y Ramas (GitHub MCP: `Kuxku/sima3d`)
1. Consultar issues abiertos con `github.list_issues(owner="Kuxku", repo="sima3d", state="open")` antes de iniciar trabajo.
2. Trabajar por milestone en orden (`M1` → `M2` → `M3`) y referenciar el número de issue (`#13`–`#21`) en commits y PRs (`Closes #<N>`).
3. Al completar un issue, verificar todos sus criterios de aceptación y actualizar o comentar el issue vía MCP.

## 2. Sincronización de Contratos Full-Stack
Cuando cambie cualquier campo del grafo (`meta`, `nodes`, `edges`, `metrics`) o de `camera_command`:
1. Actualizar `backend/app/schemas/graph.py` (Pydantic v2).
2. Actualizar `frontend/src/types/graph.ts` (TypeScript `strict: true`, preservando `| null` para `Optional[...]`).
3. Actualizar `pipeline/export_graph.py` si el cambio afecta `grafo_3d.json`.
4. Verificar que `CommandValidator` (`backend/app/services/command_validator.py`) y los handlers de cámara en frontend manejen todas las acciones (`focus_node`, `focus_cluster`, `reset_view`).

## 3. Regeneración del Pipeline Offline y Recarga en Runtime
1. Ejecutar desde la raíz `c:\red3d`:
   ```powershell
   c:\red3d\.venv\Scripts\python.exe -m pipeline.export_graph
   ```
2. Verificar que `data/processed/grafo_3d.json` se generó sin errores y cumple `GraphPayload`.
3. Si el backend está corriendo, recargar en caliente (esto también invalida `ContextBuilder` y `_CHAT_CACHE`):
   ```powershell
   Invoke-RestMethod -Method Post http://localhost:8000/api/graph/reload
   ```

## 4. Verificación Pre-Commit / Pre-Demo (Full Stack)
Ejecutar todo en bloque antes de cerrar una tarea o hacer push:
1. **Backend:** `cd c:\red3d\backend; c:\red3d\.venv\Scripts\python.exe -m pytest -v`
2. **Pipeline:** `cd c:\red3d; c:\red3d\.venv\Scripts\python.exe -m pytest pipeline/tests -v`
3. **Frontend:** `cd c:\red3d\frontend; npx tsc -p tsconfig.app.json --noEmit; npm run lint`
4. **Higiene Git:** `git status -s` y `git ls-files backend/.env data/raw/ "**/*.pyc"` — debe devolver **vacío** (cero secretos, cero dataset crudo, cero `.pyc`).
