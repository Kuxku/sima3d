---
trigger: glob
globs: pipeline/**
description: Reglas para el pipeline offline de agregación, layout 3D y exportación de grafo_3d.json.
---

# Reglas del Pipeline Offline (`pipeline/`)

- El pipeline es **offline, determinista e idempotente**: mismo input + misma semilla = mismo `grafo_3d.json`.
- Parametrizar rutas (`RAW_DATA_PATH`, `OUTPUT_PATH`) y `seed` en configuración; nunca hardcodearlos.
- **Privacidad:** aplicar `MIN_GROUP_SIZE` de forma consistente en nodos (fusión en categoría agregada), aristas y matriz cruzada.
- Al restaurar siglas en texto (`clean_text_series`), usar límites de palabra (`\b`) para no corromper subcadenas.
- En `compute_layout.py`, proteger la normalización contra división por cero (`max_val == min_val`).
- **Validación estricta antes de escribir:** `export_graph.py` debe validar el payload con `GraphPayload.model_validate(...)` antes de escribir a disco; si falla, terminar con error claro sin dejar JSON parcial.

## Verificación obligatoria
- Ejecutar `c:\red3d\.venv\Scripts\python.exe -m pytest pipeline/tests -v` desde la raíz del repositorio.
