import { useEffect, useState, useRef, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { GraphService, CopilotService } from '../services/api';
import type { GraphPayload, GraphNode, CameraCommand } from '../types/graph';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { V2_CONFIG, type FeatureFlags } from './config';
import { computeHierarchicalPositions, computeOriginalPositions } from './layout/hierarchicalLayout';
import { NetworkGraphV2 } from './components/NetworkGraphV2';
import { FlagControls } from './components/FlagControls';
import { FeatureBoundary } from './components/FeatureBoundary';
import { AutoFitCamera } from './components/AutoFitCamera';
import { DepthFog } from './components/DepthFog';
import './v2.css';

// Rig de cámara suave para enfoque de nodos
function CameraRigV2({
  targetPos,
  controlsRef,
  autoFitEnabled,
}: {
  targetPos: THREE.Vector3 | null;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  autoFitEnabled: boolean;
}) {
  const { camera } = useThree();
  const isAnimating = useRef(false);
  const desiredCameraPos = useRef(new THREE.Vector3(0, 0, 38));
  const desiredTarget = useRef(new THREE.Vector3(0, 0, 0));

  useEffect(() => {
    if (targetPos) {
      desiredTarget.current.copy(targetPos);
      desiredCameraPos.current.set(targetPos.x, targetPos.y + 1.5, targetPos.z + 10);
      isAnimating.current = true;
    } else if (!autoFitEnabled) {
      desiredTarget.current.set(0, 0, 0);
      desiredCameraPos.current.set(0, 0, 38);
      isAnimating.current = true;
    }
  }, [targetPos, autoFitEnabled]);

  useFrame((_, delta) => {
    if (!isAnimating.current || !controlsRef.current) return;

    const step = 4.5 * delta;
    camera.position.lerp(desiredCameraPos.current, step);
    controlsRef.current.target.lerp(desiredTarget.current, step);
    controlsRef.current.update();

    if (
      camera.position.distanceTo(desiredCameraPos.current) < 0.15 &&
      controlsRef.current.target.distanceTo(desiredTarget.current) < 0.15
    ) {
      isAnimating.current = false;
    }
  });

  return null;
}

interface ChatMessage {
  sender: 'user' | 'bot';
  text: string;
  command?: CameraCommand | null;
}

const QUICK_PROMPTS = [
  '¿Cuál es la comuna con más estudiantes?',
  '¿Qué colegios destacan en la red?',
  '¿Cuáles son las facultades con mayor volumen?',
];

export function AppV2() {
  const [flags, setFlags] = useState<FeatureFlags>({ ...V2_CONFIG.flags });
  const [graphData, setGraphData] = useState<GraphPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Estados de interacción 3D
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);
  const [cameraTarget, setCameraTarget] = useState<THREE.Vector3 | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  // Estados del Copilot
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      sender: 'bot',
      text: 'SIMA-3D v2 en línea con arquitectura modular. Explora el grafo con layout jerárquico.',
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [fitTrigger, setFitTrigger] = useState(0);

  // Estados de Mejora 6 (uiPolish)
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [activeTypeFilter, setActiveTypeFilter] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleRefit = () => {
    setSelectedNode(null);
    setHighlightedIds([]);
    setCameraTarget(null);
    setActiveTypeFilter(null);
    setFitTrigger((prev) => prev + 1);
  };

  const handleToggleTypeFilter = (type: string) => {
    if (!flags.uiPolish) return;
    setActiveTypeFilter((prev) => (prev === type ? null : type));
  };

  const toggleFlag = (key: keyof FeatureFlags) => {
    setFlags((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      V2_CONFIG.flags[key] = next[key];
      return next;
    });
  };

  useEffect(() => {
    const loadGraph = async () => {
      try {
        const data = await GraphService.getGraph();
        setGraphData(data);
      } catch (err) {
        setError('No se pudo establecer conexión con el servidor FastAPI (Puerto 8000).');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadGraph();
  }, []);

  // Cálculo de posiciones de nodos dependiente de la flag improvedLayout
  const nodePositions = useMemo(() => {
    if (!graphData) return new Map<string, THREE.Vector3>();
    if (flags.improvedLayout) {
      return computeHierarchicalPositions(graphData.nodes, graphData.edges);
    }
    return computeOriginalPositions(graphData.nodes);
  }, [graphData, flags.improvedLayout]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelectNode = (node: GraphNode | null) => {
    setSelectedNode(node);
    if (node) {
      const pos = nodePositions.get(node.id);
      if (pos) setCameraTarget(pos.clone());
    } else {
      setHighlightedIds([]);
      setCameraTarget(null);
    }
  };

  const handleResetView = () => {
    setSelectedNode(null);
    setHighlightedIds([]);
    setCameraTarget(null);
  };

  const sendQuery = async (queryText: string) => {
    if (!queryText.trim() || sending) return;

    setInputValue('');
    setMessages((prev) => [...prev, { sender: 'user', text: queryText }]);
    setSending(true);

    try {
      const response = await CopilotService.chat(queryText, selectedNode?.id || null);
      setMessages((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: response.answer,
          command: response.camera_command,
        },
      ]);

      if (response.highlighted_node_ids && Array.isArray(response.highlighted_node_ids)) {
        setHighlightedIds(response.highlighted_node_ids);
      }

      if (response.camera_command) {
        const { action, target_node_id } = response.camera_command;
        if (action === 'focus_node' && target_node_id && graphData) {
          const targetNode = graphData.nodes.find((n) => n.id === target_node_id);
          if (targetNode) {
            setSelectedNode(targetNode);
            const pos = nodePositions.get(targetNode.id);
            if (pos) setCameraTarget(pos.clone());
          }
        } else if (action === 'reset_view') {
          handleResetView();
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { sender: 'bot', text: 'Error de comunicación con el motor analítico de Gemini.' },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    sendQuery(inputValue);
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <div className="loading-text">SINCRONIZANDO TOPOLOGÍA 3D (V2)...</div>
      </div>
    );
  }

  if (error || !graphData) {
    return (
      <div className="loading-screen error">
        <div className="error-box">
          <h3>Fallo de Conexión</h3>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sima-viewport">
      {/* 1. LIENZO WEBGL A PANTALLA COMPLETA */}
      <div className="canvas-wrapper">
        <Canvas camera={{ position: [0, 0, 38], fov: 50 }}>
          <ambientLight intensity={0.35} />
          <pointLight position={[20, 20, 20]} intensity={2.0} color="#ffffff" />
          <directionalLight position={[-20, -15, -10]} intensity={0.8} color="#38bdf8" />

          <FeatureBoundary featureName="DepthFog">
            <DepthFog enabled={flags.depthStyle} />
          </FeatureBoundary>

          <FeatureBoundary featureName="NetworkGraphV2">
            <NetworkGraphV2
              data={graphData}
              nodePositions={nodePositions}
              selectedNode={selectedNode}
              highlightedIds={highlightedIds}
              onSelectNode={handleSelectNode}
              onHoverNode={setHoveredNode}
              smartEdgesEnabled={flags.smartEdges}
              particlesEnabled={flags.particles}
              labelsEnabled={flags.labels}
              depthStyleEnabled={flags.depthStyle}
              filterType={activeTypeFilter}
            />
          </FeatureBoundary>

          <FeatureBoundary featureName="AutoFitCamera">
            <AutoFitCamera
              nodePositions={nodePositions}
              controlsRef={controlsRef}
              enabled={flags.autoFit}
              targetPos={cameraTarget}
              fitTrigger={fitTrigger}
            />
          </FeatureBoundary>

          <CameraRigV2
            targetPos={cameraTarget}
            controlsRef={controlsRef}
            autoFitEnabled={flags.autoFit}
          />

          <EffectComposer>
            <Bloom
              luminanceThreshold={flags.depthStyle ? 0.22 : 0.18}
              luminanceSmoothing={0.9}
              intensity={flags.depthStyle ? V2_CONFIG.depth.bloomIntensity : 1.35}
            />
          </EffectComposer>

          <OrbitControls
            ref={controlsRef}
            makeDefault
            enableDamping
            dampingFactor={0.06}
            maxDistance={140}
            minDistance={3}
          />
        </Canvas>
      </div>

      {/* Control de Feature Flags */}
      <FlagControls flags={flags} onToggleFlag={toggleFlag} />

      {/* 2. BARRA SUPERIOR HUD */}
      <header className="hud-topbar">
        <div className="brand-block">
          <div className="brand-logo">
            <span className="pulse-dot" />
            SIMA-3D <span className="v2-version-tag">v2</span>
          </div>
          <span className="brand-subtitle">Inteligencia Espacial Educativa</span>
        </div>

        <div className="kpi-group">
          <div className="kpi-pill">
            <span className="kpi-label">ESTUDIANTES</span>
            <span className="kpi-value">
              {graphData.meta.total_records?.toLocaleString() || 'N/A'}
            </span>
          </div>
          <div className="kpi-pill">
            <span className="kpi-label">NODOS ACTIVOS</span>
            <span className="kpi-value">{graphData.meta.node_count}</span>
          </div>
          <div className="kpi-pill">
            <span className="kpi-label">CONEXIONES</span>
            <span className="kpi-value">{graphData.meta.edge_count}</span>
          </div>

          {/* Botón Reencuadrar para volver a la vista completa (Mejora 2) */}
          {flags.autoFit && (
            <button
              className="v2-refit-btn"
              onClick={handleRefit}
              title="Ajustar y centrar todos los nodos en pantalla"
            >
              ⛶ Reencuadrar
            </button>
          )}

          {(selectedNode || highlightedIds.length > 0 || cameraTarget) && (
            <button className="reset-view-btn" onClick={handleResetView}>
              ⟲ Vista General
            </button>
          )}
        </div>
      </header>

      {/* Pestaña flotante para reabrir chat cuando está colapsado (Mejora 6) */}
      {flags.uiPolish && chatCollapsed && (
        <button
          className="v2-open-chat-tab"
          onClick={() => setChatCollapsed(false)}
          title="Abrir Copilot Analítico"
        >
          <span className="ai-badge">IA</span>
          <span>Abrir Chat Copilot</span>
        </button>
      )}

      {/* 3. PANEL LATERAL FLOTANTE: COPILOT IA (Colapsable en Mejora 6) */}
      <aside
        className={`hud-sidebar ${
          flags.uiPolish && chatCollapsed ? 'collapsed' : ''
        }`}
      >
        <div className="sidebar-header">
          <div className="sidebar-title-row">
            <span className="ai-badge">IA</span>
            <h3>Copilot Analítico</h3>
            {flags.uiPolish && (
              <button
                className="v2-collapse-chat-btn"
                onClick={() => setChatCollapsed(true)}
                title="Minimizar panel de chat"
              >
                ◀
              </button>
            )}
          </div>
          <p>Impulsado por Gemini 3.8 Flash</p>
        </div>

        <div className="chat-messages">
          {messages.map((msg, idx) => (
            <div key={idx} className={`chat-bubble ${msg.sender}`}>
              <div className="bubble-text">{msg.text}</div>
              {msg.command && msg.command.target_node_id && (
                <div
                  className="camera-action-tag"
                  onClick={() => {
                    const node = graphData.nodes.find(
                      (n) => n.id === msg.command?.target_node_id
                    );
                    if (node) handleSelectNode(node);
                  }}
                >
                  <span>🎯 Enfoque: {msg.command.target_node_id}</span>
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

        {/* Sugerencias rápidas (Wrap en Mejora 6) */}
        <div className="quick-prompts">
          {QUICK_PROMPTS.map((prompt, i) => (
            <button
              key={i}
              className="prompt-chip"
              onClick={() => sendQuery(prompt)}
              disabled={sending}
            >
              {prompt}
            </button>
          ))}
        </div>

        <form onSubmit={handleSendMessage} className="chat-input-bar">
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

      {/* 4. TARJETA INSPECTORA LATERAL DERECHA (Hover o Selección) */}
      {(() => {
        const activeDetailNode = hoveredNode || selectedNode;
        const isPinned = selectedNode !== null && selectedNode.id === activeDetailNode?.id;

        if (!activeDetailNode) {
          return (
            <aside className="v2-lateral-inspector standby">
              <div className="standby-header">
                <span className="standby-icon">✦</span>
                <span className="standby-title">Telemetría de Red</span>
              </div>
              <p className="standby-hint">
                Pasa el cursor sobre cualquier nodo o selecciónalo para ver sus métricas y relaciones en este panel.
              </p>
            </aside>
          );
        }

        return (
          <aside className={`v2-lateral-inspector active ${isPinned ? 'pinned' : 'preview'}`}>
            <div className="inspector-header">
              <div className="inspector-badge-row">
                <span className={`node-type-tag ${activeDetailNode.type}`}>
                  {activeDetailNode.type.toUpperCase()}
                </span>
                <span className={`inspector-mode-tag ${isPinned ? 'pinned' : 'preview'}`}>
                  {isPinned ? '● FIJADO' : '○ VISTA PREVIA'}
                </span>
              </div>
              {isPinned && (
                <button
                  className="close-btn"
                  onClick={() => handleSelectNode(null)}
                  title="Desfijar nodo"
                >
                  ✕
                </button>
              )}
            </div>

            <h4 className="inspector-title">{activeDetailNode.label}</h4>
            <p className="inspector-id">{activeDetailNode.id}</p>

            <div className="inspector-metrics">
              <div className="metric-box">
                <span className="metric-name">Volumen Estudiantes</span>
                <span className="metric-val">
                  {activeDetailNode.metrics.volume.toLocaleString()}
                </span>
              </div>
              <div className="metric-box">
                <span className="metric-name">Estrato Mediano</span>
                <span className="metric-val">
                  {activeDetailNode.metrics.estrato_median ?? 'N/A'}
                </span>
              </div>
              <div className="metric-box">
                <span className="metric-name">Participación Rural</span>
                <span className="metric-val">
                  {((activeDetailNode.metrics.rural_share || 0) * 100).toFixed(1)}%
                </span>
              </div>
              {activeDetailNode.metrics.degree !== undefined && (
                <div className="metric-box">
                  <span className="metric-name">Conexiones Directas</span>
                  <span className="metric-val">{activeDetailNode.metrics.degree}</span>
                </div>
              )}
            </div>

            <button
              className="ask-ai-node-btn"
              onClick={() => {
                handleSelectNode(activeDetailNode);
                sendQuery(`Analiza el perfil e impacto de ${activeDetailNode.label} en la red.`);
              }}
              disabled={sending}
            >
              ✨ Analizar con Copilot
            </button>
          </aside>
        );
      })()}

      {/* 5. LEYENDA INTERACTIVA INFERIOR DERECHA (Mejora 6) */}
      <footer className={`hud-legend ${flags.uiPolish ? 'interactive' : ''}`}>
        <div
          className={`legend-item ${flags.uiPolish ? 'clickable' : ''} ${
            activeTypeFilter === 'comuna' ? 'active' : activeTypeFilter ? 'dimmed' : ''
          }`}
          onClick={() => handleToggleTypeFilter('comuna')}
          title={flags.uiPolish ? 'Clic para filtrar Comunas' : undefined}
        >
          <span className="legend-dot comuna" /> Comunas
        </div>
        <div
          className={`legend-item ${flags.uiPolish ? 'clickable' : ''} ${
            activeTypeFilter === 'colegio' ? 'active' : activeTypeFilter ? 'dimmed' : ''
          }`}
          onClick={() => handleToggleTypeFilter('colegio')}
          title={flags.uiPolish ? 'Clic para filtrar Colegios' : undefined}
        >
          <span className="legend-dot colegio" /> Colegios
        </div>
        <div
          className={`legend-item ${flags.uiPolish ? 'clickable' : ''} ${
            activeTypeFilter === 'facultad' ? 'active' : activeTypeFilter ? 'dimmed' : ''
          }`}
          onClick={() => handleToggleTypeFilter('facultad')}
          title={flags.uiPolish ? 'Clic para filtrar Facultades' : undefined}
        >
          <span className="legend-dot facultad" /> Facultades
        </div>
      </footer>
    </div>
  );
}

export default AppV2;
