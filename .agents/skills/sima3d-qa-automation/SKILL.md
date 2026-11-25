---
name: sima3d-qa-automation
description: >-
  Use this skill when the user asks to run automated QA, full-stack regression
  testing, subagent-based parallel verification, or Headless Browser E2E tests
  against SIMA-3D (backend FastAPI, pipeline, frontend v1/v2, and live 3D UI).
---

# SIMA-3D — Automatización de Pruebas con Subagentes y Headless Browser

Este flujo orquesta **3 subagentes en paralelo** (Backend/Pipeline QA, Frontend Static/Build QA y Browser E2E) sin añadir dependencias pesadas al repositorio.

## Fase 1 — Lanzar Subagentes de Verificación Estática y Unitaria (en paralelo)

Invocar en el mismo turno usando `invoke_subagent` (tipo `self` o subagentes definidos con `define_subagent`):

1. **Subagente `backend-qa`** (`Role: "Backend & Pipeline QA"`):
   - Ejecutar `c:\red3d\.venv\Scripts\python.exe -m pytest -v` en `c:\red3d\backend`.
   - Ejecutar `c:\red3d\.venv\Scripts\python.exe -m pytest pipeline/tests -v` en `c:\red3d`.
   - Verificar higiene Git: `git ls-files backend/.env data/raw/ "**/*.pyc"` debe estar vacío.
   - Reportar conteo de tests pasados/fallidos y cualquier regresión.

2. **Subagente `frontend-qa`** (`Role: "Frontend Typecheck & Lint QA"`):
   - Ejecutar en `c:\red3d\frontend`:
     - `npx tsc -p tsconfig.app.json --noEmit`
     - `npm run lint`
     - `npm run build`
   - Reportar errores de TypeScript, errores/warnings de ESLint y estado del bundle (`main` y `v2`).

*(Opcional: para una corrida rápida en un solo comando sin subagentes, ejecutar [run_full_qa.ps1](./scripts/run_full_qa.ps1)).*

## Fase 2 — Pruebas E2E con Headless Browser (Brave + `playwright-core`)

1. **Levantar servidores locales en background** (`IsDaemon: true`, `WaitMsBeforeAsync: 500`):
   - Backend:
     ```powershell
     cd c:\red3d\backend; c:\red3d\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
     ```
   - Frontend:
     ```powershell
     cd c:\red3d\frontend; npm run dev -- --host 127.0.0.1 --port 5173
     ```
2. **Ejecutar el runner Headless con Brave** (usa el `brave.exe` instalado sin descargar Chromium ni abrir ventanas):
   ```powershell
   cd c:\red3d\frontend; node scripts/qa-e2e-brave.mjs
   ```
   *(Cubre los 6 escenarios definidos en [e2e-scenarios.md](./references/e2e-scenarios.md): v1/v2 `<canvas>` WebGL, KPIs `29,014` / `61` / `380`, chat del Copiloto sin `traceback`, modal Módulos, Reencuadrar, panel de Voz y auditoría de consola/red).*
3. **Limpieza:** al finalizar `qa-e2e-brave.mjs`, detener ambos servidores daemon con `manage_task(Action="kill", ...)`.

## Fase 3 — Reporte Consolidado
Entregar una tabla única con:
- Resultado de Backend QA (`pytest`), Pipeline QA (`pytest`), Frontend QA (`tsc`, `eslint`, `build`), Git Hygiene y E2E Browser (`v1` y `v2`).
- Si algún escenario falla, listar archivo, error exacto y si corresponde a un issue abierto en `Kuxku/sima3d` (`#13`–`#21`).
