---
trigger: glob
globs: frontend/**
description: Reglas de ingeniería para Frontend React Three Fiber, TypeScript estricto y Asistente de Voz.
---

# Reglas de Frontend 3D y Voz (React + R3F + TypeScript)

## Tipado y calidad
- `tsconfig.app.json` debe operar con `"strict": true`. **Prohibido `any`** (usar `unknown` + narrowing).
- `src/types/graph.ts` debe reflejar exactamente el contrato Pydantic (`estrato_median: number | null`, `rural_share: number | null`).
- `npm run lint` y `npx tsc -p tsconfig.app.json --noEmit` deben pasar con **0 errores y 0 warnings**.

## Rendimiento WebGL / Three.js (60 FPS en GPU integrada)
- **Prohibido llamar `setState` dentro de `useFrame`.** Usar `ref` para mutaciones por frame o actualizar solo cuando la cámara cambie por encima de un umbral.
- **Prohibido alocar objetos (`new THREE.Vector3()`, `.clone()`) dentro de `useFrame`.** Reutilizar vectores temporales prealocados fuera del loop.
- Todo `BufferGeometry` o material creado manualmente en `useMemo` debe liberarse con `.dispose()` en el cleanup de `useEffect`.
- Compartir geometrías base entre nodos; renderizar aristas en `lineSegments` con `BufferGeometry` único (nunca cientos de `<Line>` individuales).
- Mantener aislado el estado del input de chat respecto al `<Canvas>` memoizado para que escribir no re-renderice la escena 3D.
- No mutar objetos de configuración importados (`V2_CONFIG`) dentro de `setState`.

## Voz y WebSocket (`useJarvisVoice.ts`, `pcmAudioPlayer.ts`)
- Nunca escribir en `ref.current` durante el render (`react-hooks/refs`); sincronizar refs en `useEffect`.
- Dentro de `ws.onmessage`, `ws.onerror` y `ws.onclose`, leer callbacks y estado mutable desde `ref` para evitar *stale closures* que sobrescriban estados de error o cuota (`4003`).
- En `PcmAudioPlayer.interrupt()`, asignar `source.onended = null` antes de llamar `source.stop()` para evitar doble disparo de `onPlaybackEnded`.

## Verificación obligatoria
- Ejecutar `npx tsc -p tsconfig.app.json --noEmit` y `npm run lint` desde `frontend/` tras cualquier cambio.
