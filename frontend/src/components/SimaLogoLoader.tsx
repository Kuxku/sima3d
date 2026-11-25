import { useCallback, useEffect, useId, useRef, useState } from 'react';
import './SimaLogoLoader.css';

// ============================================================================
// Motion Contract — DRAW -> FILL -> HOLD -> RESET (5600ms repeating cycle)
// ============================================================================
const CYCLE_MS = 5600;
const DRAW_DURATION_MS = 2650;
const FILL_START_MS = 3100;
const FILL_DURATION_MS = 700; // 3100 -> 3800ms
const FADE_START_MS = 5000;   // Hold 3800 -> 5000ms
const FADE_DURATION_MS = 600; // 5000 -> 5600ms

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function easeCosine(v: number): number {
  return 0.5 - 0.5 * Math.cos(Math.PI * clamp01(v));
}

interface ContourDef {
  id: string;
  d: string;
  delay: number;
  strokeWidth: number;
  group: 'emblem' | 'wordmark';
}

// Contornos vectoriales del emblema circular SIMA (viewBox 0 0 240 240)
// Todos los delays <= 420ms para que cada trazo (2650ms) termine antes de FILL_START_MS (3100ms)
const SIMA_CONTOURS: ContourDef[] = [
  // 1. Anillo exterior del emblema
  {
    id: 'outer-ring',
    d: 'M 120 14 A 106 106 0 1 1 119.99 14 Z',
    delay: 0,
    strokeWidth: 4.2,
    group: 'emblem',
  },
  // 2. Globo central (contorno + meridiano + ecuador + paralelos)
  {
    id: 'globe-outline',
    d: 'M 120 56 A 48 48 0 1 1 119.99 56 Z',
    delay: 90,
    strokeWidth: 3.4,
    group: 'emblem',
  },
  {
    id: 'globe-meridian-center',
    d: 'M 120 56 L 120 152',
    delay: 140,
    strokeWidth: 2.6,
    group: 'emblem',
  },
  {
    id: 'globe-meridian-left',
    d: 'M 120 56 C 95 72 92 128 112 151',
    delay: 165,
    strokeWidth: 2.5,
    group: 'emblem',
  },
  {
    id: 'globe-meridian-right',
    d: 'M 120 56 C 145 72 148 128 128 151',
    delay: 190,
    strokeWidth: 2.5,
    group: 'emblem',
  },
  {
    id: 'globe-equator',
    d: 'M 72 104 Q 120 112 168 104',
    delay: 215,
    strokeWidth: 2.6,
    group: 'emblem',
  },
  {
    id: 'globe-parallel-top',
    d: 'M 81 79 Q 120 91 159 79',
    delay: 235,
    strokeWidth: 2.4,
    group: 'emblem',
  },
  // 3. Flecha orbital superior (movilidad saliente)
  {
    id: 'arrow-top',
    d: 'M 86 73 C 76 42 104 28 131 35 L 124 27 M 131 35 L 122 43',
    delay: 180,
    strokeWidth: 3.4,
    group: 'emblem',
  },
  // 4. Flecha orbital inferior izquierda -> derecha
  {
    id: 'arrow-bottom-left',
    d: 'M 75 112 C 44 128 54 149 95 142 L 87 135 M 95 142 L 88 150',
    delay: 240,
    strokeWidth: 3.3,
    group: 'emblem',
  },
  // 5. Flecha orbital envolvente derecha -> centro
  {
    id: 'arrow-orbit-right',
    d: 'M 164 85 C 194 78 192 110 129 136 L 138 139 M 129 136 L 135 128',
    delay: 270,
    strokeWidth: 3.3,
    group: 'emblem',
  },
  // 6. Birrete académico (parte superior derecha) + borla
  {
    id: 'grad-cap-top',
    d: 'M 140 31 L 178 40 L 166 57 L 134 45 Z',
    delay: 300,
    strokeWidth: 3.2,
    group: 'emblem',
  },
  {
    id: 'grad-cap-base',
    d: 'M 143 49 L 143 60 C 151 66 161 66 167 60 L 167 55',
    delay: 330,
    strokeWidth: 2.8,
    group: 'emblem',
  },
  {
    id: 'grad-cap-tassel',
    d: 'M 157 44 L 174 58 L 172 72',
    delay: 350,
    strokeWidth: 2.4,
    group: 'emblem',
  },
  // 7. Constelaciones laterales (nodos y enlaces de red)
  {
    id: 'constellation-left',
    d: 'M 55 96 L 62 75 L 74 63',
    delay: 310,
    strokeWidth: 2.2,
    group: 'emblem',
  },
  {
    id: 'constellation-left-nodes',
    d: 'M 62 70 A 5 5 0 1 1 61.99 70 Z M 74 60 A 3 3 0 1 1 73.99 60 Z',
    delay: 340,
    strokeWidth: 2.4,
    group: 'emblem',
  },
  {
    id: 'constellation-right',
    d: 'M 171 114 L 182 126 L 194 111',
    delay: 325,
    strokeWidth: 2.2,
    group: 'emblem',
  },
  {
    id: 'constellation-right-nodes',
    d: 'M 182 122 A 4 4 0 1 1 181.99 122 Z M 194 107 A 4 4 0 1 1 193.99 107 Z',
    delay: 355,
    strokeWidth: 2.4,
    group: 'emblem',
  },
  // 8. Destellos geométricos (estrellas de 4 puntas)
  {
    id: 'sparkle-top-left',
    d: 'M 79 40 Q 79 46 85 46 Q 79 46 79 52 Q 79 46 73 46 Q 79 46 79 40 Z',
    delay: 360,
    strokeWidth: 1.8,
    group: 'emblem',
  },
  {
    id: 'sparkle-mid-left',
    d: 'M 54 103 Q 54 108 59 108 Q 54 108 54 113 Q 54 108 49 108 Q 54 108 54 103 Z',
    delay: 375,
    strokeWidth: 1.8,
    group: 'emblem',
  },
  {
    id: 'sparkle-bottom-right',
    d: 'M 184 140 Q 184 146 190 146 Q 184 146 184 152 Q 184 146 178 146 Q 184 146 184 140 Z',
    delay: 390,
    strokeWidth: 1.8,
    group: 'emblem',
  },
  // 9. Tipografía SIMA (trazos de letras para el efecto DRAW -> FILL)
  {
    id: 'glyph-S',
    d: 'M 83 167 C 81 162 76 160 70 160 C 63 160 58 164 58 169 C 58 175 64 177 71 179 C 79 181 84 184 84 190 C 84 196 78 200 70 200 C 62 200 57 197 55 191',
    delay: 150,
    strokeWidth: 4.4,
    group: 'wordmark',
  },
  {
    id: 'glyph-I',
    d: 'M 98 161 L 98 199',
    delay: 210,
    strokeWidth: 4.4,
    group: 'wordmark',
  },
  {
    id: 'glyph-M',
    d: 'M 113 199 L 113 161 L 128 186 L 143 161 L 143 199',
    delay: 270,
    strokeWidth: 4.4,
    group: 'wordmark',
  },
  {
    id: 'glyph-A',
    d: 'M 156 199 L 170 161 L 184 199 M 161 187 L 179 187',
    delay: 330,
    strokeWidth: 4.4,
    group: 'wordmark',
  },
];

export interface SimaLogoLoaderProps {
  className?: string;
}

export function SimaLogoLoader({ className = '' }: SimaLogoLoaderProps) {
  const uid = useId().replace(/:/g, '');
  const sectionRef = useRef<HTMLElement | null>(null);
  const rootGroupRef = useRef<SVGGElement | null>(null);
  const outlineGroupRef = useRef<SVGGElement | null>(null);
  const filledGroupRef = useRef<SVGGElement | null>(null);
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const pathLengthsRef = useRef<number[]>([]);

  const elapsedRef = useRef<number>(0);
  const lastFrameRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const [isUserPaused, setIsUserPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  const isUserPausedRef = useRef(isUserPaused);
  const isHiddenRef = useRef(false);
  const isOffscreenRef = useRef(false);
  const reducedMotionRef = useRef(prefersReducedMotion);

  const applyFrameAt = useCallback((ms: number) => {
    const rootG = rootGroupRef.current;
    const outlineG = outlineGroupRef.current;
    const filledG = filledGroupRef.current;
    if (!rootG || !outlineG || !filledG) return;

    const t = ((ms % CYCLE_MS) + CYCLE_MS) % CYCLE_MS;

    // 1. DRAW (0 -> 3100ms)
    SIMA_CONTOURS.forEach((contour, idx) => {
      const el = pathRefs.current[idx];
      const len = pathLengthsRef.current[idx] || 0;
      if (!el || len <= 0) return;

      const rawProgress = (t - contour.delay) / DRAW_DURATION_MS;
      const eased = easeCosine(rawProgress);
      const offset = len * (1 - eased);
      el.style.strokeDashoffset = `${offset.toFixed(2)}`;
    });

    // 2. CROSSFADE OUTLINE -> FILLED (3100 -> 3800ms)
    let fillProgress = 0;
    if (t >= FILL_START_MS) {
      fillProgress = easeCosine((t - FILL_START_MS) / FILL_DURATION_MS);
    }

    // 3. HOLD (3800 -> 5000ms) & FADE OUT (5000 -> 5600ms)
    let rootOpacity = 1;
    if (t >= FADE_START_MS) {
      const fadeProgress = easeCosine((t - FADE_START_MS) / FADE_DURATION_MS);
      rootOpacity = 1 - fadeProgress;
    }

    outlineG.style.opacity = `${(1 - fillProgress).toFixed(4)}`;
    filledG.style.opacity = `${fillProgress.toFixed(4)}`;
    rootG.style.opacity = `${rootOpacity.toFixed(4)}`;
  }, []);

  const applyReducedMotionState = useCallback(() => {
    const rootG = rootGroupRef.current;
    const outlineG = outlineGroupRef.current;
    const filledG = filledGroupRef.current;
    if (!rootG || !outlineG || !filledG) return;

    pathRefs.current.forEach((el) => {
      if (el) el.style.strokeDashoffset = '0';
    });
    outlineG.style.opacity = '0';
    filledG.style.opacity = '1';
    rootG.style.opacity = '1';
  }, []);

  const stopLoop = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    lastFrameRef.current = null;
  }, []);

  const startLoop = useCallback(() => {
    if (
      rafIdRef.current !== null ||
      reducedMotionRef.current ||
      isUserPausedRef.current ||
      isHiddenRef.current ||
      isOffscreenRef.current
    ) {
      return;
    }

    const tick = (now: number) => {
      if (
        reducedMotionRef.current ||
        isUserPausedRef.current ||
        isHiddenRef.current ||
        isOffscreenRef.current
      ) {
        rafIdRef.current = null;
        lastFrameRef.current = null;
        return;
      }

      if (lastFrameRef.current !== null) {
        const dt = Math.min(now - lastFrameRef.current, 100);
        elapsedRef.current = (elapsedRef.current + dt) % CYCLE_MS;
      }
      lastFrameRef.current = now;

      applyFrameAt(elapsedRef.current);
      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);
  }, [applyFrameAt]);

  // Medir getTotalLength() y configurar stroke-dasharray una sola vez al montar
  useEffect(() => {
    const lengths: number[] = [];
    pathRefs.current.forEach((el, idx) => {
      if (!el) {
        lengths[idx] = 0;
        return;
      }
      const len = el.getTotalLength();
      lengths[idx] = len;
      el.style.strokeDasharray = `${len.toFixed(2)}`;
      el.style.strokeDashoffset = `${len.toFixed(2)}`;
    });
    pathLengthsRef.current = lengths;

    if (reducedMotionRef.current) {
      applyReducedMotionState();
    } else {
      applyFrameAt(elapsedRef.current);
      startLoop();
    }

    return () => {
      stopLoop();
    };
  }, [applyFrameAt, applyReducedMotionState, startLoop, stopLoop]);

  // Escuchar cambios dinámicos en prefers-reduced-motion
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');

    const handleChange = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches;
      setPrefersReducedMotion(e.matches);
      if (e.matches) {
        stopLoop();
        applyReducedMotionState();
      } else {
        applyFrameAt(elapsedRef.current);
        startLoop();
      }
    };

    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, [applyFrameAt, applyReducedMotionState, startLoop, stopLoop]);

  // Suspender sin acumular tiempo cuando la pestaña se oculta o sale de pantalla
  useEffect(() => {
    const handleVisibility = () => {
      isHiddenRef.current = document.hidden;
      if (document.hidden) {
        stopLoop();
      } else {
        startLoop();
      }
    };

    const handlePageHide = () => {
      isHiddenRef.current = true;
      stopLoop();
    };

    const handlePageShow = () => {
      isHiddenRef.current = document.hidden;
      if (!document.hidden) {
        startLoop();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);

    let observer: IntersectionObserver | null = null;
    if (sectionRef.current && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          isOffscreenRef.current = !entry?.isIntersecting;
          if (isOffscreenRef.current) {
            stopLoop();
          } else {
            startLoop();
          }
        },
        { threshold: 0.05 }
      );
      observer.observe(sectionRef.current);
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
      observer?.disconnect();
    };
  }, [startLoop, stopLoop]);

  const handleTogglePlay = () => {
    if (prefersReducedMotion) return;
    const nextPaused = !isUserPaused;
    isUserPausedRef.current = nextPaused;
    setIsUserPaused(nextPaused);
    if (nextPaused) {
      stopLoop();
    } else {
      startLoop();
    }
  };

  const handleReplay = () => {
    if (prefersReducedMotion) return;
    elapsedRef.current = 0;
    isUserPausedRef.current = false;
    setIsUserPaused(false);
    stopLoop();
    applyFrameAt(0);
    startLoop();
  };

  const clipId = `sima-badge-clip-${uid}`;

  return (
    <section
      ref={sectionRef}
      className={`loading-screen sima-logo-loader ${className}`.trim()}
      aria-busy="true"
      aria-label="Cargando SIMA-3D"
    >
      <div className="sima-loader-stage">
        <svg
          className="sima-loader-svg"
          viewBox="0 0 240 240"
          role="img"
          aria-label="Logotipo oficial de SIMA-3D: emblema circular con globo académico, flechas de movilidad, birrete, nodos de red y texto SIMA"
        >
          <defs>
            <clipPath id={clipId}>
              <circle cx="120" cy="120" r="108" />
            </clipPath>
          </defs>

          <g ref={rootGroupRef} clipPath={`url(#${clipId})`}>
            {/* CAPA 1: Trazos animados DRAW (0 -> 3100ms, #f5edde) */}
            <g ref={outlineGroupRef} className="sima-outline-layer">
              {SIMA_CONTOURS.map((contour, idx) => (
                <path
                  key={contour.id}
                  ref={(el) => {
                    pathRefs.current[idx] = el;
                  }}
                  d={contour.d}
                  fill="none"
                  stroke="#f5edde"
                  strokeWidth={contour.strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </g>

            {/* CAPA 2: Logotipo relleno sólido FILL (3100 -> 3800ms crossfade, hold 3800 -> 5000ms) */}
            <g ref={filledGroupRef} className="sima-filled-layer" style={{ opacity: 0 }}>
              {/* Fondo sutil del emblema */}
              <circle cx="120" cy="120" r="106" fill="#0f172a" stroke="#faf6f9" strokeWidth="4.2" />

              {/* Globo relleno suave + líneas */}
              <circle cx="120" cy="104" r="48" fill="#182b35" stroke="#faf6f9" strokeWidth="3.4" />
              <path d="M 120 56 L 120 152" fill="none" stroke="#faf6f9" strokeWidth="2.6" strokeLinecap="round" />
              <path d="M 120 56 C 95 72 92 128 112 151" fill="none" stroke="#faf6f9" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M 120 56 C 145 72 148 128 128 151" fill="none" stroke="#faf6f9" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M 72 104 Q 120 112 168 104" fill="none" stroke="#faf6f9" strokeWidth="2.6" strokeLinecap="round" />
              <path d="M 81 79 Q 120 91 159 79" fill="none" stroke="#faf6f9" strokeWidth="2.4" strokeLinecap="round" />

              {/* Flechas orbitales de movilidad */}
              <path
                d="M 86 73 C 76 42 104 28 131 35 L 124 27 M 131 35 L 122 43"
                fill="none"
                stroke="#38bdf8"
                strokeWidth="3.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M 75 112 C 44 128 54 149 95 142 L 87 135 M 95 142 L 88 150"
                fill="none"
                stroke="#38bdf8"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M 164 85 C 194 78 192 110 129 136 L 138 139 M 129 136 L 135 128"
                fill="none"
                stroke="#38bdf8"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Birrete académico */}
              <path
                d="M 140 31 L 178 40 L 166 57 L 134 45 Z"
                fill="#faf6f9"
                stroke="#faf6f9"
                strokeWidth="2.2"
                strokeLinejoin="round"
              />
              <path
                d="M 143 49 L 143 60 C 151 66 161 66 167 60 L 167 55"
                fill="#1e293b"
                stroke="#faf6f9"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
              <path
                d="M 157 44 L 174 58 L 172 72"
                fill="none"
                stroke="#fbbf24"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="172" cy="74" r="2.6" fill="#fbbf24" />

              {/* Constelaciones de red */}
              <path d="M 55 96 L 62 75 L 74 63" fill="none" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round" />
              <circle cx="62" cy="75" r="5" fill="#0f172a" stroke="#34d399" strokeWidth="2.5" />
              <circle cx="74" cy="63" r="3" fill="#34d399" />

              <path d="M 171 114 L 182 126 L 194 111" fill="none" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round" />
              <circle cx="182" cy="126" r="4" fill="#0f172a" stroke="#34d399" strokeWidth="2.5" />
              <circle cx="194" cy="111" r="4" fill="#0f172a" stroke="#fbbf24" strokeWidth="2.5" />

              {/* Destellos geométricos */}
              <path d="M 79 40 Q 79 46 85 46 Q 79 46 79 52 Q 79 46 73 46 Q 79 46 79 40 Z" fill="#faf6f9" />
              <path d="M 54 103 Q 54 108 59 108 Q 54 108 54 113 Q 54 108 49 108 Q 54 108 54 103 Z" fill="#faf6f9" />
              <path d="M 184 140 Q 184 146 190 146 Q 184 146 184 152 Q 184 146 178 146 Q 184 146 184 140 Z" fill="#faf6f9" />

              {/* Wordmark SIMA relleno */}
              <g
                fill="none"
                stroke="#faf6f9"
                strokeWidth="7.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M 83 167 C 81 162 76 160 70 160 C 63 160 58 164 58 169 C 58 175 64 177 71 179 C 79 181 84 184 84 190 C 84 196 78 200 70 200 C 62 200 57 197 55 191" />
                <path d="M 98 161 L 98 199" />
                <path d="M 113 199 L 113 161 L 128 186 L 143 161 L 143 199" />
                <path d="M 156 199 L 170 161 L 184 199 M 161 187 L 179 187" />
              </g>
            </g>
          </g>
        </svg>
      </div>

      {/* Controles accesibles discretos en esquina inferior derecha */}
      <div className="sima-loader-controls" role="group" aria-label="Controles de animación de carga">
        <button
          type="button"
          className="sima-loader-btn"
          onClick={handleTogglePlay}
          disabled={prefersReducedMotion}
          aria-pressed={isUserPaused}
          aria-label={isUserPaused ? 'Reanudar animación del logotipo' : 'Pausar animación del logotipo'}
        >
          {isUserPaused ? 'Play' : 'Pause'}
        </button>
        <button
          type="button"
          className="sima-loader-btn"
          onClick={handleReplay}
          disabled={prefersReducedMotion}
          aria-label="Reiniciar animación del logotipo"
        >
          Replay
        </button>
      </div>
    </section>
  );
}
