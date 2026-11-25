# Escenarios E2E para Subagente `browser` (SIMA-3D)

## S1 — Carga inicial y KPIs (v1: `http://127.0.0.1:5173/`)
- Esperar a que desaparezca `.loading-screen`.
- Verificar presencia de `<canvas>` con dimensiones > 0x0.
- Verificar KPIs visibles en `.hud-topbar`: `29,014` (o `29.014`), `61` nodos y `380` conexiones.
- Verificar ausencia de `.error-box` y cero errores críticos en consola.

## S2 — Interacción Copilot Chat (v1)
- Hacer clic en un chip `.prompt-chip` (ej. "¿Cuál es la comuna con más estudiantes?").
- Esperar respuesta en `.chat-messages` (desaparece `.typing`).
- Verificar que la nueva burbuja `.chat-bubble.bot` contiene texto en español y NO contiene `traceback` ni `Error catastrófico`.

## S3 — Carga inicial, HUD y Módulos (v2: `http://127.0.0.1:5173/v2/`)
- Esperar a que desaparezca `.loading-screen`.
- Verificar `<canvas>` WebGL visible y telemetría en `.v2-master-navbar`.
- Abrir modal **Módulos** (`.gear-trigger`), verificar que los switches renderizan y cerrar con `ESC` o botón **Listo**.

## S4 — Interacción Chat + Filtro + Vista General (v2)
- Hacer clic en una sugerencia rápida en `.quick-prompts`.
- Esperar respuesta en `.chat-messages` y verificar que aparece `.v2-active-petition-banner`.
- Verificar que el botón **Vista General** o **Reencuadrar** funciona sin errores en consola.

## S5 — Panel de Voz (UI smoke check, sin micrófono real)
- Hacer clic en `.jarvis-floating-trigger` (`SIMA 3D VOZ`) para abrir `.jarvis-panel`.
- Verificar estado inicial `Listo para recibir tu consulta` y cerrar el panel con el botón minimizar (`✕`).

## S6 — Auditoría de Consola y Red
- Confirmar 0 errores `5xx` en `/api/graph`, `/api/health`, `/api/copilot/chat`.
- Confirmar 0 errores no capturados (`uncaught exception`) en consola del navegador.
