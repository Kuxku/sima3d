import { useState } from 'react';
import { V2_CONFIG, type FeatureFlags } from '../config';

interface FlagControlsProps {
  flags: FeatureFlags;
  onToggleFlag: (key: keyof FeatureFlags) => void;
}

export function FlagControls({ flags, onToggleFlag }: FlagControlsProps) {
  const [collapsed, setCollapsed] = useState(true);

  const flagDescriptions: Record<keyof FeatureFlags, string> = {
    improvedLayout: 'Mejora 1: Layout jerárquico 3D y repulsión',
    autoFit: 'Mejora 2: Auto-centrado y botón reencuadre',
    smartEdges: 'Mejora 3: Aristas inteligentes y jerarquía',
    particles: 'Mejora 3b: Partículas en enlaces activos',
    labels: 'Mejora 4: Etiquetas fijas y tooltips ricos',
    depthStyle: 'Mejora 5: Estilo visual, niebla y paleta accesible',
    uiPolish: 'Mejora 6: UI pulida y modo presentación',
  };

  return (
    <div className={`v2-flag-panel ${collapsed ? 'collapsed' : ''}`}>
      <div className="v2-flag-panel-header" onClick={() => setCollapsed(!collapsed)}>
        <span className="v2-badge">v2 Flags</span>
        <span className="v2-flag-title">Control de Mejoras</span>
        <button className="v2-toggle-btn" type="button">
          {collapsed ? '⚙️ Ajustes' : '✕ Cerrar'}
        </button>
      </div>

      {!collapsed && (
        <div className="v2-flag-list">
          {(Object.keys(flags) as Array<keyof FeatureFlags>).map((key) => (
            <label key={key} className="v2-flag-item">
              <input
                type="checkbox"
                checked={flags[key]}
                onChange={() => onToggleFlag(key)}
              />
              <div className="v2-flag-info">
                <span className="v2-flag-name">{key}</span>
                <span className="v2-flag-desc">{flagDescriptions[key]}</span>
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
