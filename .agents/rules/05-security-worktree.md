---
trigger: always_on
description: Política de seguridad de terminal (allowlist/denylist) y uso de Git Worktrees aislados para refactorizaciones complejas.
---

# Seguridad, Sandbox y Git Worktrees

## Terminal Sandbox (Allowlist / Denylist)
- El hook `PreToolUse` ([hooks.json](../hooks.json) → [terminal_guard.py](../hooks/terminal_guard.py)) controla `run_command`:
  - **Allowlist rápida:** `pytest`, `npm test`, `npm run lint|build|qa:e2e`, `npx tsc --noEmit`, `git status|diff|log|branch|ls-files|worktree list`.
  - **Denylist bloqueada:** `git push --force`, `git reset --hard`, `git clean -f`, `rm -rf`, `Remove-Item -Recurse -Force`, lectura directa de `.env` y modificaciones del sistema operativo.
  - **Resto de comandos:** requieren aprobación manual (`decision: "ask"`).

## Git Worktrees (`branch` mode)
- **Nunca** ejecutar refactorizaciones extensas o experimentales directamente sobre `main`.
- Al delegar cambios complejos o paralelos a subagentes (`invoke_subagent`), usar `Workspace: "branch"` (o `"share"`) para aislar los cambios en un worktree/clon independiente.
- Para crear o limpiar un Git Worktree local desde consola, usar `.agents/scripts/worktree.ps1` (crea worktrees aislados en `c:\red3d-worktrees\`).
