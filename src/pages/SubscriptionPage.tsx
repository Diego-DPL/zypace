import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useSubscription } from '../context/SubscriptionContext';
import { useAuth } from '../context/AuthContext';

const fns = getFunctions(undefined, 'europe-west1');

type DiscountPreview = {
  valid:            boolean;
  discountType?:    'percentage' | 'fixed';
  discountValue?:   number;
  currency?:        string;
  duration?:        string;
  durationInMonths?: number | null;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  active:     { label: 'Activa',    color: 'text-green-400',  bg: 'bg-green-950/50 border-green-800' },
  trialing:   { label: 'Prueba',    color: 'text-lime-400',   bg: 'bg-lime-950/50 border-lime-800' },
  past_due:   { label: 'Pago pendiente', color: 'text-yellow-400', bg: 'bg-yellow-950/50 border-yellow-800' },
  canceled:   { label: 'Cancelada', color: 'text-zinc-500',   bg: 'bg-zinc-900 border-zinc-700' },
  incomplete: { label: 'Incompleta', color: 'text-orange-400', bg: 'bg-orange-950/50 border-orange-800' },
};

export default function SubscriptionPage() {
  const { user }                          = useAuth();
  const { hasAccess, isExempt, subscriptionStatus, periodEnd, adminPromoCode, loading } = useSubscription();
  const [searchParams]                    = useSearchParams();

  const [promoInput,    setPromoInput]   = useState('');
  const [promoPreview,  setPromoPreview] = useState<DiscountPreview | null>(null);
  const [promoLoading,  setPromoLoading] = useState(false);
  const [promoError,    setPromoError]   = useState('');

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading,   setPortalLoading]   = useState(false);
  const [actionError,     setActionError]     = useState('');

  const sessionId  = searchParams.get('session_id');
  const wasCanceled = searchParams.get('canceled') === 'true';

  // If just returned from successful checkout, context will update automatically
  useEffect(() => {
    if (sessionId) {
      // Clean URL without reload
      window.history.replaceState({}, '', '/subscription');
    }
  }, [sessionId]);

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
    setActionError('');
    try {
      const fn  = httpsCallable<{ promoCode?: string }, { url: string }>(fns, 'createCheckoutSession');
      const res = await fn({ promoCode: promoPreview?.valid ? promoInput.trim() : undefined });
      if (res.data.url) window.location.href = res.data.url;
    } catch (e: any) {
      setActionError(e?.message || 'Error al iniciar el pago. Inténtalo de nuevo.');
    }
    setCheckoutLoading(false);
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    setActionError('');
    try {
      const fn  = httpsCallable<Record<string, never>, { url: string }>(fns, 'createPortalSession');
      const res = await fn({});
      if (res.data.url) window.location.href = res.data.url;
    } catch (e: any) {
      setActionError(e?.message || 'Error al abrir el portal. Inténtalo de nuevo.');
    }
    setPortalLoading(false);
  };

  function formatDiscount(p: DiscountPreview): string {
    if (!p.valid) return '';
    const amount = p.discountType === 'percentage'
      ? `${p.discountValue}%`
      : `${p.discountValue?.toFixed(2)} €`;
    const dur = p.duration === 'forever'
      ? 'siempre'
      : p.duration === 'once'
        ? '1 mes'
        : `${p.durationInMonths} meses`;
    return `${amount} de descuento durante ${dur}`;
  }

  function formatDate(ms: number): string {
    return new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-lime-400 animate-spin" />
      </div>
    );
  }

  const status = subscriptionStatus ?? null;
  const statusConfig = status ? STATUS_CONFIG[status] : null;

  return (
    <main className="container mx-auto px-4 py-12 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-zinc-100">Suscripción</h1>
        <p className="text-zinc-500 mt-1 text-sm">Gestiona tu acceso a Zypace</p>
      </div>

      {/* ── Success banner ─────────────────────────────────────────── */}
      {sessionId && (
        <div className="mb-6 p-4 rounded-xl bg-lime-950/50 border border-lime-800 text-lime-300 text-sm">
          <p className="font-semibold mb-1">¡Prueba gratuita activada!</p>
          <p className="text-lime-400/80">Tienes 30 días de acceso completo. No se realizará ningún cargo hasta que finalice el periodo de prueba.</p>
        </div>
      )}

      {/* ── Cancel banner ──────────────────────────────────────────── */}
      {wasCanceled && (
        <div className="mb-6 p-4 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-400 text-sm">
          Has cancelado el proceso de pago. Puedes retomarlo cuando quieras.
        </div>
      )}

      {/* ── Exempt badge ───────────────────────────────────────────── */}
      {isExempt && (
        <div className="mb-6 p-5 rounded-xl bg-lime-400/10 border border-lime-400/30">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-lime-400/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-lime-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-lime-300">Acceso gratuito activado</p>
              <p className="text-xs text-zinc-500 mt-0.5">Tu cuenta tiene acceso especial sin necesidad de suscripción.</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Active / existing subscription ─────────────────────────── */}
      {!isExempt && status && statusConfig && (
        <div className="mb-6 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-200">Estado de tu suscripción</h2>
            <span className={`text-xs font-bold px-3 py-1 rounded-full border ${statusConfig.bg} ${statusConfig.color}`}>
              {statusConfig.label}
            </span>
          </div>

          {periodEnd && (
            <p className="text-sm text-zinc-400">
              {status === 'canceled'
                ? `Acceso hasta: ${formatDate(periodEnd)}`
                : `Próxima renovación: ${formatDate(periodEnd)}`}
            </p>
          )}

          {status === 'past_due' && (
            <p className="text-sm text-yellow-400 bg-yellow-950/40 border border-yellow-800 rounded-lg px-3 py-2">
              Hay un problema con el pago. Actualiza tu método de pago para mantener el acceso.
            </p>
          )}

          {actionError && (
            <p className="text-sm text-red-400">{actionError}</p>
          )}

          <button
            onClick={handlePortal}
            disabled={portalLoading}
            className="w-full py-2.5 text-sm font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-xl border border-zinc-700 disabled:opacity-50 transition-colors"
          >
            {portalLoading ? 'Cargando portal…' : 'Gestionar suscripción'}
          </button>
        </div>
      )}

      {/* ── No subscription / checkout ─────────────────────────────── */}
      {!isExempt && (!status || status === 'canceled') && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          {/* Plan header */}
          <div className="bg-gradient-to-br from-lime-400/10 to-transparent p-6 border-b border-zinc-800">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-lime-400 uppercase tracking-widest mb-2">Zypace Pro</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-zinc-100">9,99 €</span>
                  <span className="text-zinc-500 text-sm">/mes</span>
                </div>
                <p className="text-sm text-lime-400 font-semibold mt-1">30 días gratis para empezar</p>
                <p className="text-xs text-zinc-500 mt-0.5">Sin cargos hasta el día 31 · Cancela cuando quieras</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-lime-400/10 flex items-center justify-center shrink-0">
                <svg className="w-6 h-6 text-lime-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="p-6 space-y-3 border-b border-zinc-800">
            {[
              'Planes de entrenamiento personalizados con IA',
              'Calendario inteligente de carreras y entrenamientos',
              'Sincronización automática con Strava',
              'Análisis de progreso semanal',
              'Calibración de zonas de ritmo',
            ].map(f => (
              <div key={f} className="flex items-center gap-3 text-sm text-zinc-300">
                <svg className="w-4 h-4 text-lime-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {f}
              </div>
            ))}
          </div>

          {/* Promo code + checkout */}
          <div className="p-6 space-y-4">
            {/* Admin-assigned promo code notice */}
            {adminPromoCode && (
              <div className="text-xs text-lime-400 bg-lime-400/10 border border-lime-400/20 rounded-lg px-3 py-2">
                Tienes un código de descuento asignado que se aplicará automáticamente.
              </div>
            )}

            {/* Manual promo code input */}
            {!adminPromoCode && (
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-2">
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

            {actionError && (
              <p className="text-sm text-red-400">{actionError}</p>
            )}

            {/* Trial notice */}
            <div className="rounded-xl bg-lime-400/5 border border-lime-400/20 p-4 space-y-1.5">
              <p className="text-xs font-semibold text-lime-400 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                30 días gratis, sin compromiso
              </p>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Necesitas introducir una tarjeta, pero <strong className="text-zinc-200">no se realizará ningún cargo hasta pasados los 30 días</strong>. Puedes cancelar en cualquier momento antes del día 31 y no pagarás nada.
              </p>
            </div>

            <button
              onClick={handleCheckout}
              disabled={checkoutLoading}
              className="w-full py-3.5 text-sm font-bold bg-lime-400 hover:bg-lime-500 text-black rounded-xl disabled:opacity-50 shadow-lg shadow-lime-400/20 transition-all"
            >
              {checkoutLoading ? 'Redirigiendo…' : 'Empezar prueba gratuita de 30 días'}
            </button>

            <p className="text-center text-xs text-zinc-600">
              Pago seguro con Stripe · Sin cargos hasta el día 31
            </p>
          </div>
        </div>
      )}

      {/* ── Back link ──────────────────────────────────────────────── */}
      <div className="mt-8">
        <Link to="/app" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
          ← Volver al inicio
        </Link>
      </div>

      <div className="mt-6 text-xs text-zinc-700 text-center">
        {user?.email}
      </div>
    </main>
  );
}
