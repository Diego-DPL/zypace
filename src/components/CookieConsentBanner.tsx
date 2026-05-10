import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { initAnalytics } from '../lib/analytics';

type ConsentState = {
  essential: boolean;
  analytics: boolean;
  marketing: boolean;
  decided:   boolean;
};

const STORAGE_KEY = 'zypace_cookie_consent_v1';

const defaultState: ConsentState = {
  essential: true,
  analytics: false,
  marketing: false,
  decided:   false,
};

const CookieConsentBanner = () => {
  const [open,      setOpen]      = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [state,     setState]     = useState<ConsentState>(defaultState);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ConsentState;
        setState(parsed);
        setOpen(!parsed.decided);
      } else {
        setOpen(true);
      }
    } catch {
      setOpen(true);
    }
  }, []);

  // Allow other parts of the app to re-open preferences
  useEffect(() => {
    const handler = () => { setPrefsOpen(true); setOpen(true); };
    window.addEventListener('open-cookie-preferences', handler);
    return () => window.removeEventListener('open-cookie-preferences', handler);
  }, []);

  const persist = (s: ConsentState) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    if (s.analytics) initAnalytics();
  };

  const acceptAll = () => {
    const s: ConsentState = { essential: true, analytics: true, marketing: true, decided: true };
    setState(s); persist(s); setOpen(false); setPrefsOpen(false);
  };

  const rejectNonEssential = () => {
    const s: ConsentState = { essential: true, analytics: false, marketing: false, decided: true };
    setState(s); persist(s); setOpen(false); setPrefsOpen(false);
  };

  const savePrefs = () => {
    const s: ConsentState = { ...state, essential: true, decided: true };
    setState(s); persist(s); setOpen(false); setPrefsOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 pointer-events-none">
      <div className="max-w-4xl mx-auto pointer-events-auto rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl shadow-black/60 p-5 text-sm text-zinc-200">

        {!prefsOpen ? (
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-1">
              <p className="text-xs font-semibold text-zinc-100 mb-1">Tu privacidad</p>
              <p className="text-xs leading-relaxed text-zinc-400">
                Usamos cookies esenciales para que la app funcione. Con tu permiso, también usamos Google Analytics para mejorar el producto.{' '}
                <Link to="/cookies" className="underline underline-offset-2 hover:text-lime-400 transition-colors">Más información</Link>
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={rejectNonEssential}
                className="px-4 py-2 rounded-lg border border-zinc-600 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 text-xs font-medium transition-colors"
              >
                Rechazar
              </button>
              <button
                onClick={() => setPrefsOpen(true)}
                className="px-4 py-2 rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 text-xs font-medium transition-colors"
              >
                Configurar
              </button>
              <button
                onClick={acceptAll}
                className="px-4 py-2 rounded-lg bg-lime-400 text-black hover:bg-lime-500 text-xs font-semibold transition-colors"
              >
                Aceptar todas
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs font-semibold text-zinc-100">Preferencias de cookies</p>
            <div className="space-y-3">
              <label className="flex items-start gap-3 cursor-not-allowed">
                <input type="checkbox" checked disabled
                  className="mt-0.5 h-4 w-4 accent-lime-400 rounded opacity-60" />
                <div>
                  <p className="text-xs font-medium text-zinc-200">Esenciales <span className="text-zinc-500 font-normal">(siempre activas)</span></p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">Sesión de usuario y seguridad. Necesarias para el funcionamiento básico.</p>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={state.analytics}
                  onChange={e => setState(s => ({ ...s, analytics: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 accent-lime-400 rounded" />
                <div>
                  <p className="text-xs font-medium text-zinc-200">Analítica</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">Google Analytics 4. Mide visitas y conversiones de forma anónima para mejorar el producto.</p>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={state.marketing}
                  onChange={e => setState(s => ({ ...s, marketing: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 accent-lime-400 rounded" />
                <div>
                  <p className="text-xs font-medium text-zinc-200">Marketing</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">Personalización de contenidos y futuras campañas. Actualmente no activas.</p>
                </div>
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setPrefsOpen(false)}
                className="px-4 py-2 rounded-lg border border-zinc-600 text-zinc-400 hover:bg-zinc-800 text-xs font-medium transition-colors">
                Volver
              </button>
              <button onClick={rejectNonEssential}
                className="px-4 py-2 rounded-lg border border-zinc-600 text-zinc-400 hover:bg-zinc-800 text-xs font-medium transition-colors">
                Solo esenciales
              </button>
              <button onClick={savePrefs}
                className="px-4 py-2 rounded-lg bg-lime-400 text-black hover:bg-lime-500 text-xs font-semibold transition-colors">
                Guardar preferencias
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CookieConsentBanner;
