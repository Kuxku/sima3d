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

  // Limpieza total de recursos (cierra audio, mic y WebSocket)
  const cleanupAll = useCallback(() => {
    isClosingRef.current = true;

    // 1. Detener captura de audio
    if (audioCaptureRef.current) {
      try {
        audioCaptureRef.current.stop();
      } catch {}
      audioCaptureRef.current = null;
    }

    // 2. Detener reproductor
    if (audioPlayerRef.current) {
      try {
        audioPlayerRef.current.interrupt();
      } catch {}
    }

    // 3. Cerrar WebSocket
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }

    turnCompleteRef.current = false;
  }, []);

  // Finalizar petición limpia una vez el asistente termina de hablar
  const finishPetition = useCallback(() => {
    // Si ya estamos cerrando, evitar llamadas redundantes
    if (isClosingRef.current) return;
    cleanupAll();
    setStatus('idle');
  }, [cleanupAll]);

  // Inicializar reproductor de audio con callbacks de ciclo de vida
  useEffect(() => {
    const player = new PcmAudioPlayer();

    player.onPlaybackStarted = () => {
      if (audioCaptureRef.current) {
        audioCaptureRef.current.isMuted = true;
      }
      setStatus('speaking');
    };

    player.onPlaybackEnded = () => {
      // Si el modelo ya había emitido turn_complete, la petición culminó exitosamente
      if (turnCompleteRef.current) {
        finishPetition();
      }
    };

    audioPlayerRef.current = player;
    return () => {
      player.close();
    };
  }, [finishPetition]);

  // Interrupción manual de la voz
  const interruptAssistant = useCallback(() => {
    finishPetition();
  }, [finishPetition]);

  // Iniciar petición de voz
  const startListening = useCallback(async () => {
    cleanupAll();
    isClosingRef.current = false;
    turnCompleteRef.current = false;
    setStatus('requesting_mic');
    setErrorMessage(null);
    setUserTranscript('');
    setAssistantReply('');
    setLastExecutedAction(null);

    const wsUrl = CopilotService.getLiveWebSocketUrl(options.selectedNodeId);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = async () => {
      setStatus('listening');

      try {
        // Iniciar captura de audio PCM 16kHz
        const capture = new PcmAudioCapture({
          onAudioData: (pcmBytes) => {
            if (ws.readyState === WebSocket.OPEN && !isClosingRef.current) {
              (ws as any).send(pcmBytes);
            }
          },
        });
        audioCaptureRef.current = capture;
        await capture.start();
      } catch (micErr: any) {
        setStatus('error');
        setErrorMessage('No se pudo acceder al micrófono. Por favor concede permisos en tu navegador.');
        cleanupAll();
      }
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case 'session_started':
            setStatus('listening');
            break;

          case 'audio': {
            // Silenciar micrófono mientras Jarvis habla
            if (audioCaptureRef.current) {
              audioCaptureRef.current.isMuted = true;
            }
            setStatus('speaking');
            const binaryString = atob(msg.data);
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
            setAssistantReply((prev) => (prev ? `${prev} ${msg.text}` : msg.text));
            options.onAssistantMessage?.(msg.text);
            break;

          case 'user_transcript':
            setUserTranscript(msg.text);
            options.onUserMessage?.(msg.text);
            break;

          case 'action':
            // Tool call ejecutada por Gemini Live
            setStatus('executing_action');
            setLastExecutedAction(msg.confirmation || msg.action);
            options.onActionExecuted?.({
              action: msg.action,
              args: msg.args,
              confirmation: msg.confirmation,
              result: msg.result,
              camera_command: msg.camera_command,
              highlighted_node_ids: msg.highlighted_node_ids,
            });
            break;

          case 'interrupted':
            // Interrupción confirmada
            if (audioPlayerRef.current) {
              audioPlayerRef.current.interrupt();
            }
            finishPetition();
            break;

          case 'turn_complete':
            turnCompleteRef.current = true;
            // Si el reproductor no está reproduciendo o no hay cola de audio, finalizar la petición de inmediato
            if (!audioPlayerRef.current || !audioPlayerRef.current.isPlaying) {
              finishPetition();
            }
            break;

          case 'session_warning':
            setStatus('warning');
            setErrorMessage(msg.message);
            break;

          case 'session_closed':
            finishPetition();
            break;

          case 'error':
            setStatus('error');
            if (msg.code === 'CONCURRENCY_LIMIT_EXCEEDED') {
              setStatus('quota_exceeded');
            }
            setErrorMessage(msg.message);
            cleanupAll();
            break;
        }
      } catch (err) {
        console.error('Error procesando mensaje WebSocket Live:', err);
      }
    };

    ws.onerror = () => {
      if (!isClosingRef.current) {
        setStatus('error');
        setErrorMessage('Error de conexión WebSocket con el servidor de Gemini Live.');
      }
      cleanupAll();
    };

    ws.onclose = (e) => {
      if (e.code === 4003) {
        setStatus('quota_exceeded');
        setErrorMessage('Límite de concurrencia alcanzado (máx 3 sesiones simultáneas). Intenta en unos segundos.');
      }
      if (!isClosingRef.current && status !== 'error') {
        setStatus('idle');
      }
      cleanupAll();
    };
  }, [cleanupAll, finishPetition, options, status]);

  // Usuario indica que terminó de hablar ("Listo" o detener escucha)
  const stopAndProcess = useCallback(() => {
    // 1. Detener captura del micrófono local
    if (audioCaptureRef.current) {
      audioCaptureRef.current.stop();
      audioCaptureRef.current = null;
    }
    // 2. Notificar al backend que finalizó el audio del usuario para que Gemini comience la respuesta
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'finish_speaking' }));
    }
    setStatus('processing');
  }, []);

  // Cancelar petición en curso y volver a reposo
  const stopListening = useCallback(() => {
    finishPetition();
  }, [finishPetition]);

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      cleanupAll();
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
