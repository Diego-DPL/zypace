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
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map(item => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
};

const LANDING_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Zypace',
  applicationCategory: 'SportsApplication',
  operatingSystem: 'Web',
  url: 'https://www.zypace.com',
  description: 'Planes de entrenamiento personalizados con IA para runners. Sincroniza Strava, gestiona carreras objetivo y sigue tu progreso semana a semana.',
  offers: { '@type': 'Offer', price: '9.99', priceCurrency: 'EUR', description: '30 días gratis, luego 9,99 €/mes' },
};

// ── Design tokens ──────────────────────────────────────────────────────────────
const GRID_BG: React.CSSProperties = {
  backgroundImage: `
    linear-gradient(rgba(163,230,53,0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(163,230,53,0.045) 1px, transparent 1px)
  `,
  backgroundSize: '64px 64px',
};

const GRID_BG_DENSE: React.CSSProperties = {
  backgroundImage: `
    linear-gradient(rgba(163,230,53,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(163,230,53,0.03) 1px, transparent 1px)
  `,
  backgroundSize: '32px 32px',
};

// ── Sub-components ─────────────────────────────────────────────────────────────
function BracketBox({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <span className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-lime-400 pointer-events-none" />
      <span className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-lime-400 pointer-events-none" />
      <span className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-lime-400 pointer-events-none" />
      <span className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-lime-400 pointer-events-none" />
      {children}
    </div>
  );
}

function CornerBox({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <span className="absolute top-0 left-0 w-6 h-6 border-t border-l border-lime-400/25 pointer-events-none" />
      <span className="absolute top-0 right-0 w-6 h-6 border-t border-r border-lime-400/25 pointer-events-none" />
      <span className="absolute bottom-0 left-0 w-6 h-6 border-b border-l border-lime-400/25 pointer-events-none" />
      <span className="absolute bottom-0 right-0 w-6 h-6 border-b border-r border-lime-400/25 pointer-events-none" />
      {children}
    </div>
  );
}

function Label({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-8 md:mb-10">
      <div className="w-7 h-px bg-lime-400" />
      <span className="font-mono text-[10px] text-lime-400/60 tracking-[0.35em] uppercase">{n} · {children}</span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
const LandingPage = () => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const videoRef           = useRef<HTMLVideoElement>(null);
  const overlayRef         = useRef<HTMLDivElement>(null);

  // ── Scroll-driven video (unchanged) ───────────────────────────
  useEffect(() => {
    const video     = videoRef.current;
    const container = scrollContainerRef.current;
    if (!video || !container) return;

    video.load();

    const syncToScroll = () => {
      const rect       = container.getBoundingClientRect();
      const scrolledInto = -rect.top;
      const scrollable   = container.offsetHeight - window.innerHeight;
      if (scrollable <= 0) return;
      const progress = Math.max(0, Math.min(1, scrolledInto / scrollable));

      if (video.duration && !isNaN(video.duration) && video.readyState >= 1) {
        video.currentTime = progress * video.duration;
      }
      if (overlayRef.current) {
        overlayRef.current.style.opacity = String(Math.max(0, 1 - progress / 0.2));
      }
    };

    video.addEventListener('loadedmetadata', syncToScroll);
    window.addEventListener('scroll', syncToScroll, { passive: true });
    return () => {
      video.removeEventListener('loadedmetadata', syncToScroll);
      window.removeEventListener('scroll', syncToScroll);
    };
  }, []);

  // ── Scroll-triggered reveals ───────────────────────────────────
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('is-visible'); }),
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
    );
    document.querySelectorAll('[data-reveal]').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#09090b] text-white overflow-x-hidden">
      <SEOHead canonical="/" jsonLd={[LANDING_SCHEMA, FAQ_SCHEMA]} />
      <LandingHeader />

      {/* ═══════════════════════════════════════════════════════════
          01 · HERO
      ═══════════════════════════════════════════════════════════ */}
      <section className="relative min-h-[100svh] flex flex-col overflow-hidden" aria-label="Presentación de Zypace">
        {/* Blueprint grid */}
        <div className="absolute inset-0 pointer-events-none" style={GRID_BG} />

        {/* Large section number */}
        <div className="absolute right-0 top-0 bottom-0 pointer-events-none select-none flex items-center overflow-hidden">
          <span className="font-display font-extrabold leading-none text-white/[0.028]" style={{ fontSize: '32vw' }}>01</span>
        </div>

        {/* Radial glow */}
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_60%_50%_at_20%_60%,rgba(163,230,53,0.07),transparent)]" />

        {/* Content */}
        <div className="relative flex-1 flex flex-col justify-center px-6 md:px-16 lg:px-24 xl:px-32 max-w-[1600px] mx-auto w-full py-28 md:py-36">

          {/* Label */}
          <div className="flex items-center gap-3 mb-10 md:mb-14" data-reveal>
            <div className="w-8 h-px bg-lime-400" />
            <span className="font-mono text-[10px] md:text-xs text-lime-400 tracking-[0.35em] uppercase">Entrenador IA · Running · App Móvil</span>
          </div>

          {/* Headline */}
          <h1
            className="font-display font-extrabold uppercase leading-[0.87] tracking-tight"
            style={{ fontSize: 'clamp(3.6rem, 12.5vw, 14rem)' }}
            data-reveal
          >
            <span className="block text-white">Traza</span>
            <span className="block">
              <span className="text-white">tu </span>
              <span className="text-lime-400">camino.</span>
            </span>
          </h1>

          {/* Blueprint route decoration */}
          <div className="mt-6 md:mt-8 max-w-xs md:max-w-sm" data-reveal>
            <svg viewBox="0 0 360 50" fill="none" className="w-full">
              <path
                d="M 5 35 C 40 35 55 12 95 12 S 145 38 190 25 S 245 8 290 18 S 335 35 355 28"
                stroke="#a3e635"
                strokeWidth="1.2"
                strokeDasharray="5 4"
                opacity="0.25"
                pathLength="1"
                className="draw-path"
              />
              <line x1="5" y1="29" x2="5" y2="41" stroke="#a3e635" strokeWidth="0.8" opacity="0.2" />
              <line x1="355" y1="22" x2="355" y2="34" stroke="#a3e635" strokeWidth="0.8" opacity="0.2" />
              <text x="180" y="48" fill="#a3e635" fontSize="7" fontFamily="monospace" textAnchor="middle" opacity="0.2">DISTANCIA OBJETIVO · KM</text>
            </svg>
          </div>

          {/* Description */}
          <div className="mt-8 md:mt-10 flex items-start gap-5 max-w-lg" data-reveal>
            <div className="w-px self-stretch bg-lime-400/25 shrink-0" />
            <div>
              <p className="font-mono text-[9px] md:text-[10px] text-lime-400/40 tracking-widest uppercase mb-2">Sistema · Descripción</p>
              <p className="text-zinc-300 text-base md:text-lg leading-relaxed">
                La IA que analiza <strong className="text-white font-semibold">cada dato tuyo</strong> para construir el único plan que te llevará a tu meta.
              </p>
            </div>
          </div>

          {/* CTA row */}
          <div className="mt-12 md:mt-16 flex flex-col sm:flex-row gap-6 items-start" data-reveal>
            <BracketBox className="px-8 py-4">
              <Link
                to="/register"
                className="font-mono text-xs md:text-sm tracking-widest uppercase font-bold text-lime-400 whitespace-nowrap hover:text-white transition-colors"
              >
                Empezar gratis →
              </Link>
            </BracketBox>
            <div className="flex items-center gap-3 self-center">
              <div className="w-6 h-px bg-zinc-700" />
              <Link to="/login" className="font-mono text-[10px] text-zinc-600 tracking-widest uppercase hover:text-zinc-400 transition-colors">
                Ya tengo cuenta
              </Link>
            </div>
          </div>

          {/* Fine print */}
          <p className="mt-8 font-mono text-[9px] text-zinc-700 tracking-[0.28em] uppercase">
            30 días gratis · Luego 9,99 €/mes · Cancela cuando quieras
          </p>
        </div>

        {/* Bottom rule */}
        <div className="relative border-t border-zinc-800/60 flex items-center px-6 md:px-16 xl:px-32 py-3.5">
          <span className="font-mono text-[9px] text-zinc-700 tracking-[0.3em] uppercase">Zypace · v2025 · Entrenador personal IA</span>
          <span className="ml-auto font-mono text-[9px] text-zinc-700 tracking-widest animate-pulse">Scroll ↓</span>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          02 · FILOSOFÍA
      ═══════════════════════════════════════════════════════════ */}
      <section className="relative py-24 md:py-40 lg:py-52 border-t border-zinc-800/60 overflow-hidden" aria-label="Filosofía Zypace">
        {/* Large bg number */}
        <div className="absolute left-0 bottom-0 pointer-events-none select-none overflow-hidden leading-none">
          <span className="font-display font-extrabold text-white/[0.022] block translate-y-1/3" style={{ fontSize: '30vw' }}>02</span>
        </div>

        <div className="relative max-w-[1600px] mx-auto px-6 md:px-16 lg:px-24 xl:px-32">
          <div className="grid lg:grid-cols-2 gap-16 lg:gap-20 xl:gap-32">

            {/* Left: editorial statement */}
            <div data-reveal>
              <Label n="02">Filosofía</Label>
              <h2
                className="font-display font-extrabold uppercase leading-[0.88] tracking-tight"
                style={{ fontSize: 'clamp(2.4rem, 5.5vw, 5.5rem)' }}
              >
                <span className="block text-white">Cada corredor</span>
                <span className="block text-white">lleva un camino</span>
                <span className="block text-lime-400">que solo es suyo.</span>
              </h2>
              <p className="mt-8 text-zinc-400 text-base md:text-lg leading-relaxed max-w-md">
                Los planes genéricos fallan porque ignoran quién eres.
                Zypace no asigna un plan. Lo <strong className="text-zinc-100 font-semibold">traza desde cero</strong>,
                pieza a pieza, con la precisión de un ingeniero y la evidencia
                de la ciencia del deporte.
              </p>
              <div className="mt-10 flex items-center gap-4">
                <div className="h-px w-10 bg-lime-400/30" />
                <span className="font-mono text-[10px] text-zinc-600 tracking-widest uppercase">Plan único · Nunca genérico</span>
              </div>
            </div>

            {/* Right: technical spec sheet */}
            <div data-reveal style={{ transitionDelay: '0.15s' }}>
              <CornerBox className="h-full">
                <div className="p-8 lg:p-10">
                  <div className="font-mono text-[10px] text-lime-400/50 tracking-widest uppercase mb-6 pb-4 border-b border-zinc-800">
                    Ref: ZYP-INPUT-V2025 · Datos analizados para tu plan
                  </div>
                  <ul className="space-y-5">
                    {([
                      ['01', 'Carrera objetivo',       'Distancia, fecha y prioridad de la competición'],
                      ['02', 'Historial de marcas',    'Tu punto de partida real para calibrar el ritmo'],
                      ['03', 'Disponibilidad semanal', 'Días, sesiones y horas que puedes entrenar'],
                      ['04', 'Nivel de experiencia',   'Años corriendo y volumen habitual'],
                      ['05', 'Actividad Strava real',  'Lo que has hecho, no lo que crees que has hecho'],
                      ['06', 'Tipo de terreno',        'Road, trail, mixto o pista — cada uno exige distinto'],
                      ['07', 'Lesiones y restricciones','Zonas a respetar y áreas a reforzar'],
                      ['08', 'Metodología elegida',    'Polarizado, noruego o clásico'],
                    ] as [string, string, string][]).map(([n, title, desc]) => (
                      <li key={n} className="flex gap-4 items-start">
                        <span className="font-mono text-[10px] text-lime-400/30 pt-1 shrink-0 w-6 leading-none">{n}</span>
                        <div>
                          <span className="text-sm font-semibold text-zinc-100 block mb-0.5 leading-tight">{title}</span>
                          <span className="text-xs text-zinc-500 leading-relaxed">{desc}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-8 pt-4 border-t border-zinc-800 font-mono text-[9px] text-zinc-700 tracking-widest uppercase">
                    Estado: análisis automático · Actualización: continua
                  </div>
                </div>
              </CornerBox>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          VIDEO SCROLL — unchanged
      ═══════════════════════════════════════════════════════════ */}
      <div ref={scrollContainerRef} className="relative h-[250vh] md:h-[400vh]">
        <div className="sticky top-0 h-screen w-full overflow-hidden bg-zinc-950">
          <video
            ref={videoRef}
            poster={appVideoPoster}
            muted
            playsInline
            preload="auto"
            className="absolute inset-0 w-full h-full object-contain md:object-cover"
          >
            <source src={appVideo} type="video/mp4" />
          </video>
          <div
            ref={overlayRef}
            className="absolute inset-0 flex items-start justify-center pointer-events-none bg-zinc-950/80"
          >
            <div className="mt-20 md:mt-24 px-8 md:px-16">
              <div className="border-l-2 border-lime-400 pl-5 md:pl-7">
                <p className="font-display font-extrabold leading-none tracking-tight text-white uppercase" style={{ fontSize: 'clamp(2.8rem, 11vw, 6.5rem)' }}>
                  Nuestra
                </p>
                <p className="font-display font-extrabold leading-none tracking-tight text-white uppercase" style={{ fontSize: 'clamp(2.8rem, 11vw, 6.5rem)' }}>
                  APP
                </p>
              </div>
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-zinc-900 to-transparent pointer-events-none" />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          03 · MÓDULOS DEL SISTEMA
      ═══════════════════════════════════════════════════════════ */}
      <section className="relative z-10 py-24 md:py-36 bg-[#0d0d0f] border-t border-zinc-800 overflow-hidden" aria-label="Funcionalidades principales">
        {/* Dense grid on this section */}
        <div className="absolute inset-0 pointer-events-none" style={GRID_BG_DENSE} />

        <div className="relative max-w-[1600px] mx-auto px-6 md:px-16 lg:px-24 xl:px-32">

          {/* Section header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 md:mb-16 pb-8 border-b border-zinc-800 gap-6" data-reveal>
            <div>
              <Label n="03">Especificaciones del sistema</Label>
              <h2
                className="font-display font-extrabold uppercase text-white leading-[0.9]"
                style={{ fontSize: 'clamp(2.2rem, 5vw, 4.8rem)' }}
              >
                Módulos<br />del sistema.
              </h2>
            </div>
            <div className="font-mono text-[10px] text-zinc-700 md:text-right space-y-1.5 shrink-0">
              <div>REF: ZYP-SYS-V2025</div>
              <div>MÓDULOS: <span className="text-zinc-400">04</span></div>
              <div>ESTADO: <span className="text-lime-400">ACTIVO</span></div>
            </div>
          </div>

          {/* 4-col hairline-border grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-px bg-zinc-800">
            {([
              {
                id: 'MOD_001',
                title: 'Calendario Inteligente',
                desc: 'Centraliza carreras, entrenamientos planificados y actividades reales de Strava en una sola vista.',
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
                    <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                    <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
                  </svg>
                ),
              },
              {
                id: 'MOD_002',
                title: 'Planes con IA',
                desc: 'Genera planes personalizados adaptados a tu objetivo y fecha de carrera, con ajustes por metodología.',
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
                    <circle cx="12" cy="8" r="3" /><path d="M6 20c0-4 2-6 6-6s6 2 6 6" />
                    <path d="M2 12h2M20 12h2M12 2v2M12 20v2" />
                  </svg>
                ),
              },
              {
                id: 'MOD_003',
                title: 'Sincroniza Strava',
                desc: 'Importa automáticamente tus actividades y marca entrenos como completados sin esfuerzo.',
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                ),
              },
              {
                id: 'MOD_004',
                title: 'Progreso Claro',
                desc: 'Visualiza qué has hecho, qué falta y cómo avanza tu preparación semana a semana.',
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
                    <path d="M3 17l4-4 4 2 4-5 4 3" /><path d="M3 21h18M3 3v18" />
                  </svg>
                ),
              },
            ]).map((mod, i) => (
              <div
                key={mod.id}
                className="relative p-6 lg:p-8 bg-[#0d0d0f] group hover:bg-zinc-900/60 transition-colors"
                data-reveal
                style={{ transitionDelay: `${i * 0.08}s` }}
              >
                <div className="font-mono text-[10px] text-lime-400/30 tracking-widest uppercase mb-6">{mod.id}</div>
                <div className="text-zinc-700 group-hover:text-lime-400 transition-colors duration-300 mb-5">{mod.icon}</div>
                <h3 className="font-display font-bold text-white uppercase text-lg leading-tight mb-3 group-hover:text-lime-400 transition-colors duration-300">{mod.title}</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">{mod.desc}</p>
                <div className="mt-6 pt-4 border-t border-zinc-800/80 flex justify-between items-center">
                  <span className="font-mono text-[9px] text-zinc-700 uppercase tracking-widest">Estado: activo</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-lime-400/50 group-hover:bg-lime-400 transition-colors" />
                </div>
                {/* Bottom accent line */}
                <div className="absolute bottom-0 left-0 right-0 h-px bg-lime-400/0 group-hover:bg-lime-400/20 transition-colors duration-300" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          04 · EL PROCESO
      ═══════════════════════════════════════════════════════════ */}
      <section className="relative z-10 py-24 md:py-36 border-t border-zinc-800 overflow-hidden" aria-label="Cómo funciona Zypace">
        {/* Large bg number */}
        <div className="absolute right-0 top-0 pointer-events-none select-none overflow-hidden leading-none">
          <span className="font-display font-extrabold text-white/[0.025]" style={{ fontSize: '28vw' }}>04</span>
        </div>

        <div className="relative max-w-[1600px] mx-auto px-6 md:px-16 lg:px-24 xl:px-32">
          <Label n="04" data-reveal>El proceso</Label>
          <h2
            className="font-display font-extrabold uppercase text-white leading-[0.9] mb-16 md:mb-24"
            style={{ fontSize: 'clamp(2.2rem, 5vw, 4.8rem)' }}
            data-reveal
          >
            Del punto A<br />a la línea de meta.
          </h2>

          <div className="grid md:grid-cols-4 gap-12 md:gap-0 relative">
            {/* Dashed connecting line */}
            <div className="hidden md:block absolute top-8 left-[12.5%] right-[12.5%] h-px border-t border-dashed border-zinc-800 z-0" />

            {([
              { title: 'Crea tu cuenta',    text: 'Regístrate en segundos y configura tu primera carrera objetivo con todos sus detalles.' },
              { title: 'Conecta Strava',    text: 'Otorga acceso seguro para sincronizar tus actividades y ritmos reales automáticamente.' },
              { title: 'Genera tu plan',    text: 'La IA traza tu preparación pieza a pieza: sesiones, zonas, progresión y metodología.' },
              { title: 'Entrena y progresa', text: 'Cada actividad importada actualiza tu plan y refleja dónde estás respecto a tu meta.' },
            ] as { title: string; text: string }[]).map((s, i) => (
              <div
                key={s.title}
                className="relative z-10"
                data-reveal
                style={{ transitionDelay: `${i * 0.1}s` }}
              >
                <div className="md:pr-10">
                  {/* Step box */}
                  <div className="w-16 h-16 flex items-center justify-center border border-zinc-800 bg-[#09090b] font-display font-extrabold text-2xl text-zinc-700 mb-6 group-hover:border-lime-400/30">
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <div className="font-mono text-[10px] text-lime-400/50 tracking-widest uppercase mb-2">Fase {String(i + 1).padStart(2, '0')}</div>
                  <h3 className="font-semibold text-zinc-100 mb-3 text-sm md:text-base">{s.title}</h3>
                  <p className="text-xs text-zinc-500 leading-relaxed">{s.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          05 · PRECIO
      ═══════════════════════════════════════════════════════════ */}
      <section className="relative z-10 py-24 md:py-36 bg-[#0d0d0f] border-t border-zinc-800 overflow-hidden" aria-label="Precio de Zypace">
        <div className="absolute inset-0 pointer-events-none" style={GRID_BG} />

        <div className="relative max-w-[1600px] mx-auto px-6 md:px-16 lg:px-24 xl:px-32">
          <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">

            {/* Left: statement */}
            <div data-reveal>
              <Label n="05">Precio</Label>
              <h2
                className="font-display font-extrabold uppercase text-white leading-[0.88]"
                style={{ fontSize: 'clamp(2.6rem, 6vw, 5.8rem)' }}
              >
                Un precio.<br />
                <span className="text-lime-400">Sin letra pequeña.</span>
              </h2>
              <p className="mt-8 text-zinc-400 text-base md:text-lg leading-relaxed max-w-sm">
                30 días para comprobarlo. Si no es para ti, cancelas antes del día 31 y <strong className="text-zinc-100 font-semibold">no pagas nada</strong>. Así de simple.
              </p>
              <div className="mt-10 flex items-center gap-4">
                <div className="h-px w-10 bg-lime-400/30" />
                <span className="font-mono text-[10px] text-zinc-600 tracking-widest uppercase">Pago seguro con Stripe</span>
              </div>
            </div>

            {/* Right: pricing card */}
            <div data-reveal style={{ transitionDelay: '0.12s' }}>
              <CornerBox>
                <div className="p-8 lg:p-10 border border-zinc-800/80 bg-zinc-950/80">
                  {/* Price header */}
                  <div className="flex justify-between items-start mb-8">
                    <div>
                      <div className="font-mono text-[10px] text-lime-400 tracking-widest uppercase mb-3">Tarifa única · Zypace Pro</div>
                      <div
                        className="font-display font-extrabold text-white leading-none"
                        style={{ fontSize: 'clamp(3.5rem, 8vw, 5.5rem)' }}
                      >
                        9,99€
                      </div>
                      <div className="font-mono text-xs text-zinc-500 mt-1.5 tracking-wide">/mes · tras 30 días gratis</div>
                    </div>
                    <span className="px-3 py-1.5 bg-lime-400 text-black font-mono text-[10px] font-bold tracking-widest uppercase whitespace-nowrap">
                      30d gratis
                    </span>
                  </div>

                  {/* Feature list */}
                  <ul className="space-y-3 border-t border-zinc-800 pt-6 mb-8">
                    {PRICE_FEATURES.map(f => (
                      <li key={f} className="flex items-start gap-3 text-sm text-zinc-300">
                        <span className="text-lime-400 font-mono text-xs mt-0.5 shrink-0">+</span>
                        {f}
                      </li>
                    ))}
                  </ul>

                  <Link
                    to="/register"
                    className="block w-full text-center py-4 bg-lime-400 hover:bg-lime-300 text-black font-mono text-xs font-bold tracking-widest uppercase transition-colors"
                  >
                    Empezar prueba gratuita →
                  </Link>
                  <p className="text-center font-mono text-[9px] text-zinc-700 mt-3 tracking-widest uppercase">
                    Introduces tu tarjeta · Sin cargos hasta el día 31
                  </p>
                </div>
              </CornerBox>
            </div>

          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          06 · FAQ
      ═══════════════════════════════════════════════════════════ */}
      <section className="relative z-10 py-24 md:py-36 border-t border-zinc-800" aria-label="Preguntas frecuentes sobre Zypace">
        <div className="relative max-w-[1600px] mx-auto px-6 md:px-16 lg:px-24 xl:px-32">
          <div className="grid lg:grid-cols-3 gap-12 lg:gap-16">

            {/* Left: title */}
            <div data-reveal>
              <Label n="06">FAQ</Label>
              <h2
                className="font-display font-extrabold uppercase text-white leading-[0.9]"
                style={{ fontSize: 'clamp(2rem, 4.5vw, 4.2rem)' }}
              >
                Preguntas<br />frecuentes.
              </h2>
            </div>

            {/* Right: accordion */}
            <div className="lg:col-span-2" data-reveal style={{ transitionDelay: '0.1s' }}>
              <div className="divide-y divide-zinc-800">
                {faqs.map((item, i) => (
                  <details key={item.q} className="group py-5 md:py-6 cursor-pointer [&_summary::-webkit-details-marker]:hidden">
                    <summary className="flex items-start justify-between gap-4 list-none">
                      <div className="flex gap-4 items-start">
                        <span className="font-mono text-[10px] text-zinc-700 pt-1 shrink-0 w-5">{String(i + 1).padStart(2, '0')}</span>
                        <span className="font-semibold text-zinc-200 group-open:text-lime-400 transition-colors text-sm md:text-base leading-snug">{item.q}</span>
                      </div>
                      <span className="text-lime-400 group-open:rotate-45 transition-transform duration-200 text-xl leading-none shrink-0 mt-0.5">+</span>
                    </summary>
                    <p className="mt-4 text-sm text-zinc-500 leading-relaxed pl-9">{item.a}</p>
                  </details>
                ))}
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          CTA FINAL
      ═══════════════════════════════════════════════════════════ */}
      <section className="relative min-h-[75vh] md:min-h-screen flex items-center border-t border-zinc-800 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={GRID_BG} />
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_70%_55%_at_30%_65%,rgba(163,230,53,0.08),transparent)]" />

        {/* Large bg number */}
        <div className="absolute right-0 top-0 bottom-0 pointer-events-none select-none flex items-center overflow-hidden">
          <span className="font-display font-extrabold leading-none text-white/[0.022]" style={{ fontSize: '30vw' }}>ZY</span>
        </div>

        <div className="relative max-w-[1600px] mx-auto px-6 md:px-16 lg:px-24 xl:px-32 w-full py-24 md:py-36">
          <div className="max-w-4xl">
            <div className="font-mono text-[10px] text-zinc-700 tracking-widest uppercase mb-8 flex items-center gap-3" data-reveal>
              <div className="w-6 h-px bg-zinc-700" /> Empieza ahora
            </div>
            <h2
              className="font-display font-extrabold uppercase leading-[0.87] tracking-tight text-white"
              style={{ fontSize: 'clamp(4rem, 13vw, 13rem)' }}
              data-reveal
            >
              <span className="block">Tu plan</span>
              <span className="block text-lime-400">te espera.</span>
            </h2>

            <div className="mt-12 md:mt-16 flex flex-col sm:flex-row items-start gap-6" data-reveal>
              <BracketBox className="px-8 py-5">
                <Link
                  to="/register"
                  className="font-mono text-xs md:text-sm tracking-widest uppercase font-bold text-lime-400 whitespace-nowrap hover:text-white transition-colors"
                >
                  Empezar 30 días gratis →
                </Link>
              </BracketBox>
              <div className="flex items-center gap-3 self-center">
                <div className="w-6 h-px bg-zinc-800" />
                <span className="font-mono text-[10px] text-zinc-700 tracking-widest uppercase">Sin compromiso · Cancela cuando quieras</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom rule */}
        <div className="absolute bottom-0 inset-x-0 border-t border-zinc-800/60 flex items-center px-6 md:px-16 xl:px-32 py-3.5">
          <span className="font-mono text-[9px] text-zinc-700 tracking-[0.3em] uppercase">© 2025 Zypace · Todos los derechos reservados</span>
          <div className="ml-auto flex items-center gap-6">
            <Link to="/privacy" className="font-mono text-[9px] text-zinc-700 hover:text-zinc-400 transition-colors tracking-widest uppercase">Privacidad</Link>
            <Link to="/terms" className="font-mono text-[9px] text-zinc-700 hover:text-zinc-400 transition-colors tracking-widest uppercase">Términos</Link>
          </div>
        </div>
      </section>

    </div>
  );
};

export default LandingPage;
