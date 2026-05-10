import { useState } from 'react';
import { Navigate, Link, useSearchParams } from 'react-router-dom';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import SEOHead from '../components/SEOHead';
import zypaceLogo from '../assets/zypace_logo_letras.png';
import { trackEvent } from '../lib/analytics';

const fns = getFunctions(undefined, 'europe-west1');

type DiscountPreview = {
  valid:             boolean;
  discountType?:     'percentage' | 'fixed';
  discountValue?:    number;
  currency?:         string;
  duration?:         string;
  durationInMonths?: number | null;
};

const FEATURES = [
  'Plan de entrenamiento personalizado con IA',
  'Calendario inteligente de entrenamientos y carreras',
  'Sincronización automática con Strava',
  'Calibración de zonas de ritmo',
  'Análisis de progreso semanal por email',
  'Recordatorios de carrera automáticos',
];

export default function SubscribePage() {
  const { user }                                      = useAuth();
  const { hasAccess, isExempt, loading, adminPromoCode } = useSubscription();

  const [searchParams] = useSearchParams();
  const wasCanceled    = searchParams.get('canceled') === 'true';

  const [promoInput,   setPromoInput]   = useState('');
  const [promoPreview, setPromoPreview] = useState<DiscountPreview | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError,   setPromoError]   = useState('');

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError,   setCheckoutError]   = useState('');

  // Redirect if already has access
  if (!loading && (hasAccess || isExempt)) return <Navigate to="/app" replace />;

  const handleValidatePromo = async () => {
    if (!promoInput.trim()) return;
    setPromoLoading(true);
    setPromoError('');
    setPromoPreview(null);
    try {
      const fn  = httpsCallable<{ code: string }, DiscountPreview>(fns, 'validateDiscountCode');
      const res = await fn({ code: promoInput.trim() });
      if (res.data.valid) {
        setPromoPreview(res.data);
      } else {
        setPromoError('Código no válido o expirado');
      }
    } catch {
      setPromoError('Error al validar el código');
    }
    setPromoLoading(false);
  };

  const handleCheckout = async () => {
    setCheckoutLoading(true);
    setCheckoutError('');
    trackEvent('begin_checkout', { currency: 'EUR', value: 9.99 });
    try {
      const fn  = httpsCallable<{ promoCode?: string }, { url: string }>(fns, 'createCheckoutSession');
      const res = await fn({ promoCode: promoPreview?.valid ? promoInput.trim() : undefined });
      if (res.data.url) window.location.href = res.data.url;
    } catch (e: any) {
      setCheckoutError(e?.message || 'Error al iniciar el pago. Inténtalo de nuevo.');
    }
    setCheckoutLoading(false);
  };

  function formatDiscount(p: DiscountPreview): string {
    if (!p.valid) return '';
    const amount = p.discountType === 'percentage'
      ? `${p.discountValue}% de descuento`
      : `${p.discountValue?.toFixed(2)} € de descuento`;
    const dur = p.duration === 'forever'
      ? 'para siempre'
      : p.duration === 'once'
        ? 'el primer mes'
        : `durante ${p.durationInMonths} meses`;
    return `${amount} ${dur}`;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-lime-400 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <SEOHead title="Empieza tu prueba gratuita" canonical="/subscribe" noindex />

      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-start py-12 px-4">

        {/* Logo */}
        <Link to="/">
          <img
            src={zypaceLogo}
            alt="Zypace"
            className="h-8 w-auto mb-10"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
        </Link>

        {/* Canceled banner */}
        {wasCanceled && (
          <div className="w-full max-w-md mb-6 px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-sm text-zinc-400 text-center">
            Has cancelado el proceso de pago. Puedes retomarlo cuando quieras.
          </div>
        )}

        {/* Progress steps */}
        <div className="flex items-center gap-2 mb-10 text-xs">
          <div className="flex items-center gap-1.5 text-lime-400">
            <div className="w-5 h-5 rounded-full bg-lime-400 flex items-center justify-center">
              <svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="font-medium">Cuenta creada</span>
          </div>
          <div className="w-8 h-px bg-zinc-700" />
          <div className="flex items-center gap-1.5 text-zinc-100">
            <div className="w-5 h-5 rounded-full bg-lime-400 text-black flex items-center justify-center font-bold text-[10px]">2</div>
            <span className="font-semibold">Activa tu acceso</span>
          </div>
          <div className="w-8 h-px bg-zinc-700" />
          <div className="flex items-center gap-1.5 text-zinc-600">
            <div className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-[10px]">3</div>
            <span>Empieza</span>
          </div>
        </div>

        {/* Main card */}
        <div className="w-full max-w-md">

          <div className="text-center mb-8">
            <h1 className="text-2xl font-extrabold text-zinc-100">
              Un paso más y ya puedes entrenar
            </h1>
            <p className="text-zinc-500 text-sm mt-2">
              30 días gratis. Sin cargos hasta el día 31.
              {user?.email && (
                <> · <span className="text-zinc-400">{user.email}</span></>
              )}
            </p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">

            {/* Pricing header */}
            <div className="relative p-6 border-b border-zinc-800 bg-gradient-to-br from-lime-400/10 to-transparent">
              <div className="absolute top-4 right-4">
                <span className="px-3 py-1 rounded-full bg-lime-400 text-black text-[11px] font-extrabold uppercase tracking-wide">
                  30 días gratis
                </span>
              </div>
              <p className="text-xs font-semibold text-lime-400 uppercase tracking-widest mb-2">Zypace Pro</p>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-zinc-100">9,99 €</span>
                <span className="text-zinc-500 text-sm">/mes</span>
              </div>
              <p className="text-xs text-zinc-500 mt-1">Después del periodo de prueba · Cancela cuando quieras</p>
            </div>

            {/* Features */}
            <div className="px-6 py-5 space-y-2.5 border-b border-zinc-800">
              {FEATURES.map(f => (
                <div key={f} className="flex items-center gap-3 text-sm text-zinc-300">
                  <svg className="w-4 h-4 text-lime-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {f}
                </div>
              ))}
            </div>

            {/* Promo code + CTA */}
            <div className="p-6 space-y-4">

              {/* Admin promo code notice */}
              {adminPromoCode && (
                <div className="text-xs text-lime-400 bg-lime-400/10 border border-lime-400/20 rounded-lg px-3 py-2.5 flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Tienes un descuento asignado que se aplicará automáticamente.
                </div>
              )}

              {/* Manual promo code */}
              {!adminPromoCode && (
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-2">
                    ¿Tienes un código de descuento?
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={promoInput}
                      onChange={e => { setPromoInput(e.target.value.toUpperCase()); setPromoPreview(null); setPromoError(''); }}
                      onKeyDown={e => e.key === 'Enter' && handleValidatePromo()}
                      placeholder="CÓDIGO"
                      maxLength={30}
                      className="flex-1 px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-600 focus:ring-2 focus:ring-lime-400 outline-none font-mono tracking-wider"
                    />
                    <button
                      onClick={handleValidatePromo}
                      disabled={!promoInput.trim() || promoLoading}
                      className="px-4 py-2 text-sm font-semibold bg-zinc-700 hover:bg-zinc-600 text-zinc-100 rounded-lg disabled:opacity-50 transition-colors"
                    >
                      {promoLoading ? '…' : 'Aplicar'}
                    </button>
                  </div>
                  {promoError && (
                    <p className="text-xs text-red-400 mt-1.5">{promoError}</p>
                  )}
                  {promoPreview?.valid && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-lime-400 bg-lime-400/10 border border-lime-400/20 rounded-lg px-3 py-2">
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {formatDiscount(promoPreview)}
                    </div>
                  )}
                </div>
              )}

              {checkoutError && (
                <p className="text-sm text-red-400 text-center">{checkoutError}</p>
              )}

              <button
                onClick={handleCheckout}
                disabled={checkoutLoading}
                className="w-full py-3.5 text-sm font-bold bg-lime-400 hover:bg-lime-500 text-black rounded-xl disabled:opacity-50 shadow-lg shadow-lime-400/20 transition-all active:scale-[0.98]"
              >
                {checkoutLoading
                  ? <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
                      Redirigiendo a Stripe…
                    </span>
                  : 'Empezar prueba gratuita de 30 días →'
                }
              </button>

              <div className="flex items-center justify-center gap-4 text-[11px] text-zinc-600">
                <span className="flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Pago seguro con Stripe
                </span>
                <span>·</span>
                <span>Sin cargos hasta el día 31</span>
                <span>·</span>
                <span>Cancela cuando quieras</span>
              </div>
            </div>
          </div>

          {/* Help link */}
          <p className="text-center text-xs text-zinc-600 mt-6">
            ¿Tienes alguna duda?{' '}
            <Link to="/support" className="text-zinc-400 hover:text-lime-400 transition-colors underline underline-offset-2">
              Contacta con el equipo
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
