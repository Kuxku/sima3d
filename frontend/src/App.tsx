import { useEffect, useState, useRef, useMemo, useCallback, memo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { GraphService, CopilotService } from './services/api';
import type { GraphPayload, GraphNode } from './types/graph';
import { NetworkGraph } from './components/NetworkGraph';
import { JarvisVoiceAssistant } from './components/JarvisVoiceAssistant';
import { ChatPanel, type ChatMessage } from './components/ChatPanel';
import type { JarvisActionPayload } from './hooks/useJarvisVoice';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import './App.css';

// Función pura para calcular las posiciones 3D centradas y comprimidas
function computeNodePositions(nodes: GraphNode[]): Map<string, THREE.Vector3> {
  const positions = new Map<string, THREE.Vector3>();
  if (!nodes || nodes.length === 0) return positions;

  const GRAPH_SCALE = 0.35;
  const MAX_ORBIT = 25;

  let sumX = 0, sumY = 0, sumZ = 0;
  nodes.forEach((n) => {
    sumX += (n.position?.x || 0) * GRAPH_SCALE;
    sumY += (n.position?.y || 0) * GRAPH_SCALE;
    sumZ += (n.position?.z || 0) * GRAPH_SCALE;
  });
  const rawCentroid = new THREE.Vector3(
    sumX / nodes.length,
    sumY / nodes.length,
    sumZ / nodes.length
  );

  nodes.forEach((n) => {
    const x = (n.position?.x || 0) * GRAPH_SCALE - rawCentroid.x;
    const y = (n.position?.y || 0) * GRAPH_SCALE - rawCentroid.y;
    const z = (n.position?.z || 0) * GRAPH_SCALE - rawCentroid.z;

    const vec = new THREE.Vector3(x, y, z);
    const dist = vec.length();

    if (dist > MAX_ORBIT) {
      vec.normalize().multiplyScalar(MAX_ORBIT + Math.log10(dist - MAX_ORBIT + 1) * 2);
    }
    positions.set(n.id, vec);
  });

  let finalSumX = 0, finalSumY = 0, finalSumZ = 0;
  positions.forEach((pos) => {
    finalSumX += pos.x;
    finalSumY += pos.y;
    finalSumZ += pos.z;
  });
  const finalCentroid = new THREE.Vector3(
    finalSumX / positions.size,
    finalSumY / positions.size,
    finalSumZ / positions.size
  );

  positions.forEach((pos, id) => {
    positions.set(id, pos.sub(finalCentroid));
  });

  return positions;
}

// Controlador de vuelo suave de cámara (Interpolación Lerp a 60 FPS)
function CameraRig({
  targetPos,
  controlsRef,
}: {
  targetPos: THREE.Vector3 | null;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();
  const isAnimating = useRef(false);
  const desiredCameraPos = useRef(new THREE.Vector3(0, 0, 30));
  const desiredTarget = useRef(new THREE.Vector3(0, 0, 0));

  useEffect(() => {
    if (targetPos) {
      desiredTarget.current.copy(targetPos);
      desiredCameraPos.current.set(targetPos.x, targetPos.y + 1.5, targetPos.z + 9);
      isAnimating.current = true;
    } else {
      desiredTarget.current.set(0, 0, 0);
      desiredCameraPos.current.set(0, 0, 30);
      isAnimating.current = true;
    }
  }, [targetPos]);

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

// Subcomponente memoizado del Canvas 3D para evitar re-renderizados innecesarios
interface SceneCanvasProps {
  graphData: GraphPayload;
  nodePositions: Map<string, THREE.Vector3>;
  selectedNode: GraphNode | null;
  highlightedIds: string[];
  cameraTarget: THREE.Vector3 | null;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  onSelectNode: (node: GraphNode | null) => void;
}

const SceneCanvas = memo(function SceneCanvas({
  graphData,
  nodePositions,
  selectedNode,
  highlightedIds,
  cameraTarget,
  controlsRef,
  onSelectNode,
}: SceneCanvasProps) {
  return (
    <div className="canvas-wrapper">
      <Canvas
        camera={{ position: [0, 0, 30], fov: 50 }}
        dpr={[1, 1.5]}
        gl={{ powerPreference: 'high-performance', antialias: false }}
      >
        <ambientLight intensity={0.35} />
        <pointLight position={[20, 20, 20]} intensity={2.0} color="#ffffff" />
        <directionalLight position={[-20, -15, -10]} intensity={0.8} color="#38bdf8" />

        <NetworkGraph
          data={graphData}
          nodePositions={nodePositions}
          selectedNode={selectedNode}
          highlightedIds={highlightedIds}
          onSelectNode={onSelectNode}
        />

        <CameraRig targetPos={cameraTarget} controlsRef={controlsRef} />

        <EffectComposer>
          <Bloom
            luminanceThreshold={0.22}
            luminanceSmoothing={0.85}
            intensity={1.15}
            mipmapBlur
          />
        </EffectComposer>

        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          dampingFactor={0.06}
          maxDistance={90}
          minDistance={3}
        />
      </Canvas>
    </div>
  );
});

function App() {
  const [graphData, setGraphData] = useState<GraphPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Estados de interacción 3D
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);
  const [cameraTarget, setCameraTarget] = useState<THREE.Vector3 | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  // Estados del Copilot
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      sender: 'bot',
      text: 'Sistema SIMA-3D en línea. Selecciona cualquier nodo en la constelación o haz una consulta analítica para explorar la red educativa.',
    },
  ]);
  const [sending, setSending] = useState(false);

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

  const nodePositions = useMemo(() => {
    return graphData ? computeNodePositions(graphData.nodes) : new Map<string, THREE.Vector3>();
  }, [graphData]);

  // Seleccionar un nodo manualmente y volar hacia él
  const handleSelectNode = useCallback((node: GraphNode | null) => {
    setSelectedNode(node);
    if (node) {
      const pos = nodePositions.get(node.id);
      if (pos) setCameraTarget(pos.clone());
    } else {
      setHighlightedIds([]);
      setCameraTarget(null);
    }
  }, [nodePositions]);

  const handleResetView = useCallback(() => {
    setSelectedNode(null);
    setHighlightedIds([]);
    setCameraTarget(null);
  }, []);

  const handleFocusNodeById = useCallback((nodeId: string) => {
    if (!graphData) return;
    const targetNode = graphData.nodes.find((n) => n.id === nodeId);
    if (targetNode) {
      handleSelectNode(targetNode);
    }
  }, [graphData, handleSelectNode]);

  // Enviar consulta al Copilot y ejecutar comandos de cámara automáticos
  const sendQuery = useCallback(async (queryText: string) => {
    if (!queryText.trim() || sending) return;

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
  }, [sending, selectedNode, graphData, nodePositions, handleResetView]);

  const handleJarvisAction = useCallback((payload: JarvisActionPayload) => {
    if (payload.action === 'reset_view') {
      handleResetView();
      return;
    }
    if (payload.highlighted_node_ids && payload.highlighted_node_ids.length > 0) {
      setHighlightedIds(payload.highlighted_node_ids);
    }
    if (payload.camera_command) {
      const { action, target_node_id } = payload.camera_command;
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
  }, [graphData, nodePositions, handleResetView]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <div className="loading-text">SINCRONIZANDO TOPOLOGÍA 3D...</div>
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
      {/* 1. LIENZO WEBGL MEMOIZADO (Aislado de inputs de texto) */}
      <SceneCanvas
        graphData={graphData}
        nodePositions={nodePositions}
        selectedNode={selectedNode}
        highlightedIds={highlightedIds}
        cameraTarget={cameraTarget}
        controlsRef={controlsRef}
        onSelectNode={handleSelectNode}
      />

      {/* 2. BARRA SUPERIOR HUD */}
      <header className="hud-topbar">
        <div className="brand-block">
          <div className="brand-logo">
            <span className="pulse-dot" />
            SIMA-3D
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

          {(selectedNode || highlightedIds.length > 0 || cameraTarget) && (
            <button className="reset-view-btn" onClick={handleResetView}>
              ⟲ Vista General
            </button>
          )}
        </div>
      </header>

      {/* 3. PANEL LATERAL FLOTANTE: COPILOT IA */}
      <ChatPanel
        messages={messages}
        sending={sending}
        selectedNode={selectedNode}
        onSendMessage={sendQuery}
        onFocusNode={handleFocusNodeById}
      />

      {/* 4. TARJETA INSPECTORA DE NODO SELECCIONADO */}
      {selectedNode && (
        <section className="hud-inspector">
          <div className="inspector-header">
            <span className={`node-type-tag ${selectedNode.type}`}>
              {selectedNode.type.toUpperCase()}
            </span>
            <button className="close-btn" onClick={() => handleSelectNode(null)}>
              ✕
            </button>
          </div>
          <h4 className="inspector-title">{selectedNode.label}</h4>
          <p className="inspector-id">{selectedNode.id}</p>

          <div className="inspector-metrics">
            <div className="metric-box">
              <span className="metric-name">Volumen Estudiantes</span>
              <span className="metric-val">
                {selectedNode.metrics.volume.toLocaleString()}
              </span>
            </div>
            <div className="metric-box">
              <span className="metric-name">Estrato Mediano</span>
              <span className="metric-val">
                {selectedNode.metrics.estrato_median ?? 'N/A'}
              </span>
            </div>
            <div className="metric-box">
              <span className="metric-name">Participación Rural</span>
              <span className="metric-val">
                {((selectedNode.metrics.rural_share || 0) * 100).toFixed(1)}%
              </span>
            </div>
            {selectedNode.metrics.degree !== undefined && (
              <div className="metric-box">
                <span className="metric-name">Conexiones Directas</span>
                <span className="metric-val">{selectedNode.metrics.degree}</span>
              </div>
            )}
          </div>

          <button
            className="ask-ai-node-btn"
            onClick={() =>
              sendQuery(`Analiza el perfil e impacto de ${selectedNode.label} en la red.`)
            }
            disabled={sending}
          >
            Analizar con Copilot
          </button>
        </section>
      )}

      {/* 5. LEYENDA INFERIOR DERECHA */}
      <footer className="hud-legend">
        <div className="legend-item">
          <span className="legend-dot comuna" /> Comunas
        </div>
        <div className="legend-item">
          <span className="legend-dot colegio" /> Colegios
        </div>
        <div className="legend-item">
          <span className="legend-dot facultad" /> Facultades
        </div>
      </footer>

      {/* 6. ASISTENTE DE VOZ JARVIS */}
      <JarvisVoiceAssistant
        selectedNodeId={selectedNode?.id || null}
        onActionExecuted={handleJarvisAction}
        onUserMessage={(text) => setMessages((prev) => [...prev, { sender: 'user', text }])}
        onAssistantMessage={(text) => setMessages((prev) => [...prev, { sender: 'bot', text }])}
      />
    </div>
  );
}

export default App;
