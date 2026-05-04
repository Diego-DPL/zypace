import LandingHeader from "../components/LandingHeader";
import { Link } from 'react-router-dom';

const features = [
  {
    title: 'Calendario Inteligente',
    desc: 'Centraliza carreras, entrenamientos planificados y actividades reales de Strava en una sola vista.',
    icon: '🗓️'
  },
  {
    title: 'Planes con IA',
    desc: 'Genera planes personalizados adaptados a tu objetivo y fecha de carrera, con ajustes dinámicos.',
    icon: '🤖'
  },
  {
    title: 'Sincroniza con Strava',
    desc: 'Importa automáticamente tus actividades y marca entrenos como completados sin esfuerzo.',
    icon: '⚡'
  },
  {
    title: 'Progreso Claro',
    desc: 'Visualiza qué has hecho, qué falta y cómo avanza tu preparación semana a semana.',
    icon: '📈'
  }
];

const steps = [
  { step: '1', title: 'Crea tu cuenta', text: 'Regístrate en segundos y configura tu primera carrera objetivo.' },
  { step: '2', title: 'Conecta Strava', text: 'Otorga acceso seguro para sincronizar tus actividades automáticamente.' },
  { step: '3', title: 'Genera tu plan', text: 'Elige una carrera y deja que la IA construya tu preparación.' },
  { step: '4', title: 'Entrena y ajusta', text: 'Cada actividad importada se refleja y ajusta tu progreso.' },
];

const faqs = [
  { q: '¿Necesito pagar para usarlo?', a: 'Actualmente la plataforma está en fase temprana y puedes probar las funciones base gratis.' },
  { q: '¿Puedo regenerar un plan?', a: 'Sí, puedes regenerar y reemplazarlo si cambian tus objetivos o la fecha.' },
  { q: '¿Soporta otros deportes?', a: 'De momento nos centramos en running. Próximamente añadiremos ciclismo y triatlón.' },
  { q: '¿Cómo se calcula el progreso?', a: 'Comparamos tus entrenos planificados vs actividades reales y señalamos cumplimiento.' }
];

const LandingPage = () => {
  return (
    <div className="min-h-screen flex flex-col bg-white text-neutral-800">
      <LandingHeader />

      {/* Hero */}
      <section className="relative overflow-hidden bg-zinc-950">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_30%_50%,rgba(163,230,53,0.12),transparent_65%)]" />
        <div className="max-w-6xl mx-auto px-6 pt-24 pb-32 text-center">
          <span className="inline-block mb-6 px-3 py-1 rounded-full bg-lime-400/10 border border-lime-400/30 text-lime-400 text-xs font-semibold tracking-widest uppercase">Entrenador personal con IA</span>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-tight text-white">
            Entrena con foco.<br />
            <span className="text-lime-400">Llega listo a tu meta.</span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-zinc-400 max-w-3xl mx-auto">
            Zypace combina inteligencia artificial, tus datos reales de Strava y una experiencia clara para que avances con confianza hacia tu próxima carrera.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/register" className="px-8 py-4 rounded-xl font-semibold bg-lime-400 hover:bg-lime-500 text-black shadow-lg shadow-lime-400/20 transition">Comenzar Gratis</Link>
            <Link to="/login" className="px-8 py-4 rounded-xl font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/10 transition">Ya tengo cuenta</Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4 text-zinc-900">Todo lo que necesitas en un solo lugar</h2>
          <p className="text-center text-neutral-500 mb-14">Menos hojas de cálculo. Más claridad. Más progreso.</p>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {features.map(f => (
              <div key={f.title} className="group relative p-6 rounded-2xl bg-white border border-neutral-200 shadow-sm hover:shadow-md hover:border-lime-400/60 transition">
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="font-semibold text-lg mb-2 group-hover:text-lime-600 transition">{f.title}</h3>
                <p className="text-sm text-neutral-600 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 bg-zinc-950">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4 text-white">¿Cómo funciona?</h2>
          <p className="text-center text-zinc-400 mb-12">Un flujo simple para mantenerte constante.</p>
          <div className="grid md:grid-cols-4 gap-6">
            {steps.map(s => (
              <div key={s.step} className="relative p-5 bg-zinc-900 border border-zinc-800 rounded-xl">
                <div className="w-10 h-10 flex items-center justify-center rounded-full bg-lime-400 text-black font-bold mb-4">{s.step}</div>
                <h3 className="font-semibold mb-2 text-white">{s.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Value / CTA */}
      <section className="py-24 bg-white">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6 text-zinc-900">Convierte tus actividades en progreso real</h2>
          <p className="text-neutral-600 max-w-3xl mx-auto mb-10">La mayoría de los corredores pierden consistencia por falta de visibilidad. Aquí ves plan vs realidad cada día y la IA te ayuda a mantener el rumbo.</p>
          <Link to="/register" className="inline-block px-10 py-4 rounded-xl font-semibold bg-zinc-900 hover:bg-zinc-800 text-lime-400 border border-lime-400/30 shadow-lg transition">Empieza Ahora</Link>
        </div>
      </section>

      {/* FAQs */}
      <section className="py-24 bg-zinc-950">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-10 text-white">Preguntas Frecuentes</h2>
          <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-2xl overflow-hidden bg-zinc-900">
            {faqs.map(item => (
              <details key={item.q} className="group p-6 [&_summary::-webkit-details-marker]:hidden cursor-pointer">
                <summary className="flex items-start justify-between">
                  <span className="font-semibold text-white group-open:text-lime-400 transition pr-4">{item.q}</span>
                  <span className="text-lime-400 group-open:rotate-45 transition text-xl leading-none">+</span>
                </summary>
                <p className="mt-3 text-sm text-zinc-400 leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 text-center text-sm bg-zinc-950 border-t border-zinc-800">
        <p className="text-zinc-500">&copy; {new Date().getFullYear()} Zypace. Todos los derechos reservados.</p>
        <p className="mt-2 text-zinc-600">Construido para runners que quieren claridad y consistencia.</p>
      </footer>
    </div>
  );
};

export default LandingPage;
