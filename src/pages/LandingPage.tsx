import { useRef, useEffect } from 'react';
import LandingHeader from "../components/LandingHeader";
import SEOHead from "../components/SEOHead";
import { Link } from 'react-router-dom';
import appVideo from '../assets/render_app_iphone.mp4';
import appVideoPoster from '../assets/render_app_tres_iphone.png';

// ── Static data ────────────────────────────────────────────────────────────────
const PRICE_FEATURES = [
  'Planes de entrenamiento personalizados con IA',
  'Calendario inteligente con vista semana/mes',
  'Sincronización automática con Strava',
  'Análisis de progreso semanal por email',
  'Calibración de zonas de ritmo',
  'Recordatorios de carrera',
  'Soporte por email',
];

const faqs = [
  { q: '¿Cuánto cuesta?', a: 'Zypace cuesta 9,99 € al mes tras los 30 días de prueba gratuita. Durante el primer mes no se realiza ningún cargo. Puedes cancelar en cualquier momento desde el portal de cliente.' },
  { q: '¿Tengo que poner la tarjeta para la prueba gratuita?', a: 'Sí, necesitas introducir tu tarjeta al registrarte, pero no se realizará ningún cargo hasta que finalicen los 30 días. Si cancelas antes, no pagas nada.' },
  { q: '¿Puedo regenerar un plan?', a: 'Sí, puedes regenerar y reemplazarlo si cambian tus objetivos o la fecha de carrera.' },
  { q: '¿Soporta otros deportes?', a: 'De momento nos centramos en running. Próximamente añadiremos ciclismo y triatlón.' },
  { q: '¿Cómo se calcula el progreso?', a: 'Comparamos tus entrenos planificados vs actividades reales de Strava y señalamos el cumplimiento semana a semana.' },
];

const FAQ_SCHEMA = {
  '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: faqs.map(item => ({ '@type': 'Question', name: item.q, acceptedAnswer: { '@type': 'Answer', text: item.a } })),
};

// ── Design tokens ──────────────────────────────────────────────────────────────
const GRID: React.CSSProperties = {
  backgroundImage: `linear-gradient(rgba(163,230,53,0.035) 1px,transparent 1px),linear-gradient(90deg,rgba(163,230,53,0.035) 1px,transparent 1px)`,
  backgroundSize: '64px 64px',
};

// Outline text — Barlow Condensed: contraformas más abiertas que Syne ExtraBold.
// Stroke a 2.5px para compensar la menor masa visual de la condensada vs Syne.
const OUTLINE: React.CSSProperties = {
  fontFamily: "'Barlow Condensed', sans-serif",
  fontWeight: 800,
  WebkitTextStroke: '2.5px rgba(255,255,255,0.7)',
  color: 'transparent',
  letterSpacing: '0.02em',
};
const OUTLINE_SM: React.CSSProperties = {
  fontFamily: "'Barlow Condensed', sans-serif",
  fontWeight: 800,
  WebkitTextStroke: '1.5px rgba(255,255,255,0.6)',
  color: 'transparent',
  letterSpacing: '0.02em',
};

// Dashed route pattern — the leitmotif
const DASH_LINE = 'repeating-linear-gradient(90deg, rgba(63,63,70,0.45) 0, rgba(63,63,70,0.45) 4px, transparent 4px, transparent 14px)';

// ── Sub-components ─────────────────────────────────────────────────────────────

function RegMark({ className = '' }: { className?: string }) {
  return (
    <div className={`w-6 h-6 relative pointer-events-none select-none ${className}`}>
      <div className="absolute top-1/2 left-0 right-0 h-px bg-zinc-800 -translate-y-px" />
      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-zinc-800 -translate-x-px" />
      <div className="absolute inset-[6px] rounded-full border border-zinc-800" />
    </div>
  );
}

function TitleBlock() {
  return (
    <div className="font-mono text-[10px] leading-none border-t border-l border-zinc-800">
      <div className="grid grid-cols-[1fr_auto_auto_auto]">
        <div className="col-span-4 border-b border-zinc-800 px-4 py-2 flex items-center gap-5">
          <span className="text-zinc-500 tracking-[0.3em] uppercase">Proyecto</span>
          <span className="text-zinc-200 font-bold tracking-[0.28em] uppercase">Zypace</span>
          <span className="ml-auto text-zinc-600">ZYP-LP-001</span>
        </div>
        <div className="border-b border-r border-zinc-800 px-4 py-2">
          <div className="text-zinc-500 tracking-widest uppercase mb-1">Documento</div>
          <div className="text-zinc-300">Landing page</div>
        </div>
        <div className="border-b border-r border-zinc-800 px-4 py-2">
          <div className="text-zinc-500 tracking-widest uppercase mb-1">Rev</div>
          <div className="text-zinc-300">C</div>
        </div>
        <div className="border-b border-r border-zinc-800 px-4 py-2">
          <div className="text-zinc-500 tracking-widest uppercase mb-1">Escala</div>
          <div className="text-zinc-300">1:1</div>
        </div>
        <div className="border-b border-zinc-800 px-4 py-2">
          <div className="text-zinc-500 tracking-widest uppercase mb-1">Año</div>
          <div className="text-zinc-300">2025</div>
        </div>
        <div className="col-span-4 px-4 py-1.5">
          <span className="text-zinc-600 tracking-widest uppercase">Clasificación: pública · Idioma: ES · Autor: Zypace</span>
        </div>
      </div>
    </div>
  );
}

// Bracket-corner box — CTA container with animated glow
function BracketBox({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <span className="absolute top-0 left-0 w-4 h-4 border-t border-l border-lime-400 pointer-events-none" style={{ animation: 'bracketGlow 3s ease-in-out infinite' }} />
      <span className="absolute top-0 right-0 w-4 h-4 border-t border-r border-lime-400 pointer-events-none" style={{ animation: 'bracketGlow 3s ease-in-out infinite 0.75s' }} />
      <span className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-lime-400 pointer-events-none" style={{ animation: 'bracketGlow 3s ease-in-out infinite 1.5s' }} />
      <span className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-lime-400 pointer-events-none" style={{ animation: 'bracketGlow 3s ease-in-out infinite 2.25s' }} />
      {children}
    </div>
  );
}

function Callout({ label, value, className = '' }: { label: string; value?: string; className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="flex items-center shrink-0">
        <div className="w-px h-3 bg-zinc-700" />
        <div className="w-10 h-px bg-zinc-800" />
        <div className="w-px h-3 bg-zinc-700" />
      </div>
      <span className="font-mono text-[9px] text-zinc-600 tracking-[0.3em] uppercase">
        {label}{value ? <span className="text-zinc-300 ml-2 tracking-normal normal-case">{value}</span> : null}
      </span>
    </div>
  );
}

function Tag({ n, label }: { n: string; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-7 h-px bg-lime-400 shrink-0" />
      <span className="font-mono text-[9px] text-lime-400 tracking-[0.45em] uppercase">{n} · {label}</span>
    </div>
  );
}

// ── Leitmotif: Route Waypoint ─────────────────────────────────────────────────
// Dashed route line with a waypoint marker — connecting sections like
// waypoints on an architect's route map. This is the recurring visual thread.
function RouteWaypoint() {
  return (
    <div className="flex items-center py-6 md:py-8 px-6 md:px-16 lg:px-24 xl:px-36 max-w-[1700px] mx-auto w-full" data-reveal="fade">
      <div className="flex-1 h-px" style={{ backgroundImage: DASH_LINE }} />
      <div className="px-4 shrink-0">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <circle cx="5" cy="5" r="3.5" fill="none" stroke="rgba(163,230,53,0.2)" strokeWidth="0.8" />
          <circle cx="5" cy="5" r="1.2" fill="rgba(163,230,53,0.35)" />
        </svg>
      </div>
      <div className="flex-1 h-px" style={{ backgroundImage: DASH_LINE }} />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
const LandingPage = () => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const videoRef           = useRef<HTMLVideoElement>(null);
  const overlayRef         = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const video     = videoRef.current;
    const container = scrollContainerRef.current;
    if (!video || !container) return;
    video.load();

    let lastP      = 0;
    let rafPending = false;

    const commit = () => {
      if (video.duration && !isNaN(video.duration) && video.readyState >= 1) {
        video.currentTime = lastP * video.duration;
      }
      if (overlayRef.current) {
        overlayRef.current.style.opacity = String(Math.max(0, 1 - lastP / 0.2));
      }
      rafPending = false;
    };

    const onScroll = () => {
      const rect         = container.getBoundingClientRect();
      const scrolledInto = -rect.top;
      const scrollable   = container.offsetHeight - window.innerHeight;
      if (scrollable <= 0) return;
      lastP = Math.max(0, Math.min(1, scrolledInto / scrollable));
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(commit);
      }
    };

    video.addEventListener('loadedmetadata', onScroll);
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      video.removeEventListener('loadedmetadata', onScroll);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('is-visible'); }),
      { threshold: 0.06, rootMargin: '0px 0px -20px 0px' }
    );
    document.querySelectorAll('[data-reveal]').forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#09090b] text-white">
      <SEOHead canonical="/" jsonLd={[FAQ_SCHEMA]} />
      <LandingHeader />

      {/* ══════════════════════════════════════════════════════════════
          01 · HERO
      ══════════════════════════════════════════════════════════════ */}
      <section className="relative min-h-[100svh] flex flex-col overflow-hidden" aria-label="Presentación de Zypace">
        <div className="absolute inset-0 pointer-events-none" style={GRID} />
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_55%_45%_at_8%_70%,rgba(163,230,53,0.06),transparent)]" />

        <RegMark className="absolute top-6 left-6 hidden md:block" />
        <RegMark className="absolute top-6 right-6 hidden md:block" />
        <RegMark className="absolute bottom-14 left-6 hidden md:block" />
        <RegMark className="absolute bottom-14 right-6 hidden md:block" />

        <div className="absolute left-0 top-0 bottom-14 w-10 hidden md:flex items-center justify-center border-r border-zinc-800/25 pointer-events-none select-none">
          <span
            className="font-mono text-[7.5px] text-zinc-800 tracking-[0.45em] uppercase whitespace-nowrap"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            PROYECTO ZYPACE · ZYP-2025-A · CONF: PÚBLICA · IA RUNNING
          </span>
        </div>

        <div className="relative flex-1 flex flex-col justify-center px-6 md:pl-20 md:pr-16 lg:pl-28 lg:pr-24 xl:pl-36 xl:pr-32 max-w-[1700px] mx-auto w-full py-10 md:py-12">

          <div className="flex items-center justify-between mb-8 md:mb-12" data-reveal>
            <Tag n="01" label="Presentación" />
            <span className="hidden sm:block font-mono text-[8px] text-zinc-800 tracking-widest">LÁM. 01 / 06</span>
          </div>

          {/* ── HEADLINE — staggered reveal per line ── */}
          <h1
            className="font-display font-extrabold uppercase leading-[0.82]"
            aria-label="Traza tu camino"
          >
            {/* TRAZA — Syne filled */}
            <span
              className="block text-white"
              data-reveal
              style={{ fontSize: 'clamp(3.5rem, 11vw, 13rem)', letterSpacing: '-0.028em' }}
            >
              TRAZA
            </span>

            {/* "tu" — annotation interline */}
            <span
              className="block font-mono font-normal text-zinc-600"
              data-reveal
              style={{
                fontSize: 'clamp(0.75rem, 1.8vw, 2.2rem)',
                letterSpacing: '0.55em',
                paddingLeft: '1%',
                marginTop: '-0.1em',
                marginBottom: '-0.05em',
                transitionDelay: '0.12s',
              }}
            >
              tu
            </span>

            {/* CAMINO. — Barlow Condensed outline, +15% size for optical parity with Syne */}
            <span
              className="block"
              data-reveal
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 800,
                fontSize: 'clamp(4rem, 12.5vw, 15rem)',
                letterSpacing: '0.02em',
                WebkitTextStroke: '2.5px rgba(255,255,255,0.7)',
                color: 'transparent',
                transitionDelay: '0.24s',
              }}
            >
              CAMINO.
            </span>
          </h1>

          {/* Marathon elevation route SVG */}
          <div className="mt-6 md:mt-8 w-full max-w-3xl" data-reveal style={{ transitionDelay: '0.32s' }}>
            <svg viewBox="0 0 700 108" fill="none" className="w-full" aria-hidden="true">
              <line x1="0" y1="80" x2="700" y2="80" stroke="#27272a" strokeWidth="0.5" />
              <path
                d="M 10 80 C 60 80 80 22 140 22 S 210 80 280 46 S 350 12 430 26 S 510 80 580 48 S 640 28 690 34 L 690 80 Z"
                fill="url(#eg)" opacity="0.05"
              />
              <defs>
                <linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a3e635" />
                  <stop offset="100%" stopColor="#a3e635" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M 10 60 C 60 60 80 22 140 22 S 210 64 280 46 S 350 12 430 26 S 510 60 580 48 S 640 28 690 34"
                stroke="#a3e635" strokeWidth="1.4" strokeDasharray="5 4" opacity="0.5"
                pathLength="1" className="draw-path"
              />
              <circle cx="10" cy="60" r="3" fill="none" stroke="#a3e635" strokeWidth="1" opacity="0.5" />
              <circle cx="10" cy="60" r="1.2" fill="#a3e635" opacity="0.5" />
              <line x1="10" y1="80" x2="10" y2="86" stroke="#52525b" strokeWidth="0.7" />
              <text x="10" y="96" fill="#52525b" fontSize="7" fontFamily="monospace" textAnchor="middle">0 km</text>
              <line x1="280" y1="80" x2="280" y2="86" stroke="#52525b" strokeWidth="0.7" />
              <text x="280" y="96" fill="#52525b" fontSize="7" fontFamily="monospace" textAnchor="middle">21 km</text>
              <circle cx="690" cy="34" r="3" fill="none" stroke="#a3e635" strokeWidth="1" opacity="0.5" />
              <line x1="690" y1="80" x2="690" y2="86" stroke="#52525b" strokeWidth="0.7" />
              <text x="690" y="96" fill="#52525b" fontSize="7" fontFamily="monospace" textAnchor="middle">42 km</text>
              <line x1="10" y1="7" x2="690" y2="7" stroke="#3f3f46" strokeWidth="0.5" />
              <line x1="10" y1="3" x2="10" y2="11" stroke="#3f3f46" strokeWidth="0.7" />
              <line x1="690" y1="3" x2="690" y2="11" stroke="#3f3f46" strokeWidth="0.7" />
              <text x="350" y="4" fill="#52525b" fontSize="7" fontFamily="monospace" textAnchor="middle">DISTANCIA OBJETIVO — 42.195 km</text>
              <line x1="430" y1="26" x2="498" y2="5" stroke="#3f3f46" strokeWidth="0.5" strokeDasharray="2 2" />
              <text x="502" y="7" fill="#52525b" fontSize="6.5" fontFamily="monospace">D+ 850m</text>
            </svg>
          </div>

          {/* Description + CTA — staggered entry */}
          <div className="mt-10 md:mt-12 flex flex-col sm:flex-row items-start gap-10 sm:gap-16 lg:gap-24">
            <div className="flex items-start gap-4 max-w-sm" data-reveal style={{ transitionDelay: '0.4s' }}>
              <div className="w-px self-stretch bg-lime-400/15 shrink-0 mt-1" />
              <div>
                <p className="font-mono text-[8.5px] text-zinc-500 tracking-[0.45em] uppercase mb-2">Sistema · Descripción funcional</p>
                <p className="text-zinc-400 text-sm md:text-base leading-relaxed">
                  La IA que analiza <strong className="text-zinc-100 font-semibold">cada dato tuyo</strong> para construir el único plan que te llevará a tu meta. Trazado con la precisión de un ingeniero.
                </p>
              </div>
            </div>

            <div className="flex flex-col items-start gap-4" data-reveal style={{ transitionDelay: '0.5s' }}>
              <BracketBox className="px-8 py-4">
                <Link to="/register" className="font-mono text-xs tracking-[0.38em] uppercase font-bold text-lime-400 whitespace-nowrap hover:text-white transition-colors">
                  Empezar gratis →
                </Link>
              </BracketBox>
              <Link to="/login" className="font-mono text-[8.5px] text-zinc-400 tracking-[0.3em] uppercase hover:text-zinc-200 transition-colors pl-4">
                Ya tengo cuenta
              </Link>
              <p className="font-mono text-[8px] text-zinc-500 tracking-[0.28em] uppercase pl-4">30 días gratis · Luego 9,99 €/mes</p>
            </div>
          </div>
        </div>

        {/* Footer bar with engineering title block */}
        <div className="relative border-t border-zinc-800/40 flex items-stretch min-h-[42px]">
          <div className="flex items-center gap-4 flex-1 px-6 md:pl-20 xl:pl-36 pr-4">
            <span className="font-mono text-[8px] text-zinc-500 tracking-[0.3em] uppercase">Zypace · v2025 · Entrenador IA para runners</span>
            <span className="font-mono text-[8px] text-zinc-400 tracking-widest ml-auto">Scroll ↓</span>
          </div>
          <div className="hidden md:block border-l border-zinc-800/40">
            <TitleBlock />
          </div>
        </div>
      </section>

      {/* ── Route waypoint ── */}
      <RouteWaypoint />

      {/* ══════════════════════════════════════════════════════════════
          02 · FILOSOFÍA
      ══════════════════════════════════════════════════════════════ */}
      <section className="relative py-24 md:py-44 overflow-hidden" aria-label="Filosofía Zypace">
        <div className="absolute left-0 bottom-0 w-[55%] overflow-hidden pointer-events-none select-none">
          <span className="font-display font-extrabold text-white/[0.018] leading-[0.8] block" style={{ fontSize: '30vw' }}>02</span>
        </div>

        <div className="relative max-w-[1700px] mx-auto px-6 md:px-16 lg:px-24 xl:px-36">
          <div className="mb-16 md:mb-22" data-reveal>
            <Tag n="02" label="Filosofía del sistema" />
          </div>

          <div className="grid lg:grid-cols-[1fr_1fr] gap-16 lg:gap-28 xl:gap-40 items-start">
            {/* Left: manifesto — staggered quote lines */}
            <div>
              <blockquote className="font-display font-extrabold uppercase leading-[0.87] tracking-tight">
                <span className="block text-white" data-reveal
                  style={{ fontSize: 'clamp(2rem, 4vw, 5rem)' }}>
                  Cada corredor
                </span>
                <span className="block" data-reveal
                  style={{ ...OUTLINE, fontSize: 'clamp(2.3rem, 4.6vw, 5.8rem)', transitionDelay: '0.1s' }}>
                  lleva un camino
                </span>
                <span className="block text-lime-400" data-reveal
                  style={{ fontSize: 'clamp(2rem, 4vw, 5rem)', transitionDelay: '0.2s' }}>
                  que solo es suyo.
                </span>
              </blockquote>

              <p className="mt-10 text-zinc-400 text-base md:text-lg leading-relaxed max-w-md border-l border-zinc-800/80 pl-6" data-reveal style={{ transitionDelay: '0.3s' }}>
                Los planes genéricos fallan porque ignoran quién eres.
                Zypace no asigna un plan. Lo <strong className="text-zinc-100 font-semibold">traza desde cero</strong>,
                pieza a pieza, con la precisión de un ingeniero y la evidencia de la ciencia del deporte.
              </p>
              <div className="mt-10 space-y-3" data-reveal style={{ transitionDelay: '0.4s' }}>
                <Callout label="Plan único" value="Nunca genérico" />
                <Callout label="Evidencia científica" value="Periodización probada" />
                <Callout label="Calibración" value="A partir de tu actividad real" />
              </div>
            </div>

            {/* Right: input spec sheet — slides from right */}
            <div data-reveal="right" style={{ transitionDelay: '0.15s' }}>
              <div className="relative border border-zinc-800/80">
                <span className="absolute -top-px left-0 w-10 h-px bg-lime-400/30" />
                <span className="absolute -top-px right-0 w-10 h-px bg-lime-400/30" />
                <span className="absolute -bottom-px left-0 w-10 h-px bg-lime-400/30" />
                <span className="absolute -bottom-px right-0 w-10 h-px bg-lime-400/30" />
                <span className="absolute top-0 -left-px h-10 w-px bg-lime-400/30" />
                <span className="absolute bottom-0 -left-px h-10 w-px bg-lime-400/30" />
                <span className="absolute top-0 -right-px h-10 w-px bg-lime-400/30" />
                <span className="absolute bottom-0 -right-px h-10 w-px bg-lime-400/30" />

                <div className="flex items-center justify-between px-6 py-3.5 border-b border-zinc-800/80">
                  <span className="font-mono text-[8.5px] text-zinc-500 tracking-[0.38em] uppercase">Parámetros de entrada · Plan</span>
                  <span className="font-mono text-[8.5px] text-zinc-500">ZYP-INPUT-V2025</span>
                </div>

                <ul className="divide-y divide-zinc-800/50">
                  {([
                    ['01', 'Carrera objetivo',         'Distancia, fecha y prioridad de competición'],
                    ['02', 'Historial de marcas',       'Punto de partida real para calibrar ritmos'],
                    ['03', 'Disponibilidad semanal',    'Días, sesiones y horas disponibles'],
                    ['04', 'Nivel de experiencia',      'Años corriendo y volumen habitual'],
                    ['05', 'Actividad Strava real',     'Lo que has hecho, no lo que imaginas'],
                    ['06', 'Tipo de terreno',           'Road, trail, mixto o pista'],
                    ['07', 'Lesiones y restricciones',  'Zonas a respetar y reforzar'],
                    ['08', 'Metodología elegida',       'Polarizado, noruego o clásico'],
                  ] as [string, string, string][]).map(([n, title, desc]) => (
                    <li key={n} className="grid grid-cols-[2.5rem_1fr] items-start px-5 py-3.5">
                      <span className="font-mono text-[8.5px] text-lime-400/70 pt-px">{n}</span>
                      <div>
                        <span className="text-sm font-semibold text-zinc-200 block leading-snug">{title}</span>
                        <span className="text-xs text-zinc-400 leading-tight">{desc}</span>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="px-6 py-3 border-t border-zinc-800/80 flex justify-between">
                  <span className="font-mono text-[7.5px] text-zinc-500 uppercase tracking-widest">Estado: análisis automático</span>
                  <span className="font-mono text-[7.5px] text-zinc-500 uppercase tracking-widest">Actualización: continua</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          VIDEO SCROLL
      ══════════════════════════════════════════════════════════════ */}
      <div ref={scrollContainerRef} className="relative h-[250vh] md:h-[400vh]">
        <div className="sticky top-0 h-screen w-full overflow-hidden bg-[#09090b]">
          <video
            ref={videoRef}
            poster={appVideoPoster}
            muted playsInline preload="auto"
            className="absolute inset-0 w-full h-full object-contain md:object-cover"
          >
            <source src={appVideo} type="video/mp4" />
          </video>

          <div ref={overlayRef} className="absolute inset-0 pointer-events-none bg-[#09090b]/70">
            <div className="absolute inset-0" style={GRID} />
            <div className="absolute inset-0 flex flex-col justify-center px-8 md:px-16 lg:px-24">
              <div className="max-w-[1700px] mx-auto w-full">
                <div className="flex items-center gap-4 mb-6">
                  <div className="h-px w-14 bg-lime-400/40" />
                  <span className="font-mono text-[8.5px] text-lime-400/60 tracking-[0.42em] uppercase">Vista de sistema · App Zypace</span>
                </div>
                <div className="border-l-2 border-lime-400/50 pl-6 md:pl-10">
                  <p
                    className="font-display font-extrabold leading-none tracking-tight text-white uppercase"
                    style={{ fontSize: 'clamp(2.4rem, 7.5vw, 8rem)', letterSpacing: '-0.02em' }}
                  >
                    El plan
                  </p>
                  <p
                    className="font-display font-extrabold leading-none tracking-tight text-lime-400 uppercase"
                    style={{ fontSize: 'clamp(2.4rem, 7.5vw, 8rem)', letterSpacing: '-0.02em' }}
                  >
                    en tu mano.
                  </p>
                </div>
                <div className="mt-8 flex flex-col sm:flex-row gap-5 sm:gap-10">
                  <Callout label="Plataforma" value="iOS + Android" />
                  <Callout label="Sincronización" value="Strava · Tiempo real" />
                  <Callout label="IA" value="Generación + ajuste continuo" />
                </div>
              </div>
            </div>
          </div>

          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#09090b] to-transparent pointer-events-none z-10" />
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#09090b] to-transparent pointer-events-none z-10" />
        </div>
      </div>

      {/* ── Route waypoint ── */}
      <RouteWaypoint />

      {/* ══════════════════════════════════════════════════════════════
          03 · DESPIECE
      ══════════════════════════════════════════════════════════════ */}
      <section className="relative z-10 py-24 md:py-40 overflow-hidden" aria-label="Funcionalidades Zypace">
        <div className="absolute inset-0 pointer-events-none" style={GRID} />

        <div className="relative max-w-[1700px] mx-auto px-6 md:px-16 lg:px-24 xl:px-36">

          <div className="flex flex-col md:flex-row md:items-end justify-between pb-10 border-b border-zinc-800/70 mb-0 gap-4" data-reveal>
            <div>
              <div className="mb-5">
                <Tag n="03" label="Despiece del sistema" />
              </div>
              <h2 className="font-display font-extrabold uppercase leading-[0.85]">
                <span className="block text-white" style={{ fontSize: 'clamp(2rem, 4vw, 4.8rem)' }}>Cada pieza,</span>
                <span className="block" style={{ ...OUTLINE, fontSize: 'clamp(2.3rem, 4.6vw, 5.5rem)' }}>en su lugar.</span>
              </h2>
            </div>
            <div className="font-mono text-[7.5px] text-zinc-500 md:text-right space-y-1.5 pb-1">
              <div className="tracking-widest uppercase">Ref: ZYP-SYS-V2025</div>
              <div className="tracking-widest">Piezas: <span className="text-zinc-300">04</span></div>
              <div className="tracking-widest">Estado: <span className="text-lime-400">Activo</span></div>
            </div>
          </div>

          {/* Parts list — hover glow on items */}
          <div className="divide-y divide-zinc-800/50">
            {([
              {
                id: 'PIEZA 001',
                title: 'Calendario inteligente',
                spec: 'Vista semana/mes · Integración Strava · Progreso visual',
                desc: 'Centraliza en una sola vista tus carreras objetivo, las sesiones planificadas y las actividades reales importadas desde Strava. Plan vs. realidad, día a día.',
                svg: (
                  <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10">
                    <rect x="4" y="8" width="40" height="36" rx="1" />
                    <path d="M32 4v8M16 4v8M4 20h40" />
                    <rect x="10" y="26" width="7" height="5" rx="0.5" opacity="0.35" />
                    <rect x="21" y="26" width="7" height="5" rx="0.5" />
                    <rect x="32" y="26" width="7" height="5" rx="0.5" opacity="0.18" />
                    <rect x="10" y="35" width="7" height="4" rx="0.5" opacity="0.18" />
                    <rect x="21" y="35" width="7" height="4" rx="0.5" opacity="0.6" />
                  </svg>
                ),
              },
              {
                id: 'PIEZA 002',
                title: 'Planificación con IA',
                spec: 'Metodología: polarizado / noruego / clásico · Periodización automática',
                desc: 'La IA construye tu plan desde cero: semanas de carga, recuperación, series, rodajes y taper. Ajustado a tu carrera objetivo, tu disponibilidad y tu nivel real.',
                svg: (
                  <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10">
                    <path d="M8 40 L8 30 L16 30 L16 22 L24 22 L24 14 L32 14 L32 22 L40 22 L40 40Z" opacity="0.15" />
                    <path d="M8 40 L8 30 L16 30 L16 22 L24 22 L24 14 L32 14 L32 22 L40 22 L40 40" />
                    <line x1="4" y1="40" x2="44" y2="40" />
                    <circle cx="24" cy="14" r="2.5" />
                    <line x1="24" y1="8" x2="24" y2="11.5" />
                  </svg>
                ),
              },
              {
                id: 'PIEZA 003',
                title: 'Sincronización Strava',
                spec: 'OAuth2 · Importación automática · Marcado de sesiones completadas',
                desc: 'Conecta Strava una vez. Cada actividad que registres se importa automáticamente, se coteja con el plan y marca la sesión como completada. Sin trabajo manual.',
                svg: (
                  <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10">
                    <path d="M24 8L6 30h16l-2 12 20-24H24L24 8z" />
                    <circle cx="36" cy="14" r="7" strokeDasharray="3 2" opacity="0.3" />
                    <path d="M33 14h6M36 11v6" opacity="0.5" />
                  </svg>
                ),
              },
              {
                id: 'PIEZA 004',
                title: 'Análisis de progreso',
                spec: 'Cumplimiento semanal · Informe por email · Zonas de ritmo calibradas',
                desc: 'Compara lo planificado vs. lo ejecutado. Visualiza el cumplimiento semana a semana, recibe informes automáticos y calibra tus zonas de ritmo a partir de tu actividad real.',
                svg: (
                  <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10">
                    <line x1="4" y1="44" x2="44" y2="44" />
                    <line x1="4" y1="44" x2="4" y2="4" />
                    <path d="M4 34 L12 26 L22 30 L30 18 L44 22" strokeWidth="1.3" />
                    <path d="M4 34 L12 26 L22 30 L30 18 L44 22 L44 44 L4 44Z" opacity="0.06" fill="currentColor" stroke="none" />
                    <circle cx="12" cy="26" r="1.5" fill="currentColor" opacity="0.4" />
                    <circle cx="22" cy="30" r="1.5" fill="currentColor" opacity="0.4" />
                    <circle cx="30" cy="18" r="1.5" fill="currentColor" opacity="0.4" />
                  </svg>
                ),
              },
            ]).map((p, i) => (
              <div
                key={p.id}
                className="grid md:grid-cols-[8rem_1fr_2fr] gap-6 md:gap-12 py-10 md:py-12 hover:bg-lime-400/[0.015] transition-colors duration-500"
                data-reveal
                style={{ transitionDelay: `${i * 0.08}s` }}
              >
                <div className="flex md:flex-col items-center md:items-start gap-5 md:gap-4">
                  <span className="font-mono text-[8.5px] text-lime-400/75 tracking-[0.32em] uppercase whitespace-nowrap">{p.id}</span>
                  <div className="text-zinc-700 hover:text-zinc-300 transition-colors duration-500">
                    {p.svg}
                  </div>
                </div>
                <div className="md:border-l md:border-zinc-800/60 md:pl-10">
                  <h3
                    className="font-display font-bold text-white uppercase leading-[0.9]"
                    style={{ fontSize: 'clamp(1.6rem, 2.6vw, 2.8rem)' }}
                  >
                    {p.title}
                  </h3>
                  <div className="mt-3 font-mono text-[8.5px] text-zinc-400 leading-relaxed tracking-wide">{p.spec}</div>
                </div>
                <div className="md:border-l md:border-zinc-800/60 md:pl-10">
                  <p className="text-zinc-400 text-sm md:text-base leading-relaxed">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Route waypoint ── */}
      <RouteWaypoint />

      {/* ══════════════════════════════════════════════════════════════
          04 · EL PROCESO
      ══════════════════════════════════════════════════════════════ */}
      <section className="relative z-10 py-24 md:py-40 bg-[#0c0c0e] overflow-hidden" aria-label="Cómo funciona Zypace">
        <div className="absolute right-0 top-0 bottom-0 w-1/2 overflow-hidden pointer-events-none select-none flex items-center justify-end">
          <span className="font-display font-extrabold text-white/[0.018] leading-none" style={{ fontSize: '24vw' }}>04</span>
        </div>

        <div className="relative max-w-[1700px] mx-auto px-6 md:px-16 lg:px-24 xl:px-36">
          <div>
            <div className="mb-6" data-reveal>
              <Tag n="04" label="El proceso" />
            </div>
            <h2 className="font-display font-extrabold uppercase leading-[0.85] mb-14 md:mb-20">
              <span className="block text-white" data-reveal
                style={{ fontSize: 'clamp(1.8rem, 3.5vw, 4.2rem)' }}>
                Del punto A
              </span>
              <span className="block" data-reveal
                style={{ ...OUTLINE_SM, fontSize: 'clamp(2rem, 4vw, 4.8rem)', transitionDelay: '0.1s' }}>
                a la meta.
              </span>
            </h2>
          </div>

          <div className="relative">
            {/* Dashed connecting line — leitmotif continuation */}
            <div className="hidden md:block absolute top-7 left-7 right-7 h-px" style={{ backgroundImage: DASH_LINE }}>
              <div className="absolute inset-0 bg-gradient-to-r from-lime-400/15 via-lime-400/6 to-transparent" />
            </div>
            <div className="grid md:grid-cols-4 gap-10 md:gap-8">
              {([
                { title: 'Crea tu cuenta',     text: 'Regístrate y configura tu primera carrera objetivo con todos sus parámetros técnicos.' },
                { title: 'Conecta Strava',     text: 'Otorga acceso seguro para sincronizar actividades, ritmos y zonas reales automáticamente.' },
                { title: 'Genera tu plan',     text: 'La IA traza tu preparación pieza a pieza: sesiones, zonas, progresión y metodología.' },
                { title: 'Entrena y progresa', text: 'Cada actividad importada actualiza tu estado y refleja el avance respecto a tu meta.' },
              ] as { title: string; text: string }[]).map((s, i) => (
                <div key={s.title} className="relative z-10" data-reveal style={{ transitionDelay: `${i * 0.1}s` }}>
                  {/* Step box — dashed border echoes the route leitmotif */}
                  <div className="w-14 h-14 flex items-center justify-center bg-[#0c0c0e] mb-5"
                    style={{ border: '1px dashed rgba(63,63,70,0.6)' }}>
                    <span className="font-display font-extrabold text-xl text-zinc-500 tracking-tight">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <span className="font-mono text-[8.5px] text-lime-400/75 tracking-[0.38em] uppercase mb-2 block">Fase {String(i + 1).padStart(2, '0')}</span>
                  <h3 className="font-semibold text-zinc-200 mb-2.5 text-sm leading-tight">{s.title}</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Route waypoint ── */}
      <RouteWaypoint />

      {/* ══════════════════════════════════════════════════════════════
          05 · PRECIO
      ══════════════════════════════════════════════════════════════ */}
      <section className="relative z-10 py-24 md:py-40 overflow-hidden" aria-label="Precio de Zypace">
        <div className="absolute inset-0 pointer-events-none" style={GRID} />

        <div className="relative max-w-[1700px] mx-auto px-6 md:px-16 lg:px-24 xl:px-36">
          <div className="mb-8 md:mb-12" data-reveal>
            <Tag n="05" label="Precio" />
          </div>

          <div className="mb-12 md:mb-16" data-reveal style={{ transitionDelay: '0.1s' }}>
            <span
              className="font-display font-extrabold text-white block"
              style={{ fontSize: 'clamp(3rem, 7.5vw, 9rem)', letterSpacing: '-0.03em', lineHeight: 1 }}
            >
              9,99€
            </span>
            <p className="font-mono text-[10px] text-zinc-500 tracking-[0.45em] uppercase mt-3">
              al mes · sin letra pequeña
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 lg:gap-24 items-start">
            <div data-reveal style={{ transitionDelay: '0.2s' }}>
              <p className="text-zinc-400 text-base md:text-lg leading-relaxed max-w-md border-l border-zinc-800/80 pl-6">
                30 días para comprobarlo. Si no es para ti, cancelas antes del día 31 y{' '}
                <strong className="text-zinc-100 font-semibold">no pagas nada</strong>.
              </p>
              <div className="mt-8 space-y-3">
                <Callout label="Pago seguro" value="Stripe" />
                <Callout label="Prueba gratuita" value="30 días completos" />
                <Callout label="Cancelación" value="En cualquier momento" />
              </div>
            </div>

            <div data-reveal="right" style={{ transitionDelay: '0.25s' }}>
              <div className="relative border border-zinc-700/50">
                <span className="absolute top-0 left-0 w-7 h-7 border-t border-l border-lime-400/30" />
                <span className="absolute top-0 right-0 w-7 h-7 border-t border-r border-lime-400/30" />
                <span className="absolute bottom-0 left-0 w-7 h-7 border-b border-l border-lime-400/30" />
                <span className="absolute bottom-0 right-0 w-7 h-7 border-b border-r border-lime-400/30" />

                <div className="px-6 py-4 border-b border-zinc-800/80 flex justify-between items-center">
                  <span className="font-mono text-[8.5px] text-lime-400 tracking-[0.38em] uppercase">Zypace Pro · Incluye</span>
                  <span className="px-2.5 py-1.5 bg-lime-400 text-black font-mono text-[7.5px] font-bold tracking-[0.28em] uppercase">30d gratis</span>
                </div>
                <ul className="divide-y divide-zinc-800/40">
                  {PRICE_FEATURES.map(f => (
                    <li key={f} className="flex items-center gap-3 px-6 py-3.5 text-sm text-zinc-300">
                      <span className="text-lime-400 font-mono text-xs shrink-0">+</span>{f}
                    </li>
                  ))}
                </ul>
                <div className="px-6 py-5 border-t border-zinc-800/80">
                  <Link
                    to="/register"
                    className="block w-full text-center py-4 bg-lime-400 hover:bg-lime-300 text-black font-mono text-xs font-bold tracking-[0.38em] uppercase transition-colors"
                  >
                    Empezar prueba gratuita →
                  </Link>
                  <p className="text-center font-mono text-[7.5px] text-zinc-500 mt-3 tracking-[0.28em] uppercase">Sin cargos hasta el día 31</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Route waypoint ── */}
      <RouteWaypoint />

      {/* ══════════════════════════════════════════════════════════════
          06 · FAQ
      ══════════════════════════════════════════════════════════════ */}
      <section className="relative z-10 py-24 md:py-40" aria-label="Preguntas frecuentes">
        <div className="relative max-w-[1700px] mx-auto px-6 md:px-16 lg:px-24 xl:px-36">

          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 pb-10 border-b border-zinc-800/60 mb-0" data-reveal>
            <div>
              <div className="mb-5">
                <Tag n="06" label="FAQ" />
              </div>
              <h2 className="font-display font-extrabold uppercase leading-[0.86]">
                <span className="block text-white" style={{ fontSize: 'clamp(2rem, 4vw, 4.8rem)' }}>Preguntas</span>
                <span className="block" style={{ ...OUTLINE_SM, fontSize: 'clamp(2.3rem, 4.6vw, 5.5rem)' }}>frecuentes.</span>
              </h2>
            </div>
            <span className="font-mono text-[8px] text-zinc-500 tracking-widest uppercase pb-1">ZYP-FAQ-001 · Rev B</span>
          </div>

          <div className="grid md:grid-cols-2 gap-x-16 lg:gap-x-24" data-reveal style={{ transitionDelay: '0.1s' }}>
            {faqs.map((item, i) => (
              <details key={item.q} className="group py-5 md:py-6 border-b border-zinc-800/60 cursor-pointer [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex items-start justify-between gap-4 list-none">
                  <div className="flex gap-4 items-start">
                    <span className="font-mono text-[8px] text-zinc-500 pt-1 shrink-0 w-5 tracking-widest">{String(i + 1).padStart(2, '0')}</span>
                    <span className="font-semibold text-zinc-200 group-open:text-lime-400 transition-colors text-sm md:text-base leading-snug">{item.q}</span>
                  </div>
                  <span className="text-lime-400 group-open:rotate-45 transition-transform duration-200 text-xl leading-none shrink-0 mt-0.5">+</span>
                </summary>
                <p className="mt-4 text-sm text-zinc-400 leading-relaxed pl-9">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          CTA FINAL
      ══════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden">
        {/* Dashed top border — leitmotif as section separator */}
        <div className="h-px" style={{ backgroundImage: DASH_LINE }} />

        <div className="absolute inset-0 pointer-events-none" style={GRID} />
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_65%_50%_at_15%_65%,rgba(163,230,53,0.07),transparent)]" />

        <div className="absolute right-0 top-0 bottom-0 w-[55%] overflow-hidden pointer-events-none select-none flex items-center justify-end">
          <span className="font-display font-extrabold leading-none text-white/[0.018]" style={{ fontSize: '28vw' }}>ZY</span>
        </div>

        <RegMark className="absolute top-8 left-8 hidden md:block" />
        <RegMark className="absolute top-8 right-8 hidden md:block" />

        <div className="relative max-w-[1700px] mx-auto px-6 md:px-16 lg:px-24 xl:px-36 w-full pt-20 pb-28 md:pt-24 md:pb-32">
          <div>
            <div className="flex items-center gap-3 mb-8" data-reveal>
              <div className="w-6 h-px bg-zinc-800" />
              <span className="font-mono text-[8.5px] text-zinc-500 tracking-[0.42em] uppercase">Empieza ahora</span>
            </div>
            <h2 className="font-display font-extrabold uppercase leading-[0.82] tracking-tight">
              <span className="block text-white" data-reveal
                style={{ fontSize: 'clamp(3rem, 9.5vw, 11rem)' }}>
                Tu plan
              </span>
              <span className="block text-lime-400" data-reveal
                style={{ fontSize: 'clamp(3rem, 9.5vw, 11rem)', transitionDelay: '0.12s' }}>
                te espera.
              </span>
            </h2>
          </div>

          <div className="mt-14 md:mt-18 flex flex-col sm:flex-row items-start gap-5" data-reveal style={{ transitionDelay: '0.24s' }}>
            <BracketBox className="px-8 py-5">
              <Link to="/register" className="font-mono text-xs md:text-sm tracking-[0.38em] uppercase font-bold text-lime-400 whitespace-nowrap hover:text-white transition-colors">
                Empezar 30 días gratis →
              </Link>
            </BracketBox>
            <p className="self-center font-mono text-[8.5px] text-zinc-400 tracking-[0.3em] uppercase">
              Sin compromiso · Cancela cuando quieras
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-800/40 flex items-center px-6 md:px-16 xl:px-36 py-4">
          <span className="font-mono text-[8px] text-zinc-500 tracking-[0.3em] uppercase">© 2025 Zypace · Todos los derechos reservados</span>
          <div className="ml-auto flex items-center gap-6">
            <Link to="/privacy" className="font-mono text-[8px] text-zinc-500 hover:text-zinc-300 transition-colors tracking-widest uppercase">Privacidad</Link>
            <Link to="/terms" className="font-mono text-[8px] text-zinc-500 hover:text-zinc-300 transition-colors tracking-widest uppercase">Términos</Link>
          </div>
        </div>
      </section>

    </div>
  );
};

export default LandingPage;
