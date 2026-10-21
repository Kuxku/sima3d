import { useState, useEffect } from 'react';
import type { FeatureFlags } from '../config';

interface FlagControlsProps {
  flags: FeatureFlags;
  onToggleFlag: (key: keyof FeatureFlags) => void;
  onResetDefaults?: () => void;
  onEnableAll?: () => void;
}

export function FlagControls({
  flags,
  onToggleFlag,
  onResetDefaults,
  onEnableAll,
}: FlagControlsProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Cerrar con la tecla Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const flagMetadata: Record<
    keyof FeatureFlags,
    { title: string; badge: string; desc: string }
  > = {
    improvedLayout: {
      title: 'Layout Jerárquico 3D',
      badge: 'Mejora 1',
      desc: 'Distribuye facultades como hubs exteriores, colegios en órbita y comunas en centro de gravedad sin solapamiento.',
    },
    autoFit: {
      title: 'Encuadre y Centrado Dinámico',
      badge: 'Mejora 2',
      desc: 'Calcula la esfera envolvente en tiempo real y ofrece el botón ⛶ Reencuadrar para volver a la constelación completa.',
    },
    smartEdges: {
      title: 'Aristas con Jerarquía Visual',
      badge: 'Mejora 3',
      desc: 'Dibuja aristas en un solo Draw Call con degradados por vértice y modo de enfoque interactivo al pasar el cursor.',
    },
    particles: {
      title: 'Flujo de Partículas en Enlaces',
      badge: 'Mejora 3b',
      desc: 'Partículas en movimiento continuo a lo largo de las aristas del nodo activo para visualizar el sentido del flujo estudiantil.',
    },
    labels: {
      title: 'Etiquetas Anti-colisión 2D',
      badge: 'Mejora 4',
      desc: 'Etiquetas fijas en nodos masivos con descarte inteligente de colisiones en pantalla y desvanecimiento por distancia.',
    },
    depthStyle: {
      title: 'Dimensionamiento y Profundidad',
      badge: 'Mejora 5',
      desc: 'Escala proporcional a la raíz cuadrada de estudiantes, niebla espacial y paleta de colores de alto contraste.',
    },
    uiPolish: {
      title: 'UI Pulida y Leyenda Interactiva',
      badge: 'Mejora 6',
      desc: 'Panel de chat colapsable, chips envolventes, contraste WCAG AA y leyenda con filtrado por tipo.',
    },
  };

  const activeCount = Object.values(flags).filter(Boolean).length;
  const totalCount = Object.keys(flags).length;

  return (
    <>
      {/* Botón Discreto Flotante (Control de Mejoras Oculto) */}
      <button
        className="v2-gear-trigger-btn"
        onClick={() => setIsOpen(true)}
        title="Abrir configuración de mejoras visuales"
        type="button"
      >
        <span className="gear-icon">⚙</span>
        <span className="gear-label">Mejoras v2</span>
        <span className="gear-counter">
          {activeCount}/{totalCount}
        </span>
      </button>

      {/* Ventana Modal dentro de la página */}
      {isOpen && (
        <div className="v2-modal-backdrop" onClick={() => setIsOpen(false)}>
          <div
            className="v2-modal-window"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {/* Cabecera del Modal */}
            <div className="v2-modal-header">
              <div className="v2-modal-title-group">
                <div className="v2-modal-badge-row">
                  <span className="v2-modal-badge">SISTEMA MODULAR V2</span>
                  <span className="v2-modal-status-pill">
                    {activeCount} de {totalCount} activas
                  </span>
                </div>
                <h3 className="v2-modal-title">Control de Mejoras Visuales</h3>
                <p className="v2-modal-subtitle">
                  Enciende o apaga módulos dinámicos en tiempo real para comparar con la versión estable.
                </p>
              </div>
              <button
                className="v2-modal-close-btn"
                onClick={() => setIsOpen(false)}
                title="Cerrar ventana"
                type="button"
              >
                ✕
              </button>
            </div>

            {/* Lista de Mejoras con Switches Modernos */}
            <div className="v2-modal-body">
              {(Object.keys(flags) as Array<keyof FeatureFlags>).map((key) => {
                const meta = flagMetadata[key];
                const isActive = flags[key];

                return (
                  <div
                    key={key}
                    className={`v2-flag-row ${isActive ? 'is-active' : 'is-inactive'}`}
                    onClick={() => onToggleFlag(key)}
                  >
                    <div className="v2-flag-text-content">
                      <div className="v2-flag-title-line">
                        <span className="v2-flag-pill-tag">{meta?.badge || 'Flag'}</span>
                        <strong className="v2-flag-item-title">
                          {meta?.title || key}
                        </strong>
                      </div>
                      <p className="v2-flag-item-desc">
                        {meta?.desc || 'Interruptor de funcionalidad experimental.'}
                      </p>
                    </div>

                    {/* Switch Táctil Moderno */}
                    <div className="v2-switch-wrapper">
                      <input
                        type="checkbox"
                        checked={isActive}
                        onChange={() => onToggleFlag(key)}
                        onClick={(e) => e.stopPropagation()}
                        id={`switch-${key}`}
                      />
                      <label htmlFor={`switch-${key}`} className="v2-switch-slider">
                        <span className="slider-thumb" />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Barra Inferior del Modal */}
            <div className="v2-modal-footer">
              <span className="v2-modal-hint">
                Presiona <kbd>ESC</kbd> o haz clic fuera para cerrar
              </span>
              <div className="v2-modal-actions">
                {onResetDefaults && (
                  <button
                    className="v2-modal-btn secondary"
                    onClick={onResetDefaults}
                    type="button"
                  >
                    Restablecer
                  </button>
                )}
                {onEnableAll && (
                  <button
                    className="v2-modal-btn primary"
                    onClick={onEnableAll}
                    type="button"
                  >
                    Activar Todas
                  </button>
                )}
                <button
                  className="v2-modal-btn confirm"
                  onClick={() => setIsOpen(false)}
                  type="button"
                >
                  Listo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
