import { useEffect } from 'react';

interface FriendlyGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FriendlyGuideModal({ isOpen, onClose }: FriendlyGuideModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="v2-modal-backdrop" onClick={onClose}>
      <div
        className="v2-friendly-guide-window"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Encabezado Amigable */}
        <div className="v2-guide-header">
          <div className="v2-guide-icon-badge">🎓</div>
          <div className="v2-guide-title-block">
            <h2 className="v2-guide-title">¿Cómo entender este mapa en 1 minuto?</h2>
            <p className="v2-guide-subtitle">
              SIMA-3D visualiza el viaje educativo de más de 29,000 jóvenes en Medellín, desde sus colegios y comunas hasta la universidad.
            </p>
          </div>
          <button className="v2-modal-close-btn" onClick={onClose} title="Cerrar guía">
            ✕
          </button>
        </div>

        {/* Cuerpo con Tarjetas Visuales Didácticas */}
        <div className="v2-guide-body">
          {/* Fila 1: Significado de los Colores */}
          <div className="v2-guide-section-title">
            <span>1. ¿Qué significan los colores de las esferas?</span>
          </div>
          <div className="v2-guide-cards-grid">
            <div className="v2-guide-card comuna">
              <div className="v2-card-badge comuna">🔵 COMUNAS</div>
              <h4>El punto de origen</h4>
              <p>
                Representa los barrios y comunas de Medellín de donde provienen los estudiantes (ej. Comuna 10 - La Candelaria, Comuna 16 - Belén).
              </p>
            </div>

            <div className="v2-guide-card colegio">
              <div className="v2-card-badge colegio">🟢 COLEGIOS</div>
              <h4>Dónde hicieron el bachillerato</h4>
              <p>
                Son las instituciones educativas (públicas y privadas) donde los jóvenes terminaron su educación media.
              </p>
            </div>

            <div className="v2-guide-card facultad">
              <div className="v2-card-badge facultad">🟡 FACULTADES</div>
              <h4>El destino universitario</h4>
              <p>
                Las grandes facultades y áreas de pregrado a donde ingresaron los estudiantes (ej. Ingeniería, Medicina, Ciencias).
              </p>
            </div>
          </div>

          {/* Fila 2: Tamaños y Conexiones */}
          <div className="v2-guide-section-title">
            <span>2. ¿Cómo leer los tamaños y las líneas?</span>
          </div>
          <div className="v2-guide-features-grid">
            <div className="v2-guide-feature">
              <div className="v2-feature-icon">📏</div>
              <div className="v2-feature-text">
                <strong>El tamaño de la esfera</strong>
                <p>
                  Entre más grande es la esfera, mayor cantidad de estudiantes representa ese colegio, comuna o facultad en el histórico.
                </p>
              </div>
            </div>

            <div className="v2-guide-feature">
              <div className="v2-feature-icon">✨</div>
              <div className="v2-feature-text">
                <strong>Las líneas y partículas</strong>
                <p>
                  Indican las rutas que recorrieron los estudiantes. Las líneas con más brillo representan los caminos con mayor flujo de ingreso.
                </p>
              </div>
            </div>
          </div>

          {/* Fila 3: Cómo interactuar */}
          <div className="v2-guide-section-title">
            <span>3. ¿Cómo explorar el espacio 3D?</span>
          </div>
          <div className="v2-guide-controls-strip">
            <div className="v2-control-tip">
              <span className="v2-tip-icon">🖱️</span>
              <span><strong>Arrastra con el ratón:</strong> Gira la constelación en 360°.</span>
            </div>
            <div className="v2-control-tip">
              <span className="v2-tip-icon">🔍</span>
              <span><strong>Rueda del ratón:</strong> Acércate a los colegios o comunas de tu interés.</span>
            </div>
            <div className="v2-control-tip">
              <span className="v2-tip-icon">👆</span>
              <span><strong>Toca o haz clic en cualquier esfera:</strong> Para ver sus datos en lenguaje claro y preguntarle a la IA.</span>
            </div>
          </div>
        </div>

        {/* Pie de Página */}
        <div className="v2-guide-footer">
          <span className="v2-guide-hint">
            💡 Puedes volver a abrir esta guía en cualquier momento desde el botón <strong>¿Cómo funciona?</strong> en la barra superior.
          </span>
          <button className="v2-guide-cta-btn" onClick={onClose}>
            ¡Entendido, quiero explorar! 🚀
          </button>
        </div>
      </div>
    </div>
  );
}
