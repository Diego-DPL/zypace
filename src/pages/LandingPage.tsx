import { useRef, useEffect } from 'react';
import LandingHeader from "../components/LandingHeader";
import SEOHead from "../components/SEOHead";
import { Link } from 'react-router-dom';
import appVideo from '../assets/render_app_iphone.mp4';
import appVideoPoster from '../assets/render_app_tres_iphone.png';

const PRICE_FEATURES = [
  'Planes de entrenamiento personalizados con IA',
  'Calendario inteligente con vista semana/mes',
  'Sincronización automática con Strava',
  'Análisis de progreso semanal por email',
  'Calibración de zonas de ritmo',
  'Recordatorios de carrera',
  'Soporte por email',
];

const features = [
  {
    title: 'Calendario Inteligente',
    desc: 'Centraliza carreras, entrenamientos planificados y actividades reales de Strava en una sola vista.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
        <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
      </svg>
    ),
  },
  {
    title: 'Planes con IA',
    desc: 'Genera planes personalizados adaptados a tu objetivo y fecha de carrera, con ajustes dinámicos.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
        <path d="M12 2a4 4 0 0 1 4 4c0 1.5-.8 2.8-2 3.5V11h1a2 2 0 0 1 2 2v1h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1v-1a2 2 0 0 1 2-2h1V9.5A4 4 0 0 1 8 6a4 4 0 0 1 4-4z" />
        <path d="M9 17v1M12 17v1M15 17v1" />
      </svg>
    ),
  },
  {
    title: 'Sincroniza con Strava',
    desc: 'Importa automáticamente tus actividades y marca entrenos como completados sin esfuerzo.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
  },
  {
    title: 'Progreso Claro',
    desc: 'Visualiza qué has hecho, qué falta y cómo avanza tu preparación semana a semana.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
        <path d="M3 17l4-4 4 2 4-5 4 3" />
        <path d="M3 21h18" />
        <path d="M3 3v18" />
      </svg>
    ),
  },
];

const steps = [
  { step: '1', title: 'Crea tu cuenta', text: 'Regístrate en segundos y configura tu primera carrera objetivo.' },
  { step: '2', title: 'Conecta Strava', text: 'Otorga acceso seguro para sincronizar tus actividades automáticamente.' },
  { step: '3', title: 'Genera tu plan', text: 'Elige una carrera y deja que la IA construya tu preparación.' },
  { step: '4', title: 'Entrena y ajusta', text: 'Cada actividad importada se refleja y ajusta tu progreso.' },
];

const faqs = [
  { q: '¿Cuánto cuesta?', a: 'Zypace cuesta 9,99 € al mes tras los 30 días de prueba gratuita. Durante el primer mes no se realiza ningún cargo. Puedes cancelar en cualquier momento desde el portal de cliente.' },
  { q: '¿Tengo que poner la tarjeta para la prueba gratuita?', a: 'Sí, necesitas introducir tu tarjeta al registrarte, pero no se realizará ningún cargo hasta que finalicen los 30 días. Si cancelas antes, no pagas nada.' },
  { q: '¿Puedo regenerar un plan?', a: 'Sí, puedes regenerar y reemplazarlo si cambian tus objetivos o la fecha.' },
  { q: '¿Soporta otros deportes?', a: 'De momento nos centramos en running. Próximamente añadiremos ciclismo y triatlón.' },
  { q: '¿Cómo se calcula el progreso?', a: 'Comparamos tus entrenos planificados vs actividades reales y señalamos cumplimiento.' },
];

const FAQ_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map(item => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: {
      '@type': 'Answer',
      text: item.a,
    },
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
  offers: {
    '@type': 'Offer',
    price: '9.99',
    priceCurrency: 'EUR',
    description: '30 días gratis, luego 9,99 €/mes',
  },
};

const LandingPage = () => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    const container = scrollContainerRef.current;
    if (!video || !container) return;

    // Force load — mobile browsers ignore preload="auto" until explicitly called
    video.load();

    const syncToScroll = () => {
      const rect = container.getBoundingClientRect();
      const scrolledInto = -rect.top;
      const scrollable = container.offsetHeight - window.innerHeight;
      if (scrollable <= 0) return;
      const progress = Math.max(0, Math.min(1, scrolledInto / scrollable));

      // Video seek
      if (video.duration && !isNaN(video.duration) && video.readyState >= 1) {
        video.currentTime = progress * video.duration;
      }

      // Overlay fades out in the first 20% of scroll progress
      if (overlayRef.current) {
        const opacity = Math.max(0, 1 - progress / 0.2);
        overlayRef.current.style.opacity = String(opacity);
      }
    };

    // Sync once metadata is available (fires on mobile after load())
    video.addEventListener('loadedmetadata', syncToScroll);
    window.addEventListener('scroll', syncToScroll, { passive: true });

    return () => {
      video.removeEventListener('loadedmetadata', syncToScroll);
      window.removeEventListener('scroll', syncToScroll);
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-white">
      <SEOHead
        canonical="/"
        jsonLd={[LANDING_SCHEMA, FAQ_SCHEMA]}
      />
      <LandingHeader />

      {/* Hero */}
      <section id="inicio" className="relative overflow-hidden" aria-label="Presentación de Zypace">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_30%_50%,rgba(163,230,53,0.10),transparent_65%)]" />
        <div className="max-w-6xl mx-auto px-6 pt-24 pb-32 text-center">
          <span className="inline-block mb-6 px-3 py-1 rounded-full bg-lime-400/10 border border-lime-400/20 text-lime-400 text-xs font-semibold tracking-widest uppercase">30 días gratis · Sin compromiso</span>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-tight text-white">
            Entrena con foco.<br />
            <span className="text-lime-400">Llega listo a tu meta.</span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-zinc-400 max-w-3xl mx-auto">
            Zypace combina inteligencia artificial, tus datos reales de Strava y una experiencia clara para que avances con confianza hacia tu próxima carrera.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/register" className="px-8 py-4 rounded-xl font-semibold bg-lime-400 hover:bg-lime-500 text-black shadow-lg shadow-lime-400/20 transition">Empezar prueba gratuita</Link>
            <Link to="/login" className="px-8 py-4 rounded-xl font-semibold bg-white/5 hover:bg-white/10 text-white border border-white/10 transition">Ya tengo cuenta</Link>
          </div>
          <p className="mt-4 text-sm text-zinc-500">30 días gratis · Luego 9,99 €/mes · Cancela cuando quieras</p>
        </div>
      </section>

      {/* Scroll-driven video preview */}
      <div ref={scrollContainerRef} style={{ height: '400vh' }} className="relative">
        <div className="sticky top-0 h-screen w-full overflow-hidden bg-zinc-950">
          <video
            ref={videoRef}
            poster={appVideoPoster}
            muted
            playsInline
            preload="auto"
            className="absolute inset-0 w-full h-full object-cover"
          >
            <source src={appVideo} type="video/mp4" />
          </video>
          {/* Dark overlay with text — entire section shaded, fades out on first 20% of scroll */}
          <div
            ref={overlayRef}
            className="absolute inset-0 flex items-start justify-center pointer-events-none bg-zinc-950/80"
          >
            <div className="mt-24 md:mt-28 px-6 text-center">
              {/* Ambient glow */}
              <div className="absolute -translate-x-1/2 left-1/2 w-96 h-40 rounded-full bg-lime-400/10 blur-3xl pointer-events-none" />
              <p className="relative text-[11px] font-medium tracking-[0.3em] uppercase text-zinc-500 mb-4">
                Vista previa
              </p>
              <p
                className="relative text-5xl md:text-7xl font-bold tracking-tight leading-tight"
                style={{
                  background: 'linear-gradient(to bottom, #ffffff 20%, #a3e635)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                Nuestra APP
              </p>
            </div>
          </div>

          {/* Subtle gradient at bottom so next section entry feels smooth */}
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-zinc-900 to-transparent pointer-events-none" />
        </div>
      </div>

      {/* Features — slides over video as scroll continues */}
      <section id="funcionalidades" className="relative z-10 py-24 bg-zinc-900" aria-label="Funcionalidades principales">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4 text-white">Todo lo que necesitas en un solo lugar</h2>
          <p className="text-center text-zinc-500 mb-14">Menos hojas de cálculo. Más claridad. Más progreso.</p>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {features.map(f => (
              <div key={f.title} className="group p-6 rounded-2xl bg-zinc-800 border border-zinc-700 hover:border-lime-400/50 transition-all hover:bg-zinc-800/80">
                <div className="text-lime-400 mb-4">{f.icon}</div>
                <h3 className="font-semibold text-base mb-2 text-white group-hover:text-lime-400 transition-colors">{f.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="como-funciona" className="relative z-10 py-24 bg-zinc-950" aria-label="Cómo funciona Zypace">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4 text-white">¿Cómo funciona?</h2>
          <p className="text-center text-zinc-500 mb-12">Un flujo simple para mantenerte constante.</p>
          <div className="grid md:grid-cols-4 gap-6">
            {steps.map(s => (
              <div key={s.step} className="relative p-5 bg-zinc-900 border border-zinc-800 rounded-xl">
                <div className="w-10 h-10 flex items-center justify-center rounded-full bg-lime-400 text-black font-bold mb-4 text-sm">{s.step}</div>
                <h3 className="font-semibold mb-2 text-white text-sm">{s.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="precio" className="relative z-10 py-24 bg-zinc-900" aria-label="Precio de Zypace">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4 text-white">Precio simple y claro</h2>
          <p className="text-center text-zinc-500 mb-12">Sin planes confusos. Sin costes ocultos.</p>

          <div className="max-w-sm mx-auto">
            <div className="relative bg-zinc-950 border border-zinc-700 rounded-2xl overflow-hidden">
              {/* Top accent */}
              <div className="h-1 bg-gradient-to-r from-lime-400 to-lime-300" />

              {/* Trial badge */}
              <div className="absolute top-4 right-4">
                <span className="px-3 py-1 rounded-full bg-lime-400 text-black text-xs font-extrabold uppercase tracking-wide">
                  30 días gratis
                </span>
              </div>

              <div className="p-8">
                <p className="text-xs font-semibold text-lime-400 uppercase tracking-widest mb-3">Zypace Pro</p>

                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-5xl font-extrabold text-white">9,99 €</span>
                  <span className="text-zinc-500">/mes</span>
                </div>
                <p className="text-sm text-lime-400 font-semibold mb-1">Primer mes completamente gratis</p>
                <p className="text-xs text-zinc-500 mb-8">Sin cargos durante 30 días · Cancela cuando quieras</p>

                <ul className="space-y-3 mb-8">
                  {PRICE_FEATURES.map(f => (
                    <li key={f} className="flex items-center gap-3 text-sm text-zinc-300">
                      <svg className="w-4 h-4 text-lime-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  to="/register"
                  className="block w-full text-center py-3.5 rounded-xl font-bold bg-lime-400 hover:bg-lime-500 text-black shadow-lg shadow-lime-400/20 transition"
                >
                  Empezar prueba gratuita
                </Link>
                <p className="text-center text-xs text-zinc-600 mt-3">Introduces tu tarjeta pero no se cobra hasta el día 31 · Pago seguro con Stripe</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 py-24 bg-zinc-950">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6 text-white">Convierte tus actividades en progreso real</h2>
          <p className="text-zinc-400 max-w-3xl mx-auto mb-10">La mayoría de los corredores pierden consistencia por falta de visibilidad. Aquí ves plan vs realidad cada día y la IA te ayuda a mantener el rumbo.</p>
          <Link to="/register" className="inline-block px-10 py-4 rounded-xl font-semibold bg-lime-400 hover:bg-lime-500 text-black shadow-lg shadow-lime-400/20 transition">Empezar prueba gratuita de 30 días</Link>
          <p className="mt-4 text-sm text-zinc-600">Sin compromiso · Cancela antes del día 31 y no pagas nada</p>
        </div>
      </section>

      {/* FAQs */}
      <section id="preguntas-frecuentes" className="relative z-10 py-24 bg-zinc-950" aria-label="Preguntas frecuentes sobre Zypace">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-10 text-white">Preguntas Frecuentes</h2>
          <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-2xl overflow-hidden">
            {faqs.map(item => (
              <details key={item.q} className="group p-6 [&_summary::-webkit-details-marker]:hidden cursor-pointer bg-zinc-900">
                <summary className="flex items-start justify-between">
                  <span className="font-semibold text-zinc-200 group-open:text-lime-400 transition pr-4 text-sm">{item.q}</span>
                  <span className="text-lime-400 group-open:rotate-45 transition text-xl leading-none flex-shrink-0">+</span>
                </summary>
                <p className="mt-3 text-sm text-zinc-400 leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
};

export default LandingPage;
