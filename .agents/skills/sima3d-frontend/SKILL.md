---
name: sima3d-frontend
description: >-
  Use this skill when building, optimizing, or debugging the SIMA-3D Vite +
  React 19 + TypeScript frontend, React Three Fiber 3D scene components (v1 and
  v2), camera controllers, API client configuration, or Jarvis voice/WebSocket
  audio hooks.
---

# SIMA-3D — Frontend 3D & Voice Engineering Skill

## 1. Mapa de módulos clave (`frontend/src/`)
- `services/api.ts`: cliente Axios (`GraphService`, `CopilotService`, URL WebSocket Live). Debe consumir `VITE_API_BASE_URL` desde `src/config/env.ts`.
- `types/graph.ts`: contratos TypeScript sincronizados con `backend/app/schemas/graph.py`.
- `hooks/useJarvisVoice.ts`, `services/pcmAudioCapture.ts`, `services/pcmAudioPlayer.ts`: captura PCM 16kHz, WebSocket Live y reproducción PCM 24kHz.
- `components/NetworkGraph.tsx`, `ChatPanel.tsx`, `JarvisVoiceAssistant.tsx`: escena y paneles v1.
- `v2/AppV2.tsx`, `v2/config.ts`, `v2/components/*` (`NetworkGraphV2`, `SmartEdges`, `EdgeParticles`, `NodeLabels`, `AutoFitCamera`, `GridRoom`, `DepthFog`): escena y HUD v2.

## 2. Procedimiento para cambios en Escena 3D (R3F / Three.js)
1. **Loop `useFrame`:** nunca llamar `setState` ni crear objetos (`new THREE.Vector3()`, `.clone()`) dentro de `useFrame`. Usar `useRef` para estado mutable por frame y vectores temporales prealocados fuera del callback.
2. **Memoria GPU:** toda instancia manual de `THREE.BufferGeometry` o material en `useMemo` debe tener su `useEffect(() => () => geom.dispose(), [geom])`.
3. **Draw calls:** compartir geometrías base entre nodos; agrupar aristas en `lineSegments` con `BufferGeometry` único (evitar cientos de `<Line>` individuales).
4. **Aislamiento de renders:** mantener el estado del input de texto del chat en un componente hijo (`ChatPanel`) separado del `<Canvas>` memoizado.
5. **Cámara (`AutoFitCamera` / `CameraRig`):** coordinar `targetPos` y `fitTrigger` para que **Vista General** reencuadre correctamente tanto con `autoFit` activo como inactivo, y soportar `focus_node`, `focus_cluster` y `reset_view`.

## 3. Procedimiento para cambios en Voz y WebSocket
1. Sincronizar `optionsRef.current` y `statusRef.current` dentro de `useEffect` (nunca mutar refs durante el render).
2. En `ws.onmessage`, `ws.onerror` y `ws.onclose`, leer estado/callbacks desde refs para no sobrescribir `'error'` o `'quota_exceeded'` (código `4003`) a `'idle'`.
3. En `PcmAudioPlayer.interrupt()`, limpiar `source.onended = null` antes de `source.stop()` para evitar disparos duplicados de `onPlaybackEnded`.

## 4. Verificación obligatoria
Ejecutar desde `c:\red3d\frontend`:
```powershell
npx tsc -p tsconfig.app.json --noEmit; npm run lint
```
Ambos comandos deben terminar con **0 errores y 0 warnings**. Para verificar el bundle final (entrypoints `main` y `v2`):
```powershell
npm run build
```
