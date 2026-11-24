import React, { useState, useRef, useEffect, memo } from 'react';
import type { GraphNode, CameraCommand } from '../types/graph';

export interface ChatMessage {
  sender: 'user' | 'bot';
  text: string;
  command?: CameraCommand | null;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  sending: boolean;
  selectedNode: GraphNode | null;
  onSendMessage: (queryText: string) => void;
  onFocusNode: (nodeId: string) => void;
}

const QUICK_PROMPTS = [
  '¿Cuál es la comuna con más estudiantes?',
  '¿Qué colegios destacan en la red?',
  '¿Cuáles son las facultades con mayor volumen?',
];

export const ChatPanel = memo(function ChatPanel({
  messages,
  sending,
  selectedNode,
  onSendMessage,
  onFocusNode,
}: ChatPanelProps) {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || sending) return;
    const query = inputValue;
    setInputValue('');
    onSendMessage(query);
  };

  const handlePromptClick = (prompt: string) => {
    if (sending) return;
    onSendMessage(prompt);
  };

  return (
    <aside className="hud-sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title-row">
          <span className="ai-badge">IA</span>
          <h3>Copilot Analítico</h3>
        </div>
        <p>Impulsado por Gemini 3.1 Flash</p>
      </div>

      <div className="chat-messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`chat-bubble ${msg.sender}`}>
            <div className="bubble-text">{msg.text}</div>
            {msg.command && msg.command.target_node_id && (
              <div
                className="camera-action-tag"
                onClick={() => onFocusNode(msg.command!.target_node_id!)}
              >
                <span>Enfoque: {msg.command.target_node_id}</span>
              </div>
            )}
          </div>
        ))}
        {sending && (
          <div className="chat-bubble bot typing">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Sugerencias rápidas */}
      <div className="quick-prompts">
        {QUICK_PROMPTS.map((prompt, i) => (
          <button
            key={i}
            className="prompt-chip"
            onClick={() => handlePromptClick(prompt)}
            disabled={sending}
          >
            {prompt}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="chat-input-bar">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={
            selectedNode
              ? `Preguntar sobre ${selectedNode.label}...`
              : 'Consulta sobre comunas, colegios...'
          }
        />
        <button type="submit" disabled={sending || !inputValue.trim()}>
          ↵
        </button>
      </form>
    </aside>
  );
});

