import React, { useState } from 'react';
import { useJarvisVoice } from '../hooks/useJarvisVoice';
import type { JarvisActionPayload } from '../hooks/useJarvisVoice';
import './JarvisVoiceAssistant.css';

interface JarvisVoiceAssistantProps {
  selectedNodeId?: string | null;
  onActionExecuted?: (action: JarvisActionPayload) => void;
  onUserMessage?: (text: string) => void;
  onAssistantMessage?: (text: string) => void;
}

export const JarvisVoiceAssistant: React.FC<JarvisVoiceAssistantProps> = ({
  selectedNodeId,
  onActionExecuted,
  onUserMessage,
  onAssistantMessage,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const {
    status,
    userTranscript,
    assistantReply,
    lastExecutedAction,
    errorMessage,
    startListening,
    stopAndProcess,
    stopListening,
    interruptAssistant,
  } = useJarvisVoice({
    selectedNodeId,
    onActionExecuted,
    onUserMessage,
    onAssistantMessage,
  });

  const isActive = status === 'listening' || status === 'speaking' || status === 'processing' || status === 'executing_action';

  return (
    <div className={`jarvis-container ${isOpen ? 'open' : 'minimized'}`}>
      {/* Botón Flotante para Abrir/Cerrar Asistente */}
      {!isOpen && (
        <button
          className={`jarvis-floating-trigger ${isActive ? 'active' : ''}`}
          onClick={() => setIsOpen(true)}
          title="Abrir Asistente de Voz SIMA-3D"
        >
          <div className="jarvis-orb">
            <span className="orb-core" />
            <span className="orb-ring" />
          </div>
          <span className="jarvis-trigger-label">SIMA 3D VOZ</span>
          {isActive && <span className="jarvis-pulse-dot" />}
        </button>
      )}

      {/* Panel Principal */}
      {isOpen && (
        <div className="jarvis-panel">
          {/* Cabecera */}
          <div className="jarvis-header">
            <div className="jarvis-title-group">
              <div className="jarvis-orb-mini">
                <span className="orb-core-mini" />
              </div>
              <div className="jarvis-title-text">
                <h3>SIMA 3D // ASISTENTE DE VOZ</h3>
                <span className="jarvis-subtitle">Interacción por petición vía Gemini Multimodal Live</span>
              </div>
            </div>

            <div className="jarvis-header-actions">
              <button
                className="jarvis-icon-btn"
                onClick={() => setShowHelp(!showHelp)}
                title="Información del asistente"
              >
                ℹ️
              </button>
              <button
                className="jarvis-icon-btn close"
                onClick={() => setIsOpen(false)}
                title="Minimizar Asistente"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Ficha Explicativa */}
          {showHelp && (
            <div className="jarvis-help-banner">
              <p>
                <strong>Modo Petición Directa:</strong> Cada consulta abre un canal de audio en tiempo real con Gemini Live.
                Al responder la pregunta o ejecutar la acción 3D en el grafo, la petición finaliza de inmediato liberando el micrófono y los recursos de red.
              </p>
              <p>
                Totalmente compatible con navegadores con protecciones estrictas de privacidad (como Brave).
              </p>
            </div>
          )}

          {/* Estado Visual y Ondas Sonoras */}
          <div className={`jarvis-status-card ${status}`}>
            <div className="status-indicator">
              <span className={`status-badge-dot ${status}`} />
              <span className="status-text">
                {status === 'idle' && 'Listo para recibir tu consulta'}
                {status === 'requesting_mic' && 'Solicitando acceso al micrófono...'}
                {status === 'listening' && 'Escuchando tu pregunta...'}
                {status === 'processing' && 'Analizando consulta en Gemini...'}
                {status === 'speaking' && 'SIMA 3D está respondiendo'}
                {status === 'executing_action' && 'Ejecutando acción en el grafo 3D'}
                {status === 'reconnecting' && 'Reconectando sesión...'}
                {status === 'warning' && 'Aviso de sesión'}
                {status === 'quota_exceeded' && 'Límite de cuota alcanzado'}
                {status === 'error' && 'Error de comunicación'}
                {status === 'session_closed' && 'Petición finalizada'}
              </span>
            </div>

            {/* Visualizador de Onda Sonora */}
            <div className={`audio-visualizer ${status === 'listening' || status === 'speaking' ? 'active' : ''}`}>
              <span className="bar b1" />
              <span className="bar b2" />
              <span className="bar b3" />
              <span className="bar b4" />
              <span className="bar b5" />
              <span className="bar b6" />
              <span className="bar b7" />
            </div>
          </div>

          {/* Alertas y Errores */}
          {errorMessage && (
            <div className="jarvis-error-banner">
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Acción Ejecutada */}
          {lastExecutedAction && (
            <div className="jarvis-action-badge">
              <span className="action-text">{lastExecutedAction}</span>
            </div>
          )}

          {/* Transcripción en Directo */}
          <div className="jarvis-transcripts">
            {userTranscript && (
              <div className="transcript-row user">
                <span className="transcript-label">Tú:</span>
                <p className="transcript-content">{userTranscript}</p>
              </div>
            )}
            {assistantReply && (
              <div className="transcript-row assistant">
                <span className="transcript-label">SIMA 3D:</span>
                <p className="transcript-content">{assistantReply}</p>
              </div>
            )}
            {!userTranscript && !assistantReply && (
              <div className="transcript-placeholder">
                <span>Di por ejemplo: <em>"Enfoca Robledo"</em>, <em>"¿Cuáles son las comunas con mayor flujo?"</em> o <em>"Muestra las facultades"</em></span>
              </div>
            )}
          </div>

          {/* Botonera de Control */}
          <div className="jarvis-controls">
            {status === 'idle' || status === 'error' || status === 'quota_exceeded' || status === 'session_closed' ? (
              <button
                className="jarvis-main-action-btn"
                onClick={startListening}
              >
                <span>Hacer una consulta por voz</span>
              </button>
            ) : status === 'listening' ? (
              <div className="jarvis-listening-actions">
                <button
                  className="jarvis-main-action-btn listening ready-btn"
                  onClick={stopAndProcess}
                  title="Finalizar de hablar y procesar respuesta"
                >
                  <span className="mic-icon">✓</span>
                  <span>Listo / Procesar</span>
                </button>
                <button
                  className="jarvis-cancel-btn"
                  onClick={stopListening}
                  title="Cancelar consulta"
                >
                  ✕
                </button>
              </div>
            ) : status === 'processing' || status === 'executing_action' || status === 'requesting_mic' ? (
              <button
                className="jarvis-main-action-btn processing"
                disabled
              >
                <span>Procesando consulta...</span>
              </button>
            ) : (
              <button
                className="jarvis-interrupt-btn"
                onClick={interruptAssistant}
              >
                <span>Finalizar respuesta</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
