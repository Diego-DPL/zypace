import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import SEOHead from '../components/SEOHead';

const GRID: React.CSSProperties = {
  backgroundImage: `linear-gradient(rgba(163,230,53,0.035) 1px,transparent 1px),linear-gradient(90deg,rgba(163,230,53,0.035) 1px,transparent 1px)`,
  backgroundSize: '64px 64px',
};

const OUTLINE: React.CSSProperties = {
  fontFamily: "'Barlow Condensed', sans-serif",
  fontWeight: 800,
  WebkitTextStroke: '2px rgba(255,255,255,0.7)',
  color: 'transparent',
  letterSpacing: '0.02em',
};

function RegMark({ className = '' }: { className?: string }) {
  return (
    <div className={`w-6 h-6 relative pointer-events-none select-none ${className}`}>
      <div className="absolute top-1/2 left-0 right-0 h-px bg-zinc-800 -translate-y-px" />
      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-zinc-800 -translate-x-px" />
      <div className="absolute inset-[6px] rounded-full border border-zinc-800" />
    </div>
  );
}

const NotFoundPage = () => {
  const { user } = useAuth();

  return (
    <>
      <SEOHead title="Página no encontrada" noindex />

      <div className="relative min-h-[calc(100vh-64px)] flex items-center justify-center overflow-hidden" style={GRID}>
        {/* Radial glow */}
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_50%_40%_at_50%_45%,rgba(163,230,53,0.05),transparent)]" />

        {/* Registration marks */}
        <RegMark className="absolute top-6 left-6" />
        <RegMark className="absolute top-6 right-6" />
        <RegMark className="absolute bottom-6 left-6" />
        <RegMark className="absolute bottom-6 right-6" />

        {/* Margin annotations */}
        <span className="absolute left-6 top-1/2 -translate-y-1/2 font-mono text-[9px] text-zinc-700 tracking-[0.3em] uppercase"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg) translateY(50%)' }}>
          error · ruta no encontrada
        </span>
        <span className="absolute right-6 top-1/2 -translate-y-1/2 font-mono text-[9px] text-zinc-700 tracking-[0.3em] uppercase"
          style={{ writingMode: 'vertical-rl' }}>
          zypace · 2025
        </span>

        {/* Content */}
        <div className="relative text-center px-6 max-w-xl">
          {/* 404 headline */}
          <div className="select-none mb-6">
            <span className="block font-display font-extrabold text-white leading-none"
              style={{ fontSize: 'clamp(6rem, 20vw, 16rem)', letterSpacing: '-0.03em' }}>
              4
            </span>
            <span className="block leading-none -mt-4 sm:-mt-8"
              style={{ ...OUTLINE, fontSize: 'clamp(6rem, 20vw, 16rem)' }}>
              0
            </span>
            <span className="block font-display font-extrabold text-white leading-none -mt-4 sm:-mt-8"
              style={{ fontSize: 'clamp(6rem, 20vw, 16rem)', letterSpacing: '-0.03em' }}>
              4
            </span>
          </div>

          {/* Annotation line */}
          <div className="flex items-center gap-3 justify-center mb-5">
            <div className="h-px w-10 bg-zinc-700" />
            <span className="font-mono text-[10px] text-zinc-500 tracking-[0.3em] uppercase">ruta no encontrada</span>
            <div className="h-px w-10 bg-zinc-700" />
          </div>

          <p className="text-zinc-400 text-sm leading-relaxed mb-8 max-w-sm mx-auto">
            Esta página no existe o ha sido movida. Vuelve al inicio y sigue entrenando.
          </p>

          <Link
            to={user ? '/app' : '/'}
            className="inline-block bg-lime-400 text-black font-semibold px-6 py-2.5 rounded-lg hover:bg-lime-500 active:bg-lime-600 transition-colors shadow-lg shadow-lime-400/10 text-sm"
          >
            {user ? 'Ir al panel' : 'Volver al inicio'}
          </Link>

          {/* Blueprint ref tag */}
          <div className="mt-12 font-mono text-[9px] text-zinc-700 tracking-widest uppercase">
            ref: err-404 · rev 01
          </div>
        </div>
      </div>
    </>
  );
};

export default NotFoundPage;
