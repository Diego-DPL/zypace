import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { sendPasswordResetEmail } from 'firebase/auth';
import { db, functions, auth } from '../lib/firebaseClient';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import connectWithStrava from '../assets/1.1 Connect with Strava Buttons/Connect with Strava Orange/btn_strava_connect_with_orange_x2.svg';
import compatibleWithStrava from '../assets/1.2-Strava-API-Logos/Compatible with Strava/cptblWith_strava_white/api_logo_cptblWith_strava_horiz_white.svg';

const SUB_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active:     { label: 'Activa',           color: 'bg-green-950/50 text-green-400 border-green-800' },
  trialing:   { label: 'Prueba',           color: 'bg-lime-950/50 text-lime-400 border-lime-800' },
  past_due:   { label: 'Pago pendiente',   color: 'bg-yellow-950/50 text-yellow-400 border-yellow-800' },
  canceled:   { label: 'Cancelada',        color: 'bg-zinc-800 text-zinc-500 border-zinc-700' },
  incomplete: { label: 'Incompleta',       color: 'bg-orange-950/50 text-orange-400 border-orange-800' },
};

const SettingsPage = () => {
  const { user, signOut } = useAuth();
  const { hasAccess, isExempt, subscriptionStatus, periodEnd, adminPromoCode } = useSubscription();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // ── Subscription UI ────────────────────────────────────────────
  const [promoInput,      setPromoInput]      = useState('');
  const [promoValid,      setPromoValid]       = useState<null | { discountType: string; discountValue: number; duration: string; durationInMonths: number | null }>(null);
  const [promoError,      setPromoError]       = useState('');
  const [promoLoading,    setPromoLoading]     = useState(false);
  const [checkoutLoading, setCheckoutLoading]  = useState(false);
  const [portalLoading,   setPortalLoading]    = useState(false);
  const [subActionError,  setSubActionError]   = useState('');

  const subSuccess  = searchParams.get('sub') === 'ok';
  const subCanceled = searchParams.get('sub') === 'canceled';

  useEffect(() => {
    if (subSuccess || subCanceled) {
      window.history.replaceState({}, '', '/settings');
    }
  }, [subSuccess, subCanceled]);

  const handleValidatePromo = async () => {
    if (!promoInput.trim()) return;
    setPromoLoading(true); setPromoError(''); setPromoValid(null);
    try {
      const fn  = httpsCallable<{ code: string }, any>(functions, 'validateDiscountCode');
      const res = await fn({ code: promoInput.trim() });
      if (res.data.valid) setPromoValid(res.data);
      else setPromoError('Código no válido o expirado');
    } catch { setPromoError('Error al validar el código'); }
    setPromoLoading(false);
  };

  const handleCheckout = async () => {
    setCheckoutLoading(true); setSubActionError('');
    try {
      const fn  = httpsCallable<{ promoCode?: string }, { url: string }>(functions, 'createCheckoutSession');
      const res = await fn({ promoCode: promoValid ? promoInput.trim() : undefined });
      if (res.data.url) window.location.href = res.data.url;
    } catch (e: any) { setSubActionError(e?.message || 'Error al iniciar el pago'); }
    setCheckoutLoading(false);
  };

  const handlePortal = async () => {
    setPortalLoading(true); setSubActionError('');
    try {
      const fn  = httpsCallable<Record<string, never>, { url: string }>(functions, 'createPortalSession');
      const res = await fn({});
      if (res.data.url) window.location.href = res.data.url;
    } catch (e: any) { setSubActionError(e?.message || 'Error al abrir el portal'); }
    setPortalLoading(false);
  };

  function fmtDate(ms: number) {
    return new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function fmtDiscount() {
    if (!promoValid) return '';
    const val = promoValid.discountType === 'percentage' ? `${promoValid.discountValue}%` : `${promoValid.discountValue} €`;
    const dur = promoValid.duration === 'forever' ? 'siempre' : promoValid.duration === 'once' ? '1 mes' : `${promoValid.durationInMonths} meses`;
    return `${val} de descuento durante ${dur}`;
  }

  // ── Strava ─────────────────────────────────────────────────────
  const [isStravaConnected, setIsStravaConnected] = useState(false);
  const [stravaLoading, setStravaLoading]         = useState(true);

  const verifyStravaConnection = useCallback(async () => {
    if (!user) return;
    setStravaLoading(true);
    try {
      const tokenSnap = await getDoc(doc(db, 'users', user.uid, 'strava_tokens', 'default'));
      if (!tokenSnap.exists()) { setIsStravaConnected(false); return; }
      const tokenData = tokenSnap.data();
      const response = await fetch('https://www.strava.com/api/v3/athlete', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (response.ok) {
        setIsStravaConnected(true);
      } else {
        await deleteDoc(doc(db, 'users', user.uid, 'strava_tokens', 'default'));
        setIsStravaConnected(false);
      }
    } catch {
      setIsStravaConnected(false);
    } finally {
      setStravaLoading(false);
    }
  }, [user]);

  useEffect(() => { verifyStravaConnection(); }, [verifyStravaConnection]);

  const authUrl = useMemo(() => {
    const clientId    = import.meta.env.VITE_STRAVA_CLIENT_ID;
    const redirectUri = `${window.location.origin}/strava-callback`;
    const scope       = 'read,activity:read,activity:read_all';
    return `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&approval_prompt=force&scope=${encodeURIComponent(scope)}`;
  }, []);

  const handleConnectToStrava = () => {
    const popup = window.open(authUrl, 'stravaAuth', 'width=600,height=700');
    const interval = setInterval(() => {
      if (popup && popup.closed) { clearInterval(interval); verifyStravaConnection(); }
    }, 1000);
  };

  const handleDisconnectFromStrava = async () => {
    if (!user) return;
    try {
      const tokenSnap = await getDoc(doc(db, 'users', user.uid, 'strava_tokens', 'default'));
      if (tokenSnap.exists()) {
        const { access_token } = tokenSnap.data();
        await fetch('https://www.strava.com/oauth/deauthorize', {
          method: 'POST', headers: { Authorization: `Bearer ${access_token}` },
        });
      }
    } catch { /* silencioso */ } finally {
      await deleteDoc(doc(db, 'users', user.uid, 'strava_tokens', 'default'));
      setIsStravaConnected(false);
    }
  };

  // ── Personal data ──────────────────────────────────────────────
  const [firstName,      setFirstName]      = useState('');
  const [lastName,       setLastName]       = useState('');
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [personalMsg,    setPersonalMsg]    = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'users', user.uid)).then(snap => {
      if (snap.exists()) {
        const d = snap.data();
        setFirstName(d.first_name || '');
        setLastName(d.last_name || '');
      }
    });
  }, [user]);

  const handleSavePersonalData = async () => {
    if (!user) return;
    setSavingPersonal(true);
    setPersonalMsg(null);
    try {
      await setDoc(doc(db, 'users', user.uid), {
        first_name: firstName.trim(),
        last_name:  lastName.trim(),
      }, { merge: true });
      setPersonalMsg({ type: 'success', text: 'Datos actualizados.' });
    } catch {
      setPersonalMsg({ type: 'error', text: 'Error al guardar los datos.' });
    } finally {
      setSavingPersonal(false);
    }
  };

  // ── Password reset ─────────────────────────────────────────────
  const [passwordResetLoading, setPasswordResetLoading] = useState(false);
  const [passwordResetMsg, setPasswordResetMsg]         = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handlePasswordReset = async () => {
    if (!user?.email) return;
    setPasswordResetLoading(true);
    setPasswordResetMsg(null);
    try {
      await sendPasswordResetEmail(auth, user.email);
      setPasswordResetMsg({ type: 'success', text: `Se ha enviado un enlace de cambio de contraseña a ${user.email}.` });
    } catch (e: any) {
      setPasswordResetMsg({ type: 'error', text: e?.message || 'Error al enviar el email.' });
    } finally {
      setPasswordResetLoading(false);
    }
  };

  // ── Delete account ─────────────────────────────────────────────
  const [deleteModal,   setDeleteModal]   = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError,   setDeleteError]   = useState('');

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'ELIMINAR') return;
    setDeleteLoading(true);
    setDeleteError('');
    try {
      const fn = httpsCallable(functions, 'deleteAccount');
      await fn({});
      await signOut();
      navigate('/');
    } catch (e: any) {
      setDeleteError(e?.message || 'Error al eliminar la cuenta. Inténtalo de nuevo.');
      setDeleteLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────

  return (
    <main className="container mx-auto p-8 space-y-8">
      <h1 className="text-4xl font-bold text-zinc-100">Ajustes</h1>

      {/* ── Suscripción ── */}
      <div className="bg-zinc-900 p-6 rounded-xl shadow-lg space-y-4">
        <h2 className="text-2xl font-bold text-zinc-100">Suscripción</h2>

        {subSuccess && (
          <div className="p-3 rounded-lg bg-green-950/50 border border-green-800 text-green-300 text-sm">
            ¡Pago completado! Tu suscripción ya está activa.
          </div>
        )}
        {subCanceled && (
          <div className="p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 text-sm">
            Has cancelado el proceso de pago. Puedes retomarlo cuando quieras.
          </div>
        )}

        {isExempt && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-lime-400/10 border border-lime-400/30">
            <svg className="w-5 h-5 text-lime-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-lime-300">Acceso gratuito activado</p>
              <p className="text-xs text-zinc-500 mt-0.5">Tu cuenta tiene acceso especial sin necesidad de suscripción.</p>
            </div>
          </div>
        )}

        {!isExempt && subscriptionStatus && subscriptionStatus !== 'canceled' && (() => {
          const cfg = SUB_STATUS_CONFIG[subscriptionStatus];
          return (
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="space-y-1">
                  <p className="text-sm text-zinc-400">
                    Estado:{' '}
                    <span className={`inline-block text-xs font-bold px-2.5 py-0.5 rounded-full border ${cfg?.color}`}>
                      {cfg?.label}
                    </span>
                  </p>
                  {periodEnd && (
                    <p className="text-xs text-zinc-500">Próxima renovación: {fmtDate(periodEnd)}</p>
                  )}
                </div>
                <button onClick={handlePortal} disabled={portalLoading}
                  className="px-4 py-2 text-sm font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg border border-zinc-700 disabled:opacity-50 transition-colors">
                  {portalLoading ? 'Cargando…' : 'Gestionar suscripción'}
                </button>
              </div>
              {subscriptionStatus === 'past_due' && (
                <p className="text-xs text-yellow-400 bg-yellow-950/40 border border-yellow-800 rounded-lg px-3 py-2">
                  Hay un problema con el pago. Pulsa "Gestionar suscripción" para actualizar tu método de pago.
                </p>
              )}
            </div>
          );
        })()}

        {!isExempt && (!subscriptionStatus || subscriptionStatus === 'canceled') && (
          <div className="space-y-4">
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-extrabold text-zinc-100">9,99 €</span>
              <span className="text-zinc-500 text-sm">/mes · Cancela cuando quieras</span>
            </div>

            {adminPromoCode && (
              <p className="text-xs text-lime-400 bg-lime-400/10 border border-lime-400/20 rounded-lg px-3 py-2">
                Tienes un código de descuento asignado que se aplicará automáticamente.
              </p>
            )}

            {!adminPromoCode && (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-zinc-400">¿Tienes un código de descuento?</label>
                <div className="flex gap-2">
                  <input
                    value={promoInput}
                    onChange={e => { setPromoInput(e.target.value.toUpperCase()); setPromoValid(null); setPromoError(''); }}
                    onKeyDown={e => e.key === 'Enter' && handleValidatePromo()}
                    placeholder="CÓDIGO" maxLength={30}
                    className="flex-1 px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-600 font-mono focus:ring-2 focus:ring-lime-400 outline-none"
                  />
                  <button onClick={handleValidatePromo} disabled={!promoInput.trim() || promoLoading}
                    className="px-4 py-2 text-sm font-semibold bg-zinc-700 hover:bg-zinc-600 text-zinc-100 rounded-lg disabled:opacity-50 transition-colors">
                    {promoLoading ? '…' : 'Aplicar'}
                  </button>
                </div>
                {promoError && <p className="text-xs text-red-400">{promoError}</p>}
                {promoValid && (
                  <p className="text-xs text-lime-400 bg-lime-400/10 border border-lime-400/20 rounded-lg px-3 py-2">✓ {fmtDiscount()}</p>
                )}
              </div>
            )}

            {subActionError && <p className="text-sm text-red-400">{subActionError}</p>}

            <button onClick={handleCheckout} disabled={checkoutLoading}
              className="w-full sm:w-auto px-8 py-3 text-sm font-bold bg-lime-400 hover:bg-lime-500 text-black rounded-xl disabled:opacity-50 shadow-lg shadow-lime-400/20 transition-all">
              {checkoutLoading ? 'Redirigiendo…' : 'Suscribirme — 9,99 €/mes'}
            </button>
            <p className="text-xs text-zinc-600">Pago seguro con Stripe</p>
          </div>
        )}

        {subActionError && hasAccess && <p className="text-sm text-red-400">{subActionError}</p>}
      </div>

      {/* ── Integraciones / Strava ── */}
      <div className="bg-zinc-900 p-6 rounded-xl shadow-lg">
        <h2 className="text-2xl font-bold text-zinc-100 mb-4">Integraciones</h2>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <img src={compatibleWithStrava} alt="Compatible with Strava" className="h-6 w-auto" />
            <p className="text-sm sm:text-base font-medium text-zinc-200">
              {isStravaConnected ? 'Conectado a Strava' : 'Conecta tu cuenta de Strava para sincronizar actividades.'}
            </p>
          </div>
          {stravaLoading ? (
            <p className="text-sm text-zinc-500">Cargando…</p>
          ) : isStravaConnected ? (
            <button onClick={handleDisconnectFromStrava}
              className="bg-red-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-600 transition-colors">
              Desconectar
            </button>
          ) : (
            <>
              <button onClick={handleConnectToStrava} className="p-0 bg-transparent border-0" aria-label="Connect with Strava">
                <img src={connectWithStrava} alt="Connect with Strava" style={{ height: 48 }} />
              </button>
              <a href={authUrl} target="_blank" rel="noopener noreferrer" className="sr-only">Connect with Strava</a>
            </>
          )}
        </div>
      </div>

      {/* ── Perfil de corredor ── */}
      <div className="bg-zinc-900 p-6 rounded-xl shadow-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-zinc-100">Perfil de corredor y zonas</h2>
          <p className="text-sm text-zinc-500 mt-0.5">Gestiona tu nivel, volumen, zonas de entrenamiento y lesiones.</p>
        </div>
        <Link
          to="/profile"
          className="shrink-0 px-5 py-2.5 text-sm font-semibold bg-lime-400/10 border border-lime-400/30 text-lime-400 hover:bg-lime-400/20 rounded-xl transition-colors"
        >
          Ir a Mi Perfil →
        </Link>
      </div>

      {/* ── Datos personales ── */}
      <div className="bg-zinc-900 p-6 rounded-xl shadow-lg space-y-4">
        <h2 className="text-2xl font-bold text-zinc-100">Datos personales</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-zinc-200 mb-1.5">Nombre</label>
            <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)}
              placeholder="Tu nombre"
              className="w-full p-2.5 border border-zinc-700 rounded-lg bg-zinc-800 text-zinc-100 text-sm placeholder-zinc-500 focus:ring-2 focus:ring-lime-400 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-zinc-200 mb-1.5">Apellidos</label>
            <input type="text" value={lastName} onChange={e => setLastName(e.target.value)}
              placeholder="Tus apellidos"
              className="w-full p-2.5 border border-zinc-700 rounded-lg bg-zinc-800 text-zinc-100 text-sm placeholder-zinc-500 focus:ring-2 focus:ring-lime-400 outline-none" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-zinc-200 mb-1.5">Email</label>
          <p className="text-sm text-zinc-400 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5">
            {user?.email}
          </p>
        </div>
        {personalMsg && (
          <div className={`rounded-lg px-4 py-3 text-sm ${personalMsg.type === 'success' ? 'bg-green-950/50 border border-green-800 text-green-400' : 'bg-red-950/50 border border-red-800 text-red-400'}`}>
            {personalMsg.text}
          </div>
        )}
        <button onClick={handleSavePersonalData} disabled={savingPersonal}
          className="px-5 py-2.5 bg-lime-400 hover:bg-lime-500 text-black text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
          {savingPersonal ? 'Guardando…' : 'Guardar datos'}
        </button>
      </div>

      {/* ── Seguridad ── */}
      <div className="bg-zinc-900 p-6 rounded-xl shadow-lg space-y-4">
        <h2 className="text-2xl font-bold text-zinc-100">Seguridad</h2>
        <p className="text-sm text-zinc-400">
          Para cambiar tu contraseña, te enviaremos un enlace seguro a <span className="text-zinc-200">{user?.email}</span>.
        </p>
        {passwordResetMsg && (
          <div className={`rounded-lg px-4 py-3 text-sm ${passwordResetMsg.type === 'success' ? 'bg-green-950/50 border border-green-800 text-green-400' : 'bg-red-950/50 border border-red-800 text-red-400'}`}>
            {passwordResetMsg.text}
          </div>
        )}
        <button onClick={handlePasswordReset} disabled={passwordResetLoading}
          className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
          {passwordResetLoading ? 'Enviando…' : 'Enviar enlace de cambio de contraseña'}
        </button>
      </div>

      {/* ── Soporte ── */}
      <div className="bg-zinc-900 p-6 rounded-xl shadow-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-zinc-100">¿Necesitas ayuda?</h2>
          <p className="text-sm text-zinc-500 mt-0.5">Consulta las preguntas frecuentes o contacta con soporte.</p>
        </div>
        <Link
          to="/support"
          className="shrink-0 px-5 py-2.5 text-sm font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 rounded-xl transition-colors"
        >
          Centro de soporte →
        </Link>
      </div>

      {/* ── Zona de peligro ── */}
      <div className="border border-red-900 bg-red-950/20 p-6 rounded-xl space-y-3">
        <h2 className="text-lg font-bold text-red-400">Zona de peligro</h2>
        <p className="text-sm text-zinc-400">
          Eliminar tu cuenta borrará permanentemente todos tus datos: plan de entrenamiento, actividades, perfil y suscripción. Esta acción no se puede deshacer.
        </p>
        <button
          onClick={() => { setDeleteModal(true); setDeleteConfirm(''); setDeleteError(''); }}
          className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          Eliminar mi cuenta
        </button>
      </div>

      {/* ── Modal confirmación eliminación ── */}
      {deleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={e => { if (e.target === e.currentTarget && !deleteLoading) { setDeleteModal(false); } }}
        >
          <div className="bg-zinc-900 border border-red-900 rounded-2xl p-6 w-full max-w-md space-y-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div>
                <h3 className="text-lg font-bold text-red-400">¿Eliminar cuenta definitivamente?</h3>
                <p className="text-sm text-zinc-400 mt-1">
                  Se borrarán todos tus datos personales, plan de entrenamiento, historial de actividades y se cancelará tu suscripción de forma inmediata. Esta acción es irreversible.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-zinc-300 mb-2">
                Escribe <span className="text-red-400 font-mono">ELIMINAR</span> para confirmar
              </label>
              <input
                type="text"
                value={deleteConfirm}
                onChange={e => setDeleteConfirm(e.target.value)}
                disabled={deleteLoading}
                placeholder="ELIMINAR"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 text-sm font-mono placeholder-zinc-600 focus:ring-2 focus:ring-red-500 outline-none disabled:opacity-50"
              />
            </div>

            {deleteError && (
              <p className="text-sm text-red-400 bg-red-950/50 border border-red-800 rounded-lg px-3 py-2">{deleteError}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteModal(false)}
                disabled={deleteLoading}
                className="flex-1 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirm !== 'ELIMINAR' || deleteLoading}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteLoading ? 'Eliminando…' : 'Eliminar cuenta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default SettingsPage;
