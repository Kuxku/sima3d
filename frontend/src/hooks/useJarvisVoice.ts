import { useState, useRef, useEffect, useCallback } from 'react';
import { CopilotService } from '../services/api';
import { PcmAudioCapture } from '../services/pcmAudioCapture';
import { PcmAudioPlayer } from '../services/pcmAudioPlayer';

export type VoiceStatus =
  | 'idle'
  | 'requesting_mic'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'executing_action'
  | 'reconnecting'
  | 'warning'
  | 'quota_exceeded'
  | 'error'
  | 'session_closed';

export interface JarvisActionPayload {
  action: string;
  args: Record<string, unknown>;
  confirmation: string;
  result?: Record<string, unknown>;
  camera_command?: {
    action: string;
    target_node_id: string | null;
    cluster_id?: string | null;
  } | null;
  highlighted_node_ids?: string[];
}

export interface UseJarvisVoiceOptions {
  selectedNodeId?: string | null;
  onActionExecuted?: (action: JarvisActionPayload) => void;
  onUserMessage?: (text: string) => void;
  onAssistantMessage?: (text: string) => void;
}

export function useJarvisVoice(options: UseJarvisVoiceOptions = {}) {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [userTranscript, setUserTranscript] = useState<string>('');
  const [assistantReply, setAssistantReply] = useState<string>('');
  const [lastExecutedAction, setLastExecutedAction] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Referencias para el ciclo de vida por petición (Gemini Live Audio)
  const wsRef = useRef<WebSocket | null>(null);
  const audioCaptureRef = useRef<PcmAudioCapture | null>(null);
  const audioPlayerRef = useRef<PcmAudioPlayer | null>(null);
  const turnCompleteRef = useRef<boolean>(false);
  const isClosingRef = useRef<boolean>(false);
  const statusRef = useRef<VoiceStatus>('idle');

  // Búferes de transcripción: Gemini Live envía fragmentos cortos.
  // Se acumulan aquí y se publican al chat UNA sola vez por turno completado.
  const userBufferRef = useRef<string>('');
  const assistantBufferRef = useRef<string>('');
  const actionConfirmationRef = useRef<string>('');
  const optionsRef = useRef<UseJarvisVoiceOptions>(options);

  // Sincronizar opciones en useEffect (cumple react-hooks/refs)
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const updateStatus = useCallback((next: VoiceStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const clearTranscriptBuffers = useCallback(() => {
    userBufferRef.current = '';
    assistantBufferRef.current = '';
    actionConfirmationRef.current = '';
  }, []);

  // Publica en el chat los mensajes completos del turno una sola vez
  const flushTranscripts = useCallback(() => {
    const userText = userBufferRef.current.trim();
    const assistantText = assistantBufferRef.current.trim() || actionConfirmationRef.current.trim();
    clearTranscriptBuffers();

    if (userText) optionsRef.current.onUserMessage?.(userText);
    if (assistantText) optionsRef.current.onAssistantMessage?.(assistantText);
  }, [clearTranscriptBuffers]);

  // Limpieza total de recursos (cierra audio, mic y WebSocket)
  const cleanupAll = useCallback(
    (flush = false) => {
      if (flush) {
        flushTranscripts();
      } else {
        clearTranscriptBuffers();
      }
      isClosingRef.current = true;

      // 1. Detener captura de audio
      if (audioCaptureRef.current) {
        try {
          audioCaptureRef.current.stop();
        } catch (err) {
          console.warn('Error deteniendo captura de audio:', err);
        }
        audioCaptureRef.current = null;
      }

      // 2. Detener reproductor
      if (audioPlayerRef.current) {
        try {
          audioPlayerRef.current.interrupt();
        } catch (err) {
          console.warn('Error interrumpiendo reproductor de audio:', err);
        }
      }

      // 3. Cerrar WebSocket
      if (wsRef.current) {
        const socket = wsRef.current;
        wsRef.current = null;
        try {
          socket.close();
        } catch (err) {
          console.warn('Error cerrando WebSocket Live:', err);
        }
      }

      turnCompleteRef.current = false;
    },
    [clearTranscriptBuffers, flushTranscripts]
  );

  // Finalizar petición limpia una vez el asistente termina de hablar o al cancelar
  const finishPetition = useCallback(
    (flush = false) => {
      if (isClosingRef.current) return;
      cleanupAll(flush);
      updateStatus('idle');
    },
    [cleanupAll, updateStatus]
  );

  // Inicializar reproductor de audio con callbacks de ciclo de vida
  useEffect(() => {
    const player = new PcmAudioPlayer();

    player.onPlaybackStarted = () => {
      if (audioCaptureRef.current) {
        audioCaptureRef.current.isMuted = true;
      }
      updateStatus('speaking');
    };

    player.onPlaybackEnded = () => {
      // Si el modelo ya había emitido turn_complete, la petición culminó exitosamente
      if (turnCompleteRef.current) {
        finishPetition(false);
      }
    };

    audioPlayerRef.current = player;
    return () => {
      player.close();
    };
  }, [finishPetition, updateStatus]);

  // Interrupción manual de la voz (no publica fragmentos incompletos)
  const interruptAssistant = useCallback(() => {
    finishPetition(false);
  }, [finishPetition]);

  // Iniciar petición de voz
  const startListening = useCallback(async () => {
    cleanupAll(false);
    isClosingRef.current = false;
    turnCompleteRef.current = false;
    updateStatus('requesting_mic');
    setErrorMessage(null);
    setUserTranscript('');
    setAssistantReply('');
    setLastExecutedAction(null);

    const wsUrl = CopilotService.getLiveWebSocketUrl(optionsRef.current.selectedNodeId);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = async () => {
      if (isClosingRef.current || wsRef.current !== ws) return;
      updateStatus('listening');

      try {
        const capture = new PcmAudioCapture({
          onAudioData: (pcmBytes) => {
            if (ws.readyState === WebSocket.OPEN && !isClosingRef.current) {
              ws.send(pcmBytes);
            }
          },
        });
        audioCaptureRef.current = capture;
        await capture.start();
      } catch {
        updateStatus('error');
        setErrorMessage('No se pudo acceder al micrófono. Por favor concede permisos en tu navegador.');
        cleanupAll(false);
      }
    };

    ws.onmessage = async (event: MessageEvent) => {
      try {
        const msg = JSON.parse(String(event.data));

        switch (msg.type) {
          case 'session_started':
            updateStatus('listening');
            break;

          case 'audio': {
            if (audioCaptureRef.current) {
              audioCaptureRef.current.isMuted = true;
            }
            updateStatus('speaking');
            const binaryString = atob(String(msg.data || ''));
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            if (audioPlayerRef.current) {
              await audioPlayerRef.current.playChunk(bytes);
            }
            break;
          }

          case 'text':
            assistantBufferRef.current += String(msg.text || '');
            setAssistantReply(assistantBufferRef.current.trim());
            break;

          case 'user_transcript':
            userBufferRef.current += String(msg.text || '');
            setUserTranscript(userBufferRef.current.trim());
            break;

          case 'action':
            updateStatus('executing_action');
            setLastExecutedAction(msg.confirmation || msg.action);
            if (msg.confirmation) {
              actionConfirmationRef.current = msg.confirmation;
              setAssistantReply((prev) => prev || msg.confirmation);
            }
            optionsRef.current.onActionExecuted?.({
              action: msg.action,
              args: msg.args,
              confirmation: msg.confirmation,
              result: msg.result,
              camera_command: msg.camera_command,
              highlighted_node_ids: msg.highlighted_node_ids,
            });
            break;

          case 'interrupted':
            if (audioPlayerRef.current) {
              audioPlayerRef.current.interrupt();
            }
            finishPetition(false);
            break;

          case 'turn_complete':
            turnCompleteRef.current = true;
            // Turno terminado: publicar la frase completa en el chat UNA sola vez
            flushTranscripts();
            if (!audioPlayerRef.current || !audioPlayerRef.current.isPlaying) {
              finishPetition(false);
            }
            break;

          case 'session_warning':
            updateStatus('warning');
            setErrorMessage(msg.message);
            break;

          case 'session_closed':
            finishPetition(false);
            break;

          case 'error':
            if (msg.code === 'CONCURRENCY_LIMIT_EXCEEDED') {
              updateStatus('quota_exceeded');
            } else {
              updateStatus('error');
            }
            setErrorMessage(msg.message);
            cleanupAll(false);
            break;
        }
      } catch (err) {
        console.error('Error procesando mensaje WebSocket Live:', err);
      }
    };

    ws.onerror = () => {
      if (!isClosingRef.current) {
        updateStatus('error');
        setErrorMessage('Error de conexión WebSocket con el servidor de Gemini Live.');
      }
      cleanupAll(false);
    };

    ws.onclose = (e: CloseEvent) => {
      if (e.code === 4003) {
        updateStatus('quota_exceeded');
        setErrorMessage('Límite de concurrencia alcanzado (máx 3 sesiones simultáneas). Intenta en unos segundos.');
        cleanupAll(false);
        return;
      }

      const currentStatus = statusRef.current;
      if (!isClosingRef.current && currentStatus !== 'error' && currentStatus !== 'quota_exceeded') {
        updateStatus('idle');
      }
      cleanupAll(false);
    };
  }, [cleanupAll, finishPetition, flushTranscripts, updateStatus]);

  // Usuario indica que terminó de hablar ("Listo" o detener escucha)
  const stopAndProcess = useCallback(() => {
    if (audioCaptureRef.current) {
      audioCaptureRef.current.stop();
      audioCaptureRef.current = null;
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'finish_speaking' }));
    }
    updateStatus('processing');
  }, [updateStatus]);

  // Cancelar petición en curso y volver a reposo (sin publicar parciales)
  const stopListening = useCallback(() => {
    finishPetition(false);
  }, [finishPetition]);

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      cleanupAll(false);
    };
  }, [cleanupAll]);

  return {
    status,
    userTranscript,
    assistantReply,
    lastExecutedAction,
    errorMessage,
    startListening,
    stopAndProcess,
    stopListening,
    interruptAssistant,
  };
}
