import { useEffect, useState } from 'react';

type ConsentState = {
  essential: boolean;
  analytics: boolean;
  marketing: boolean;
  decided: boolean; // si ya aceptó o guardó
};

const STORAGE_KEY = 'zypace_cookie_consent_v1';

const defaultState: ConsentState = {
  essential: true,
  analytics: false,
  marketing: false,
  decided: false,
};

const CookieConsentBanner = () => {
  const [open, setOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [state, setState] = useState<ConsentState>(defaultState);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ConsentState;
        setState(parsed);
        if (!parsed.decided) setOpen(true); else setOpen(false);
      } else {
        setOpen(true);
      }
    } catch {
      setOpen(true);
    }
  }, []);

  useEffect(()=>{
    const handler = () => { setPrefsOpen(true); setOpen(true); };
    window.addEventListener('open-cookie-preferences', handler as any);
    return ()=> window.removeEventListener('open-cookie-preferences', handler as any);
  },[]);

  const persist = (s: ConsentState) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  };

  const acceptAll = () => {
    const s: ConsentState = { essential:true, analytics:true, marketing:true, decided:true };
    setState(s); persist(s); setOpen(false); setPrefsOpen(false);
  };
  const rejectNonEssential = () => {
    const s: ConsentState = { essential:true, analytics:false, marketing:false, decided:true };
    setState(s); persist(s); setOpen(false); setPrefsOpen(false);
  };
  const savePrefs = () => {
    const s: ConsentState = { ...state, essential:true, decided:true };
    setState(s); persist(s); setOpen(false); setPrefsOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-safe pointer-events-none">
      <div className="max-w-5xl mx-auto mb-4 pointer-events-auto rounded-2xl border border-gray-200 bg-white/90 backdrop-blur shadow-lg p-6 text-sm text-gray-700">
        {!prefsOpen && (
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-gray-800 mb-1">Tu privacidad</h2>
              <p className="text-xs leading-relaxed">Usamos cookies esenciales para que la app funcione. Opcionalmente podremos usar analítica para mejorar el producto. Puedes cambiar tu elección en cualquier momento.</p>
              <p className="text-[11px] mt-2 text-gray-500">Consulta la <a href="/privacy" className="underline hover:text-orange-600">privacidad</a> y <a href="/cookies" className="underline hover:text-orange-600">cookies</a>.</p>
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              <button onClick={rejectNonEssential} className="px-4 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-xs font-medium">Rechazar</button>
              <button onClick={()=>setPrefsOpen(true)} className="px-4 py-2 rounded-md border border-orange-400 bg-orange-50 text-orange-600 hover:bg-orange-100 text-xs font-medium">Configurar</button>
              <button onClick={acceptAll} className="px-4 py-2 rounded-md bg-gradient-to-r from-orange-500 via-pink-500 to-purple-600 text-white text-xs font-semibold shadow hover:shadow-md">Aceptar todo</button>
            </div>
          </div>
        )}
        {prefsOpen && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-800">Preferencias de cookies</h2>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <input type="checkbox" checked disabled className="mt-1 h-4 w-4 text-orange-600 border-gray-300 rounded" />
                <div>
                  <p className="text-xs font-medium text-gray-800">Esenciales</p>
                  <p className="text-[11px] text-gray-500">Necesarias para el funcionamiento básico (sesión y seguridad).</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={state.analytics} onChange={e=>setState(s=>({...s, analytics:e.target.checked}))} className="mt-1 h-4 w-4 text-orange-600 border-gray-300 rounded" />
                <div>
                  <p className="text-xs font-medium text-gray-800">Analítica</p>
                  <p className="text-[11px] text-gray-500">Nos ayuda a entender uso (activaremos cuando la aceptes).</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={state.marketing} onChange={e=>setState(s=>({...s, marketing:e.target.checked}))} className="mt-1 h-4 w-4 text-orange-600 border-gray-300 rounded" />
                <div>
                  <p className="text-xs font-medium text-gray-800">Marketing</p>
                  <p className="text-[11px] text-gray-500">Personalización de contenidos / futuras campañas.</p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={()=>{setPrefsOpen(false);}} className="px-4 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-xs font-medium">Volver</button>
              <button onClick={rejectNonEssential} className="px-4 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-xs font-medium">Solo esenciales</button>
              <button onClick={savePrefs} className="px-4 py-2 rounded-md bg-gradient-to-r from-orange-500 via-pink-500 to-purple-600 text-white text-xs font-semibold shadow">Guardar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CookieConsentBanner;
