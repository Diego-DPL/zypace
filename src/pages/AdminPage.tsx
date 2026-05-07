import { useState, useEffect, useCallback } from 'react';
import {
  collection, getDocs, doc, updateDoc, addDoc,
  query, orderBy, limit, serverTimestamp,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../lib/firebaseClient';
import { useAuth } from '../context/AuthContext';

type Tab = 'dashboard' | 'users' | 'incidents' | 'strava' | 'payments' | 'invites' | 'nps';
type IncidentStatus = 'abierta' | 'en_proceso' | 'resuelta';

interface UserDoc {
  uid: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  experience_level: string | null;
  primary_goal: string | null;
  created_at: any;
  role: string | null;
  banned?: boolean;
  z1_pace_sec_km: number | null;
  z4_pace_sec_km: number | null;
  z5_pace_sec_km: number | null;
  zones_confidence: string | null;
  zones_calibrated_at: string | null;
  // loaded on expand
  plan?: any | null;
  workouts?: any[];
}

type ConfirmAction =
  | { type: 'ban';        uid: string; name: string }
  | { type: 'unban';      uid: string; name: string }
  | { type: 'delete';     uid: string; name: string }
  | { type: 'deletePlan'; uid: string; planId: string; name: string };

// ── Confirm dialog ────────────────────────────────────────────────────
function ConfirmDialog({
  action,
  onConfirm,
  onCancel,
  loading,
}: {
  action: ConfirmAction;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const config = {
    ban:        { title: 'Banear usuario',          msg: `¿Banear a ${action.name}? No podrá iniciar sesión.`,                     btn: 'Banear',          btnClass: 'bg-yellow-500 hover:bg-yellow-600 text-black' },
    unban:      { title: 'Desbanear usuario',        msg: `¿Restaurar el acceso a ${action.name}?`,                                 btn: 'Desbanear',       btnClass: 'bg-green-500 hover:bg-green-600 text-black' },
    delete:     { title: 'Eliminar usuario',         msg: `¿Eliminar permanentemente a ${action.name}? Se borrará toda su cuenta, planes, actividades e incidencias. Esta acción es irreversible.`, btn: 'Eliminar', btnClass: 'bg-red-600 hover:bg-red-700 text-white' },
    deletePlan: { title: 'Eliminar plan',            msg: `¿Eliminar el plan de entrenamiento de ${action.name} y todos sus entrenamientos asociados?`, btn: 'Eliminar plan', btnClass: 'bg-red-600 hover:bg-red-700 text-white' },
  }[action.type];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
        <h3 className="text-lg font-bold text-zinc-100">{config.title}</h3>
        <p className="text-sm text-zinc-400 leading-relaxed">{config.msg}</p>
        <div className="flex justify-end gap-3 pt-1">
          <button onClick={onCancel} disabled={loading}
            className="px-4 py-2 text-sm text-zinc-400 border border-zinc-700 rounded-lg hover:text-zinc-200 transition-colors disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={onConfirm} disabled={loading}
            className={`px-4 py-2 text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors ${config.btnClass}`}>
            {loading ? 'Procesando…' : config.btn}
          </button>
        </div>
      </div>
    </div>
  );
}

interface Incident {
  id: string;
  user_uid: string;
  user_email: string;
  user_name: string;
  subject: string;
  category: string;
  description: string;
  status: IncidentStatus;
  priority: string;
  created_at: any;
  updated_at: any;
  admin_notes: string;
  attachment_url?: string;
  messages: Array<{ sender: string; text: string; timestamp: any }>;
}

const STATUS_CONFIG: Record<IncidentStatus, { label: string; color: string }> = {
  abierta:    { label: 'Abierta',    color: 'bg-red-950/50 text-red-400 border-red-800' },
  en_proceso: { label: 'En proceso', color: 'bg-yellow-950/50 text-yellow-400 border-yellow-800' },
  resuelta:   { label: 'Resuelta',   color: 'bg-green-950/50 text-green-400 border-green-800' },
};

const PRIORITY_COLOR: Record<string, string> = {
  alta: 'text-red-400',
  media: 'text-yellow-400',
  baja: 'text-zinc-500',
};

function fmtPace(sec: number) {
  return `${Math.floor(sec / 60)}:${(Math.round(sec % 60)).toString().padStart(2, '0')}/km`;
}

// ── Admin reply modal ────────────────────────────────────────────────
function IncidentModal({
  incident,
  onClose,
  onSaved,
}: {
  incident: Incident;
  onClose: () => void;
  onSaved: (updated: Incident) => void;
}) {
  const { user } = useAuth();
  const [status, setStatus] = useState<IncidentStatus>(incident.status);
  const [adminNotes, setAdminNotes] = useState(incident.admin_notes || '');
  const [replyText, setReplyText] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const newMessages = replyText.trim()
        ? [...(incident.messages || []), { sender: 'admin', text: replyText.trim(), timestamp: new Date().toISOString() }]
        : incident.messages || [];
      await updateDoc(doc(db, 'incidents', incident.id), {
        status,
        admin_notes: adminNotes,
        messages: newMessages,
        updated_at: serverTimestamp(),
      });
      onSaved({ ...incident, status, admin_notes: adminNotes, messages: newMessages });
    } catch (e) {
      console.error('Error saving incident', e);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${STATUS_CONFIG[incident.status].color}`}>
                  {STATUS_CONFIG[incident.status].label}
                </span>
                <span className={`text-xs font-medium ${PRIORITY_COLOR[incident.priority] ?? 'text-zinc-500'}`}>
                  Prioridad {incident.priority}
                </span>
                <span className="text-xs text-zinc-600">{incident.category}</span>
              </div>
              <h3 className="text-lg font-bold text-zinc-100">{incident.subject}</h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                {incident.user_email} · {incident.user_name} ·{' '}
                {incident.created_at?.toDate?.().toLocaleDateString('es-ES') ?? '—'}
              </p>
            </div>
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-xl leading-none ml-4 shrink-0">✕</button>
          </div>

          {/* Description */}
          <div className="bg-zinc-800/60 rounded-xl p-4 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
            {incident.description || <span className="text-zinc-600 italic">Sin descripción.</span>}
          </div>

          {/* Attachment */}
          {incident.attachment_url && (
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Captura adjunta</p>
              <a href={incident.attachment_url} target="_blank" rel="noopener noreferrer">
                <img
                  src={incident.attachment_url}
                  alt="Adjunto del usuario"
                  className="max-h-64 max-w-full rounded-lg border border-zinc-700 object-contain hover:opacity-90 transition-opacity"
                />
              </a>
            </div>
          )}

          {/* Message thread */}
          {incident.messages?.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Hilo de mensajes</p>
              {incident.messages.map((m, i) => (
                <div key={i} className={`rounded-xl p-3 text-sm ${
                  m.sender === 'admin'
                    ? 'bg-lime-400/10 border border-lime-400/20 text-zinc-200 ml-6'
                    : 'bg-zinc-800 text-zinc-300 mr-6'
                }`}>
                  <p className="text-xs font-bold mb-1 text-zinc-500">{m.sender === 'admin' ? 'Soporte' : 'Usuario'}</p>
                  {m.text}
                </div>
              ))}
            </div>
          )}

          {/* Reply */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-1">Responder al usuario</label>
            <textarea
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              rows={3}
              placeholder="Escribe una respuesta visible para el usuario…"
              className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-lime-400 outline-none resize-none"
            />
          </div>

          {/* Status + notes */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-2">Estado</label>
              <div className="flex flex-wrap gap-2">
                {(['abierta', 'en_proceso', 'resuelta'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                      status === s ? STATUS_CONFIG[s].color : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:border-zinc-500'
                    }`}
                  >
                    {STATUS_CONFIG[s].label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1">Notas internas <span className="text-zinc-600 font-normal">(no visibles al usuario)</span></label>
              <textarea
                value={adminNotes}
                onChange={e => setAdminNotes(e.target.value)}
                rows={2}
                placeholder="Notas privadas…"
                className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-lime-400 outline-none resize-none"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-1 border-t border-zinc-800">
            <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-400 border border-zinc-700 rounded-lg hover:text-zinc-200 transition-colors">
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold bg-lime-400 text-black rounded-lg hover:bg-lime-500 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Strava Webhook Panel ──────────────────────────────────────────────
interface WebhookSubscription {
  id: number;
  callback_url: string;
  created_at: string;
  updated_at: string;
  application_id: number;
}

function StravaWebhookPanel() {
  const [loading, setLoading]           = useState(false);
  const [subscriptions, setSubscriptions] = useState<WebhookSubscription[]>([]);
  const [webhookUrl, setWebhookUrl]     = useState('');
  const [actionState, setActionState]   = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [actionMsg, setActionMsg]       = useState('');

  const fns = getFunctions(undefined, 'europe-west1');

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const fn = httpsCallable<unknown, { subscriptions: WebhookSubscription[]; webhookUrl: string }>(
        fns, 'getStravaWebhookStatus'
      );
      const res = await fn({});
      setSubscriptions(res.data.subscriptions);
      setWebhookUrl(res.data.webhookUrl);
    } catch (e: any) {
      console.error('getStravaWebhookStatus error', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleRegister = async () => {
    setActionState('loading');
    setActionMsg('');
    try {
      const fn = httpsCallable(fns, 'registerStravaWebhook');
      await fn({});
      setActionState('ok');
      setActionMsg('Webhook registrado. Strava enviará los eventos automáticamente.');
      await loadStatus();
    } catch (e: any) {
      setActionState('error');
      setActionMsg(e?.message || 'Error al registrar el webhook');
    }
  };

  const handleDelete = async (id: number) => {
    setActionState('loading');
    setActionMsg('');
    try {
      const fn = httpsCallable(fns, 'deleteStravaWebhook');
      await fn({ subscriptionId: id });
      setActionState('ok');
      setActionMsg('Suscripción eliminada correctamente.');
      await loadStatus();
    } catch (e: any) {
      setActionState('error');
      setActionMsg(e?.message || 'Error al eliminar el webhook');
    }
  };

  const hasSubscription = subscriptions.length > 0;

  return (
    <div className="space-y-5">
      {/* Header card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-200 mb-1">Strava Webhooks</h3>
            <p className="text-xs text-zinc-500 leading-relaxed max-w-lg">
              En lugar de consultar la API de Strava por cada usuario (100 req/15 min),
              los webhooks permiten que Strava notifique automáticamente cada actividad nueva.
              Con un webhook activo, cada usuario consume <strong className="text-zinc-300">1–2 llamadas</strong> por actividad
              en lugar de 5–10 por sincronización.
            </p>
          </div>
          <div className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold border ${
            hasSubscription
              ? 'bg-green-950/50 text-green-400 border-green-800'
              : 'bg-zinc-800 text-zinc-500 border-zinc-700'
          }`}>
            {hasSubscription ? '● Activo' : '○ Inactivo'}
          </div>
        </div>

        {/* Callback URL */}
        {webhookUrl && (
          <div className="mt-4">
            <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">URL del endpoint</p>
            <code className="block text-xs text-zinc-400 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 break-all">
              {webhookUrl}
            </code>
          </div>
        )}
      </div>

      {/* Current subscriptions */}
      {loading ? (
        <div className="flex items-center gap-3 py-6 text-xs text-zinc-500">
          <div className="w-4 h-4 rounded-full border border-zinc-600 border-t-lime-400 animate-spin" />
          Comprobando suscripciones…
        </div>
      ) : hasSubscription ? (
        <div className="space-y-2">
          <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Suscripciones activas</p>
          {subscriptions.map(sub => (
            <div key={sub.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between gap-4">
              <div className="text-xs space-y-1 min-w-0">
                <p className="text-zinc-300 font-semibold">ID: {sub.id} · App: {sub.application_id}</p>
                <p className="text-zinc-500 truncate">{sub.callback_url}</p>
                <p className="text-zinc-600">
                  Creado: {new Date(sub.created_at).toLocaleDateString('es-ES')} ·
                  Actualizado: {new Date(sub.updated_at).toLocaleDateString('es-ES')}
                </p>
              </div>
              <button
                onClick={() => handleDelete(sub.id)}
                disabled={actionState === 'loading'}
                className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-800 text-red-400 hover:bg-red-950/40 disabled:opacity-50 transition-colors"
              >
                Eliminar
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-zinc-900 border border-dashed border-zinc-700 rounded-xl p-8 text-center">
          <p className="text-zinc-500 text-sm mb-4">No hay ninguna suscripción activa.<br/>Registra el webhook para activar la sincronización automática.</p>
          <button
            onClick={handleRegister}
            disabled={actionState === 'loading'}
            className="px-5 py-2.5 text-sm font-semibold bg-lime-400 text-black rounded-lg hover:bg-lime-500 disabled:opacity-50 transition-colors"
          >
            {actionState === 'loading' ? 'Registrando…' : 'Registrar webhook'}
          </button>
        </div>
      )}

      {/* Reload + status message */}
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={loadStatus}
          disabled={loading}
          className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-800 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
        >
          ↻ Recargar estado
        </button>
        {actionMsg && (
          <p className={`text-xs ${actionState === 'error' ? 'text-red-400' : 'text-green-400'}`}>
            {actionMsg}
          </p>
        )}
      </div>

      {/* How it works */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-3">Cómo funciona</p>
        <ol className="space-y-2 text-xs text-zinc-400 list-decimal list-inside">
          <li>Al conectar Strava, se guarda el <code className="text-zinc-300">athlete_id</code> en Firestore.</li>
          <li>Cuando un usuario graba una actividad, Strava llama al endpoint <code className="text-zinc-300">stravaWebhookHandler</code>.</li>
          <li>La función busca el usuario por <code className="text-zinc-300">athlete_id</code> y descarga la actividad (1 llamada API).</li>
          <li>La actividad se guarda automáticamente y se marca el entrenamiento como completado si coincide.</li>
          <li>Los usuarios no necesitan pulsar "Sincronizar" manualmente.</li>
        </ol>
      </div>
    </div>
  );
}

// ── Stripe Payments Panel ─────────────────────────────────────────────
interface DiscountCode {
  id:                  string;
  code:                string;
  discount_type:       'percentage' | 'fixed';
  discount_value:      number;
  max_redemptions:     number | null;
  duration:            'forever' | 'once' | 'repeating';
  duration_in_months:  number | null;
  active:              boolean;
  created_at:          number | null;
  expires_at:          number | null;
}

function fmtDiscount(c: DiscountCode): string {
  const val  = c.discount_type === 'percentage' ? `${c.discount_value}%` : `${c.discount_value} €`;
  const dur  = c.duration === 'forever' ? 'siempre' : c.duration === 'once' ? '1 mes' : `${c.duration_in_months} meses`;
  return `${val} · ${dur}`;
}

function StripePaymentsPanel({ users }: { users: UserDoc[] }) {
  const fns = getFunctions(undefined, 'europe-west1');

  // ── Discount codes state ──
  const [codes,       setCodes]       = useState<DiscountCode[]>([]);
  const [codesLoading, setCodesLoading] = useState(false);
  const [showForm,    setShowForm]    = useState(false);
  const [formState,   setFormState]   = useState({
    code:             '',
    discountType:     'percentage' as 'percentage' | 'fixed',
    discountValue:    '',
    maxRedemptions:   '',
    duration:         'once' as 'forever' | 'once' | 'repeating',
    durationInMonths: '',
    expiresAt:        '',
  });
  const [formLoading, setFormLoading] = useState(false);
  const [formError,   setFormError]   = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  // ── User tools state ──
  const [selectedUser,   setSelectedUser]   = useState<UserDoc | null>(null);
  const [userSearch,     setUserSearch]     = useState('');
  const [userActionMsg,  setUserActionMsg]  = useState('');
  const [userActionErr,  setUserActionErr]  = useState('');
  const [userActLoading, setUserActLoading] = useState(false);
  const [promoToAssign,  setPromoToAssign]  = useState('');

  const loadCodes = useCallback(async () => {
    setCodesLoading(true);
    try {
      const fn  = httpsCallable<unknown, DiscountCode[]>(fns, 'listDiscountCodes');
      const res = await fn({});
      setCodes(res.data);
    } catch (e: any) { console.error(e); }
    setCodesLoading(false);
  }, []);

  useEffect(() => { loadCodes(); }, [loadCodes]);

  const handleCreateCode = async () => {
    setFormLoading(true);
    setFormError('');
    setFormSuccess('');
    try {
      const fn = httpsCallable(fns, 'createDiscountCode');
      await fn({
        code:             formState.code.trim(),
        discountType:     formState.discountType,
        discountValue:    parseFloat(formState.discountValue),
        maxRedemptions:   formState.maxRedemptions ? parseInt(formState.maxRedemptions) : null,
        duration:         formState.duration,
        durationInMonths: formState.duration === 'repeating' ? parseInt(formState.durationInMonths) : undefined,
        expiresAt:        formState.expiresAt || undefined,
      });
      setFormSuccess(`Código "${formState.code.toUpperCase()}" creado correctamente`);
      setShowForm(false);
      setFormState({ code: '', discountType: 'percentage', discountValue: '', maxRedemptions: '', duration: 'once', durationInMonths: '', expiresAt: '' });
      await loadCodes();
    } catch (e: any) {
      setFormError(e?.message || 'Error al crear el código');
    }
    setFormLoading(false);
  };

  const handleToggleCode = async (codeId: string, active: boolean) => {
    try {
      const fn = httpsCallable(fns, 'toggleDiscountCode');
      await fn({ codeId, active });
      setCodes(prev => prev.map(c => c.id === codeId ? { ...c, active } : c));
    } catch (e: any) {
      console.error('toggleDiscountCode error', e);
    }
  };

  const handleSetExempt = async (exempt: boolean) => {
    if (!selectedUser) return;
    setUserActLoading(true);
    setUserActionErr('');
    setUserActionMsg('');
    try {
      const fn = httpsCallable(fns, 'setUserExempt');
      await fn({ targetUid: selectedUser.uid, exempt });
      setUserActionMsg(exempt ? 'Acceso gratuito activado' : 'Acceso gratuito desactivado');
    } catch (e: any) {
      setUserActionErr(e?.message || 'Error');
    }
    setUserActLoading(false);
  };

  const handleAssignDiscount = async () => {
    if (!selectedUser) return;
    setUserActLoading(true);
    setUserActionErr('');
    setUserActionMsg('');
    try {
      const fn = httpsCallable(fns, 'assignDiscountToUser');
      await fn({ targetUid: selectedUser.uid, promoCode: promoToAssign.trim() || null });
      setUserActionMsg(promoToAssign.trim()
        ? `Código "${promoToAssign.toUpperCase()}" asignado a ${selectedUser.email}`
        : `Código de descuento eliminado de ${selectedUser.email}`);
      setPromoToAssign('');
    } catch (e: any) {
      setUserActionErr(e?.message || 'Error');
    }
    setUserActLoading(false);
  };

  const filteredUsers = users.filter(u => {
    if (!userSearch) return false;
    const q = userSearch.toLowerCase();
    return (u.email || '').toLowerCase().includes(q) || (u.first_name || '').toLowerCase().includes(q);
  });

  return (
    <div className="space-y-8">

      {/* ── Discount codes ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-zinc-200">Códigos de descuento</h3>
          <div className="flex gap-2">
            <button onClick={loadCodes} disabled={codesLoading}
              className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-800 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
              ↻ Recargar
            </button>
            <button onClick={() => { setShowForm(v => !v); setFormError(''); setFormSuccess(''); }}
              className="text-xs font-semibold bg-lime-400 hover:bg-lime-500 text-black px-3 py-1.5 rounded-lg transition-colors">
              {showForm ? 'Cancelar' : '+ Nuevo código'}
            </button>
          </div>
        </div>

        {formSuccess && <p className="text-xs text-green-400 mb-3">{formSuccess}</p>}

        {/* Create form */}
        {showForm && (
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 mb-4 space-y-4">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Nuevo código</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Código</label>
                <input value={formState.code} onChange={e => setFormState(s => ({ ...s, code: e.target.value.toUpperCase() }))}
                  placeholder="LANZAMIENTO50" maxLength={20}
                  className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-600 font-mono focus:ring-2 focus:ring-lime-400 outline-none" />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Tipo</label>
                <select value={formState.discountType} onChange={e => setFormState(s => ({ ...s, discountType: e.target.value as any }))}
                  className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:ring-2 focus:ring-lime-400 outline-none">
                  <option value="percentage">Porcentaje (%)</option>
                  <option value="fixed">Importe fijo (€)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">
                  {formState.discountType === 'percentage' ? 'Porcentaje (0–100)' : 'Importe en €'}
                </label>
                <input value={formState.discountValue} onChange={e => setFormState(s => ({ ...s, discountValue: e.target.value }))}
                  type="number" min="0" step={formState.discountType === 'percentage' ? '1' : '0.01'}
                  placeholder={formState.discountType === 'percentage' ? '50' : '5.00'}
                  className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:ring-2 focus:ring-lime-400 outline-none" />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Usos máximos (vacío = ilimitado)</label>
                <input value={formState.maxRedemptions} onChange={e => setFormState(s => ({ ...s, maxRedemptions: e.target.value }))}
                  type="number" min="1" placeholder="Ilimitado"
                  className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:ring-2 focus:ring-lime-400 outline-none" />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Duración del descuento</label>
                <select value={formState.duration} onChange={e => setFormState(s => ({ ...s, duration: e.target.value as any }))}
                  className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:ring-2 focus:ring-lime-400 outline-none">
                  <option value="once">Una vez</option>
                  <option value="repeating">Varios meses</option>
                  <option value="forever">Siempre</option>
                </select>
              </div>
              {formState.duration === 'repeating' && (
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Nº de meses</label>
                  <input value={formState.durationInMonths} onChange={e => setFormState(s => ({ ...s, durationInMonths: e.target.value }))}
                    type="number" min="1" placeholder="3"
                    className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:ring-2 focus:ring-lime-400 outline-none" />
                </div>
              )}
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Fecha de expiración (opcional)</label>
                <input value={formState.expiresAt} onChange={e => setFormState(s => ({ ...s, expiresAt: e.target.value }))}
                  type="date"
                  className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:ring-2 focus:ring-lime-400 outline-none" />
              </div>
            </div>
            {formError && <p className="text-xs text-red-400">{formError}</p>}
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-zinc-400 border border-zinc-700 rounded-lg hover:text-zinc-200 transition-colors">
                Cancelar
              </button>
              <button onClick={handleCreateCode} disabled={formLoading || !formState.code || !formState.discountValue}
                className="px-4 py-2 text-sm font-semibold bg-lime-400 hover:bg-lime-500 text-black rounded-lg disabled:opacity-50 transition-colors">
                {formLoading ? 'Creando…' : 'Crear código'}
              </button>
            </div>
          </div>
        )}

        {/* Codes list */}
        {codesLoading ? (
          <div className="flex items-center gap-3 py-6 text-xs text-zinc-500">
            <div className="w-4 h-4 rounded-full border border-zinc-600 border-t-lime-400 animate-spin" />
            Cargando códigos…
          </div>
        ) : codes.length === 0 ? (
          <div className="bg-zinc-900 border border-dashed border-zinc-700 rounded-xl p-8 text-center">
            <p className="text-sm text-zinc-500">No hay códigos de descuento todavía.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {codes.map(c => (
              <div key={c.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-bold text-zinc-100">{c.code}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      c.active ? 'bg-green-950/50 text-green-400 border-green-800' : 'bg-zinc-800 text-zinc-500 border-zinc-700'
                    }`}>{c.active ? 'Activo' : 'Inactivo'}</span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">{fmtDiscount(c)}</p>
                  <p className="text-[11px] text-zinc-700 mt-0.5">
                    {c.max_redemptions != null ? `Máx. ${c.max_redemptions} usos` : 'Usos ilimitados'}
                    {c.expires_at ? ` · Expira: ${new Date(c.expires_at).toLocaleDateString('es-ES')}` : ''}
                    {c.created_at ? ` · Creado: ${new Date(c.created_at).toLocaleDateString('es-ES')}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => handleToggleCode(c.id, !c.active)}
                  className={`shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                    c.active
                      ? 'border-yellow-800 text-yellow-400 hover:bg-yellow-950/40'
                      : 'border-green-800 text-green-400 hover:bg-green-950/40'
                  }`}
                >
                  {c.active ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── User tools ── */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-zinc-200">Gestión por usuario</h3>
        <p className="text-xs text-zinc-500">Eximir de pago o asignar un código de descuento a un usuario específico.</p>

        {/* User search */}
        <div className="relative">
          <input
            value={userSearch}
            onChange={e => { setUserSearch(e.target.value); setSelectedUser(null); setUserActionMsg(''); setUserActionErr(''); }}
            placeholder="Buscar usuario por email o nombre…"
            className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-lime-400 outline-none"
          />
          {userSearch && filteredUsers.length > 0 && !selectedUser && (
            <div className="absolute top-full mt-1 left-0 right-0 bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden z-10 shadow-xl max-h-48 overflow-y-auto">
              {filteredUsers.slice(0, 8).map(u => (
                <button key={u.uid}
                  onClick={() => { setSelectedUser(u); setUserSearch(`${u.first_name ?? ''} ${u.last_name ?? ''} (${u.email})`.trim()); }}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-zinc-700 transition-colors border-b border-zinc-700/50 last:border-0">
                  <p className="text-zinc-200 font-medium">{[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}</p>
                  <p className="text-xs text-zinc-500">{u.email}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected user actions */}
        {selectedUser && (
          <div className="space-y-4 pt-2 border-t border-zinc-800">
            <div className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-200 shrink-0">
                {(selectedUser.first_name?.[0] || selectedUser.email?.[0] || '?').toUpperCase()}
              </div>
              <div>
                <p className="text-zinc-100 font-medium">{[selectedUser.first_name, selectedUser.last_name].filter(Boolean).join(' ') || selectedUser.email}</p>
                <p className="text-xs text-zinc-500">{selectedUser.email}</p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <button onClick={() => handleSetExempt(true)} disabled={userActLoading}
                className="px-3 py-2 text-xs font-semibold rounded-lg border border-lime-800 text-lime-400 hover:bg-lime-950/40 disabled:opacity-50 transition-colors">
                ✓ Dar acceso gratuito
              </button>
              <button onClick={() => handleSetExempt(false)} disabled={userActLoading}
                className="px-3 py-2 text-xs font-semibold rounded-lg border border-zinc-700 text-zinc-400 hover:bg-zinc-800 disabled:opacity-50 transition-colors">
                ✕ Revocar acceso gratuito
              </button>
            </div>

            <div>
              <label className="block text-xs text-zinc-500 mb-2">Asignar código de descuento (se aplicará en el próximo checkout)</label>
              <div className="flex gap-2">
                <input value={promoToAssign} onChange={e => setPromoToAssign(e.target.value.toUpperCase())}
                  placeholder="CÓDIGO (vacío = eliminar)"
                  className="flex-1 px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-600 font-mono focus:ring-2 focus:ring-lime-400 outline-none" />
                <button onClick={handleAssignDiscount} disabled={userActLoading}
                  className="px-4 py-2 text-sm font-semibold bg-zinc-700 hover:bg-zinc-600 text-zinc-100 rounded-lg disabled:opacity-50 transition-colors">
                  Asignar
                </button>
              </div>
            </div>

            {userActionMsg && <p className="text-xs text-green-400">{userActionMsg}</p>}
            {userActionErr && <p className="text-xs text-red-400">{userActionErr}</p>}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Cancellations Panel ───────────────────────────────────────────────
interface Cancellation {
  id:           string;
  uid:          string;
  email:        string | null;
  first_name:   string | null;
  last_name:    string | null;
  reason:       string;
  reason_label: string;
  feedback:     string | null;
  cancelled_at: any;
  was_trial:    boolean;
  period_end_ms: number | null;
}

const REASON_EMOJI: Record<string, string> = {
  not_using:       '🎯',
  price:           '💸',
  other_app:       '🔄',
  break:           '⏸️',
  missing_feature: '🔧',
  other:           '💬',
};

function CancellationsPanel() {
  const [cancellations, setCancellations] = useState<Cancellation[]>([]);
  const [loading,       setLoading]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q    = query(collection(db, 'cancellations'), orderBy('cancelled_at', 'desc'));
      const snap = await getDocs(q);
      setCancellations(snap.docs.map(d => ({ id: d.id, ...d.data() } as Cancellation)));
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const byReason = cancellations.reduce<Record<string, number>>((acc, c) => {
    acc[c.reason] = (acc[c.reason] ?? 0) + 1;
    return acc;
  }, {});

  const withFeedback = cancellations.filter(c => c.feedback);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-200">Cancelaciones</h3>
        <button onClick={load} disabled={loading}
          className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-800 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
          ↻ Recargar
        </button>
      </div>

      {/* Stats */}
      {cancellations.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Object.entries(byReason).sort((a, b) => b[1] - a[1]).map(([reason, count]) => (
            <div key={reason} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xl mb-1">{REASON_EMOJI[reason] ?? '❓'}</p>
              <p className="text-2xl font-bold text-zinc-100">{count}</p>
              <p className="text-[11px] text-zinc-500 mt-0.5 leading-snug">
                {cancellations.find(c => c.reason === reason)?.reason_label ?? reason}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center gap-3 py-6 text-xs text-zinc-500">
          <div className="w-4 h-4 rounded-full border border-zinc-600 border-t-lime-400 animate-spin" />
          Cargando…
        </div>
      ) : cancellations.length === 0 ? (
        <div className="bg-zinc-900 border border-dashed border-zinc-700 rounded-xl p-8 text-center">
          <p className="text-sm text-zinc-500">No hay cancelaciones registradas todavía.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {cancellations.map(c => (
            <div key={c.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-zinc-100">
                      {[c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || '—'}
                    </span>
                    {c.was_trial && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-lime-950/50 text-lime-400 border-lime-800">
                        Trial
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">{c.email}</p>
                </div>
                <p className="text-xs text-zinc-600 shrink-0">
                  {c.cancelled_at?.toDate?.().toLocaleDateString('es-ES') ?? '—'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-base">{REASON_EMOJI[c.reason] ?? '❓'}</span>
                <span className="text-xs text-zinc-400">{c.reason_label}</span>
              </div>

              {c.feedback && (
                <div className="bg-zinc-800/60 rounded-lg px-3 py-2 text-xs text-zinc-300 leading-relaxed border-l-2 border-lime-400/40">
                  "{c.feedback}"
                </div>
              )}

              {c.period_end_ms && (
                <p className="text-[11px] text-zinc-700">
                  Acceso hasta: {new Date(c.period_end_ms).toLocaleDateString('es-ES')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Feedback-only view */}
      {withFeedback.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
          <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
            Solo feedback escrito ({withFeedback.length})
          </p>
          {withFeedback.map(c => (
            <div key={c.id} className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">{c.email}</span>
                <span className="text-[10px] text-zinc-700">· {REASON_EMOJI[c.reason]} {c.reason_label}</span>
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed">"{c.feedback}"</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Invites Panel ─────────────────────────────────────────────────────
interface Invite {
  email:      string;
  is_exempt:  boolean;
  used:       boolean;
  notes:      string | null;
  created_at: number | null;
  used_at:    number | null;
}

function InvitesPanel() {
  const fns = getFunctions(undefined, 'europe-west1');

  const [invites,     setInvites]     = useState<Invite[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [emailInput,  setEmailInput]  = useState('');
  const [notesInput,  setNotesInput]  = useState('');
  const [creating,    setCreating]    = useState(false);
  const [createErr,   setCreateErr]   = useState('');
  const [createOk,    setCreateOk]    = useState('');
  const [revoking,    setRevoking]    = useState<string | null>(null);

  const loadInvites = useCallback(async () => {
    setLoading(true);
    try {
      const fn  = httpsCallable<unknown, Invite[]>(fns, 'listInvites');
      const res = await fn({});
      setInvites(res.data);
    } catch (e: any) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { loadInvites(); }, [loadInvites]);

  const handleCreate = async () => {
    setCreating(true);
    setCreateErr('');
    setCreateOk('');
    try {
      const fn = httpsCallable(fns, 'createInvite');
      await fn({ email: emailInput.trim(), notes: notesInput.trim() || undefined });
      setCreateOk(`Invitación creada para ${emailInput.trim().toLowerCase()}`);
      setEmailInput('');
      setNotesInput('');
      await loadInvites();
    } catch (e: any) {
      setCreateErr(e?.message || 'Error al crear la invitación');
    }
    setCreating(false);
  };

  const handleRevoke = async (email: string) => {
    setRevoking(email);
    try {
      const fn = httpsCallable(fns, 'revokeInvite');
      await fn({ email });
      setInvites(prev => prev.filter(i => i.email !== email));
    } catch (e: any) {
      console.error('revokeInvite error', e);
    }
    setRevoking(null);
  };

  return (
    <div className="space-y-6">

      {/* Explainer */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-zinc-200 mb-1">Invitaciones de acceso</h3>
        <p className="text-xs text-zinc-500 leading-relaxed">
          Añade el email de alguien antes de que se registre. Cuando esa persona cree su cuenta,
          se le concederá acceso gratuito automáticamente (<code className="text-zinc-300">is_exempt: true</code>) sin necesidad de suscripción.
        </p>
      </div>

      {/* Create form */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 space-y-4">
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Nueva invitación</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Email</label>
            <input
              value={emailInput}
              onChange={e => setEmailInput(e.target.value)}
              type="email"
              placeholder="usuario@ejemplo.com"
              className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-600 focus:ring-2 focus:ring-lime-400 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Nota interna (opcional)</label>
            <input
              value={notesInput}
              onChange={e => setNotesInput(e.target.value)}
              placeholder="Ej: amigo, beta tester…"
              className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-600 focus:ring-2 focus:ring-lime-400 outline-none"
            />
          </div>
        </div>
        {createErr && <p className="text-xs text-red-400">{createErr}</p>}
        {createOk  && <p className="text-xs text-green-400">{createOk}</p>}
        <div className="flex justify-end">
          <button
            onClick={handleCreate}
            disabled={creating || !emailInput.trim()}
            className="px-4 py-2 text-sm font-semibold bg-lime-400 hover:bg-lime-500 text-black rounded-lg disabled:opacity-50 transition-colors"
          >
            {creating ? 'Enviando…' : 'Crear invitación'}
          </button>
        </div>
      </div>

      {/* List */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
            Invitaciones ({invites.length})
          </p>
          <button onClick={loadInvites} disabled={loading}
            className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-800 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
            ↻ Recargar
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-3 py-6 text-xs text-zinc-500">
            <div className="w-4 h-4 rounded-full border border-zinc-600 border-t-lime-400 animate-spin" />
            Cargando…
          </div>
        ) : invites.length === 0 ? (
          <div className="bg-zinc-900 border border-dashed border-zinc-700 rounded-xl p-8 text-center">
            <p className="text-sm text-zinc-500">No hay invitaciones pendientes.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {invites.map(inv => (
              <div key={inv.email} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-zinc-100">{inv.email}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      inv.used
                        ? 'bg-green-950/50 text-green-400 border-green-800'
                        : 'bg-yellow-950/50 text-yellow-400 border-yellow-800'
                    }`}>
                      {inv.used ? 'Usado' : 'Pendiente'}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-600 mt-0.5">
                    {inv.created_at ? `Creada: ${new Date(inv.created_at).toLocaleDateString('es-ES')}` : ''}
                    {inv.used && inv.used_at ? ` · Registrado: ${new Date(inv.used_at).toLocaleDateString('es-ES')}` : ''}
                    {inv.notes ? ` · ${inv.notes}` : ''}
                  </p>
                </div>
                {!inv.used && (
                  <button
                    onClick={() => handleRevoke(inv.email)}
                    disabled={revoking === inv.email}
                    className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-800 text-red-400 hover:bg-red-950/40 disabled:opacity-50 transition-colors"
                  >
                    {revoking === inv.email ? '…' : 'Revocar'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── NPS Panel ────────────────────────────────────────────────────────
interface NpsResponse {
  id:         string;
  uid:        string;
  email:      string | null;
  score:      number;
  category:   'detractor' | 'passive' | 'promoter';
  feedback:   string | null;
  created_at: any;
}

function NPSPanel() {
  const [responses, setResponses] = useState<NpsResponse[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'nps_responses'), orderBy('created_at', 'desc'), limit(200))
        );
        setResponses(snap.docs.map(d => ({ id: d.id, ...d.data() } as NpsResponse)));
      } catch (e) {
        console.error('[NPSPanel]', e);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) return <p className="text-sm text-zinc-500">Cargando…</p>;
  if (responses.length === 0) return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center text-sm text-zinc-500">
      No hay respuestas NPS todavía.
    </div>
  );

  const total      = responses.length;
  const promoters  = responses.filter(r => r.category === 'promoter').length;
  const detractors = responses.filter(r => r.category === 'detractor').length;
  const npsScore   = Math.round(((promoters - detractors) / total) * 100);

  const avgScore = (responses.reduce((s, r) => s + r.score, 0) / total).toFixed(1);

  const scoreColor = npsScore >= 50 ? 'text-lime-400' : npsScore >= 0 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'NPS',          value: npsScore > 0 ? `+${npsScore}` : `${npsScore}`, valueClass: scoreColor },
          { label: 'Nota media',   value: avgScore,                                       valueClass: 'text-zinc-100' },
          { label: 'Promotores',   value: `${promoters} (${Math.round(promoters/total*100)}%)`,   valueClass: 'text-lime-400' },
          { label: 'Detractores',  value: `${detractors} (${Math.round(detractors/total*100)}%)`, valueClass: 'text-red-400' },
        ].map(stat => (
          <div key={stat.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1">{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.valueClass}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Distribution bar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Distribución de puntuaciones</p>
        <div className="flex rounded-full overflow-hidden h-4 gap-px">
          {Array.from({ length: 11 }, (_, i) => {
            const count = responses.filter(r => r.score === i).length;
            const pct   = total > 0 ? (count / total) * 100 : 0;
            const col   = i <= 6 ? 'bg-red-600' : i <= 8 ? 'bg-yellow-500' : 'bg-lime-400';
            return pct > 0
              ? <div key={i} title={`${i}: ${count} resp.`} style={{ width: `${pct}%` }} className={`${col} min-w-[2px]`} />
              : null;
          })}
        </div>
        <div className="flex justify-between text-[10px] text-zinc-600 mt-1.5">
          <span>0 — Detractores</span>
          <span>7–8 Pasivos</span>
          <span>9–10 Promotores ↗</span>
        </div>
      </div>

      {/* Responses list */}
      <div>
        <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-3">
          Respuestas ({total})
        </p>
        <div className="space-y-2">
          {responses.map(r => (
            <div key={r.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-start gap-4">
              {/* Score badge */}
              <div className={`text-sm font-bold w-10 shrink-0 text-center py-1 rounded-lg border ${
                r.category === 'promoter' ? 'bg-lime-950/50 text-lime-400 border-lime-800'
                : r.category === 'passive' ? 'bg-yellow-950/50 text-yellow-400 border-yellow-800'
                : 'bg-red-950/50 text-red-400 border-red-800'
              }`}>
                {r.score}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-zinc-400 truncate">{r.email ?? r.uid}</p>
                {r.feedback && (
                  <p className="text-xs text-zinc-300 mt-1 leading-relaxed italic">"{r.feedback}"</p>
                )}
              </div>
              <p className="text-[10px] text-zinc-600 shrink-0">
                {r.created_at?.toDate?.().toLocaleDateString('es-ES') ?? '—'}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main AdminPage ────────────────────────────────────────────────────
const AdminPage = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [users, setUsers] = useState<UserDoc[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingIncidents, setLoadingIncidents] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [incidentFilter, setIncidentFilter] = useState<'all' | IncidentStatus>('all');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fns = getFunctions(undefined, 'europe-west1');

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const snap = await getDocs(collection(db, 'users'));
      setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserDoc)));
    } catch (e) { console.error('Error loading users', e); }
    setLoadingUsers(false);
  }, []);

  const loadIncidents = useCallback(async () => {
    setLoadingIncidents(true);
    try {
      const q = query(collection(db, 'incidents'), orderBy('created_at', 'desc'));
      const snap = await getDocs(q);
      setIncidents(snap.docs.map(d => ({ id: d.id, ...d.data() } as Incident)));
    } catch (e) { console.error('Error loading incidents', e); }
    setLoadingIncidents(false);
  }, []);

  useEffect(() => {
    loadUsers();
    loadIncidents();
  }, [loadUsers, loadIncidents]);

  const expandUser = async (uid: string) => {
    if (expandedUser === uid) { setExpandedUser(null); return; }
    setExpandedUser(uid);
    const u = users.find(u => u.uid === uid);
    if (!u || u.plan !== undefined) return;
    try {
      const plansSnap = await getDocs(
        query(collection(db, 'users', uid, 'training_plans'), orderBy('created_at', 'desc'), limit(1))
      );
      const plan = plansSnap.empty ? null : { id: plansSnap.docs[0].id, ...plansSnap.docs[0].data() };
      const wSnap = await getDocs(
        query(collection(db, 'users', uid, 'workouts'), orderBy('workout_date', 'desc'), limit(8))
      );
      const workouts = wSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, plan, workouts } : u));
    } catch (e) { console.error('Error loading user detail', e); }
  };

  const executeAction = async () => {
    if (!confirmAction) return;
    setActionLoading(true);
    setActionError(null);
    try {
      if (confirmAction.type === 'ban' || confirmAction.type === 'unban') {
        const fn = httpsCallable(fns, 'adminBanUser');
        await fn({ targetUid: confirmAction.uid, banned: confirmAction.type === 'ban' });
        setUsers(prev => prev.map(u =>
          u.uid === confirmAction.uid ? { ...u, banned: confirmAction.type === 'ban' } : u
        ));
      } else if (confirmAction.type === 'delete') {
        const fn = httpsCallable(fns, 'adminDeleteUser');
        await fn({ targetUid: confirmAction.uid });
        setUsers(prev => prev.filter(u => u.uid !== confirmAction.uid));
        setExpandedUser(null);
      } else if (confirmAction.type === 'deletePlan') {
        const fn = httpsCallable(fns, 'adminDeletePlan');
        await fn({ targetUid: confirmAction.uid, planId: confirmAction.planId });
        setUsers(prev => prev.map(u =>
          u.uid === confirmAction.uid ? { ...u, plan: null, workouts: [] } : u
        ));
      }
      setConfirmAction(null);
    } catch (e: any) {
      setActionError(e?.message || 'Error desconocido');
    }
    setActionLoading(false);
  };

  const openCount       = incidents.filter(i => i.status === 'abierta').length;
  const inProgressCount = incidents.filter(i => i.status === 'en_proceso').length;
  const resolvedCount   = incidents.filter(i => i.status === 'resuelta').length;
  const usersWithZones  = users.filter(u => u.z1_pace_sec_km).length;

  const filteredUsers = users.filter(u => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (u.email || '').toLowerCase().includes(q) ||
      (u.first_name || '').toLowerCase().includes(q) ||
      (u.last_name || '').toLowerCase().includes(q)
    );
  });

  const filteredIncidents = incidentFilter === 'all'
    ? incidents
    : incidents.filter(i => i.status === incidentFilter);

  return (
    <main className="container mx-auto p-4 sm:p-6 lg:p-8 max-w-7xl">

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100">Panel de Administración</h1>
          <p className="text-sm text-zinc-500 mt-1">Gestión de usuarios, planes e incidencias</p>
        </div>
        <span className="px-3 py-1 text-xs font-bold bg-lime-400/10 text-lime-400 border border-lime-400/30 rounded-full">
          Admin
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-900 p-1 rounded-xl mb-6 border border-zinc-800 w-fit flex-wrap">
        {([
          ['dashboard', 'Resumen'],
          ['users',     'Usuarios'],
          ['incidents', 'Incidencias'],
          ['payments',  'Pagos'],
          ['invites',   'Invitaciones'],
          ['nps',       'NPS'],
          ['strava',    'Strava'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === id ? 'bg-zinc-800 text-zinc-100 shadow' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {label}
            {id === 'incidents' && openCount > 0 && (
              <span className="ml-2 bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">
                {openCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── DASHBOARD TAB ── */}
      {tab === 'dashboard' && (
        <div className="space-y-6">
          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Usuarios totales',    value: users.length,     sub: `${usersWithZones} con zonas`,   color: 'text-zinc-100'   },
              { label: 'Incidencias abiertas', value: openCount,        sub: `${inProgressCount} en proceso`, color: 'text-red-400'    },
              { label: 'En proceso',           value: inProgressCount,  sub: 'pendientes de respuesta',       color: 'text-yellow-400' },
              { label: 'Resueltas',            value: resolvedCount,    sub: 'total histórico',               color: 'text-green-400'  },
            ].map(({ label, value, sub, color }) => (
              <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-xs text-zinc-500 mb-1">{label}</p>
                <p className={`text-3xl font-bold ${color}`}>{value}</p>
                <p className="text-[11px] text-zinc-600 mt-1">{sub}</p>
              </div>
            ))}
          </div>

          {/* Recent incidents */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-zinc-300">Incidencias recientes</h3>
              <button
                onClick={() => setTab('incidents')}
                className="text-xs text-lime-400 hover:text-lime-300 transition-colors"
              >
                Ver todas →
              </button>
            </div>
            {incidents.length === 0 ? (
              <p className="text-zinc-600 text-sm">No hay incidencias todavía.</p>
            ) : (
              <div className="space-y-2">
                {incidents.slice(0, 6).map(i => (
                  <div
                    key={i.id}
                    onClick={() => { setSelectedIncident(i); setTab('incidents'); }}
                    className="flex items-center justify-between p-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-lg cursor-pointer transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-zinc-200 font-medium truncate">{i.subject}</p>
                      <p className="text-xs text-zinc-500">{i.user_email} · {i.category}</p>
                    </div>
                    <span className={`ml-3 text-[11px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${STATUS_CONFIG[i.status]?.color}`}>
                      {STATUS_CONFIG[i.status]?.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent users */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-zinc-300">Últimos usuarios registrados</h3>
              <button onClick={() => setTab('users')} className="text-xs text-lime-400 hover:text-lime-300 transition-colors">
                Ver todos →
              </button>
            </div>
            <div className="space-y-2">
              {users.slice(0, 5).map(u => (
                <div key={u.uid} className="flex items-center gap-3 p-2">
                  <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-200 shrink-0">
                    {(u.first_name?.[0] || u.email?.[0] || '?').toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-zinc-200 truncate">
                      {[u.first_name, u.last_name].filter(Boolean).join(' ') || u.email}
                    </p>
                    <p className="text-xs text-zinc-500">{u.experience_level ?? '—'} · {u.zones_confidence ? `Zonas ${u.zones_confidence}` : 'Sin zonas'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── USERS TAB ── */}
      {tab === 'users' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar por email o nombre…"
              className="w-full max-w-sm px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-lime-400 focus:border-lime-400 outline-none"
            />
            <span className="text-xs text-zinc-500 shrink-0">{filteredUsers.length} usuarios</span>
          </div>

          {loadingUsers ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 rounded-full border-2 border-zinc-700 border-t-lime-400 animate-spin" />
            </div>
          ) : (
            <div className="space-y-2">
              {filteredUsers.map(u => (
                <div key={u.uid} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  {/* Row */}
                  <button
                    onClick={() => expandUser(u.uid)}
                    className="w-full flex items-center justify-between p-4 hover:bg-zinc-800/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold text-zinc-200 shrink-0">
                        {(u.first_name?.[0] || u.email?.[0] || '?').toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-100 truncate flex items-center gap-2 flex-wrap">
                          {[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}
                          {u.role === 'admin' && (
                            <span className="text-[10px] bg-lime-400/10 text-lime-400 border border-lime-400/30 px-1.5 py-0.5 rounded-full font-bold">ADMIN</span>
                          )}
                          {u.banned && (
                            <span className="text-[10px] bg-red-950/60 text-red-400 border border-red-800 px-1.5 py-0.5 rounded-full font-bold">BANEADO</span>
                          )}
                        </p>
                        <p className="text-xs text-zinc-500 truncate">{u.email}</p>
                      </div>
                    </div>
                    <div className="hidden sm:flex items-center gap-5 text-xs text-zinc-500 shrink-0 ml-4">
                      <span>{u.experience_level ?? '—'}</span>
                      <span className={`flex items-center gap-1.5 ${u.z1_pace_sec_km ? 'text-lime-400' : 'text-zinc-600'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${u.z1_pace_sec_km ? 'bg-lime-400' : 'bg-zinc-700'}`} />
                        {u.z1_pace_sec_km ? `Zonas ${u.zones_confidence}` : 'Sin zonas'}
                      </span>
                    </div>
                    <svg
                      className={`w-4 h-4 text-zinc-500 ml-3 shrink-0 transition-transform ${expandedUser === u.uid ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
                    >
                      <path d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Expanded detail */}
                  {expandedUser === u.uid && (
                    <div className="border-t border-zinc-800 p-5 bg-zinc-950/40 space-y-5">
                      {u.plan === undefined ? (
                        <div className="flex items-center gap-2 text-xs text-zinc-500">
                          <div className="w-4 h-4 rounded-full border border-zinc-600 border-t-lime-400 animate-spin" />
                          Cargando datos…
                        </div>
                      ) : (
                        <>
                          <div className="grid sm:grid-cols-3 gap-4 text-xs">
                            {/* Profile */}
                            <div className="space-y-1">
                              <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Perfil</p>
                              <p className="text-zinc-400">Nivel: <span className="text-zinc-200">{u.experience_level || '—'}</span></p>
                              <p className="text-zinc-400">Objetivo: <span className="text-zinc-200">{u.primary_goal || '—'}</span></p>
                              <p className="text-zinc-400 font-mono text-[10px] break-all">UID: {u.uid}</p>
                            </div>
                            {/* Zones */}
                            <div className="space-y-1">
                              <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Zonas</p>
                              {u.z1_pace_sec_km ? (
                                <>
                                  <p className="text-zinc-400">Z1 <span className="text-green-400 font-mono">{fmtPace(u.z1_pace_sec_km)}</span></p>
                                  {u.z4_pace_sec_km && <p className="text-zinc-400">Z4 <span className="text-yellow-400 font-mono">{fmtPace(u.z4_pace_sec_km)}</span></p>}
                                  {u.z5_pace_sec_km && <p className="text-zinc-400">Z5 <span className="text-red-400 font-mono">{fmtPace(u.z5_pace_sec_km)}</span></p>}
                                  <p className="text-zinc-600">Confianza: {u.zones_confidence}</p>
                                </>
                              ) : (
                                <p className="text-zinc-600">Sin calibrar</p>
                              )}
                            </div>
                            {/* Plan */}
                            <div className="space-y-1">
                              <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Plan activo</p>
                              {u.plan ? (
                                <>
                                  <p className="text-zinc-200 font-medium">{u.plan.goal || u.plan.goal_label || u.plan.race_distance || '—'}</p>
                                  {u.plan.race_date && <p className="text-zinc-400">Carrera: {u.plan.race_date}</p>}
                                  {(u.plan.weeks || u.plan.total_weeks) && <p className="text-zinc-400">{u.plan.weeks || u.plan.total_weeks} semanas</p>}
                                  {u.plan.methodology && <p className="text-zinc-400">Método: {u.plan.methodology}</p>}
                                </>
                              ) : (
                                <p className="text-zinc-600">Sin plan generado</p>
                              )}
                            </div>
                          </div>

                          {/* Recent workouts */}
                          {u.workouts && u.workouts.length > 0 && (
                            <div>
                              <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Últimos entrenamientos</p>
                              <div className="space-y-1">
                                {u.workouts.slice(0, 6).map((w: any) => (
                                  <div key={w.id} className="flex items-center justify-between text-xs bg-zinc-800/60 rounded px-3 py-1.5">
                                    <span className="text-zinc-400 font-mono">{w.workout_date}</span>
                                    <span className="text-zinc-300 truncate mx-3 flex-1">{w.description}</span>
                                    <span className={w.is_completed ? 'text-green-400' : 'text-zinc-700'}>
                                      {w.is_completed ? '✓ Completado' : '○ Pendiente'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Admin actions */}
                          {u.role !== 'admin' && (
                            <div className="pt-3 border-t border-zinc-700/50">
                              <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-3">Acciones de administrador</p>
                              <div className="flex flex-wrap gap-2">
                                {u.plan?.id && (
                                  <button
                                    onClick={() => setConfirmAction({ type: 'deletePlan', uid: u.uid, planId: u.plan.id, name: u.email })}
                                    className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-orange-800 text-orange-400 hover:bg-orange-950/40 transition-colors"
                                  >
                                    Eliminar plan
                                  </button>
                                )}
                                {u.banned ? (
                                  <button
                                    onClick={() => setConfirmAction({ type: 'unban', uid: u.uid, name: u.email })}
                                    className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-green-800 text-green-400 hover:bg-green-950/40 transition-colors"
                                  >
                                    Desbanear
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setConfirmAction({ type: 'ban', uid: u.uid, name: u.email })}
                                    className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-yellow-800 text-yellow-400 hover:bg-yellow-950/40 transition-colors"
                                  >
                                    Banear usuario
                                  </button>
                                )}
                                <button
                                  onClick={() => setConfirmAction({ type: 'delete', uid: u.uid, name: u.email })}
                                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-800 text-red-400 hover:bg-red-950/40 transition-colors"
                                >
                                  Eliminar cuenta
                                </button>
                              </div>
                              {actionError && confirmAction?.uid === u.uid && (
                                <p className="text-xs text-red-400 mt-2">{actionError}</p>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {filteredUsers.length === 0 && !loadingUsers && (
                <p className="text-zinc-600 text-sm py-8 text-center">No hay usuarios que coincidan con la búsqueda.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── INCIDENTS TAB ── */}
      {tab === 'incidents' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {([
              ['all',        'Todas'],
              ['abierta',    'Abiertas'],
              ['en_proceso', 'En proceso'],
              ['resuelta',   'Resueltas'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setIncidentFilter(id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                  incidentFilter === id
                    ? 'bg-zinc-700 text-zinc-100 border-zinc-600'
                    : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-zinc-600 hover:text-zinc-300'
                }`}
              >
                {label}
                <span className="ml-1.5 opacity-60">
                  {id === 'all' ? incidents.length : incidents.filter(i => i.status === id).length}
                </span>
              </button>
            ))}
            <button
              onClick={loadIncidents}
              className="ml-auto px-3 py-1.5 text-xs font-semibold rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              ↻ Recargar
            </button>
          </div>

          {loadingIncidents ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 rounded-full border-2 border-zinc-700 border-t-lime-400 animate-spin" />
            </div>
          ) : filteredIncidents.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
              <p className="text-zinc-500 text-sm">No hay incidencias en este estado.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredIncidents.map(i => (
                <div
                  key={i.id}
                  onClick={() => setSelectedIncident(i)}
                  className="bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl p-4 cursor-pointer transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${STATUS_CONFIG[i.status]?.color}`}>
                          {STATUS_CONFIG[i.status]?.label}
                        </span>
                        <span className={`text-xs font-semibold ${PRIORITY_COLOR[i.priority] ?? 'text-zinc-500'}`}>
                          {i.priority}
                        </span>
                        <span className="text-xs text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded">{i.category}</span>
                      </div>
                      <p className="text-sm font-semibold text-zinc-100">{i.subject}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{i.user_email} · {i.user_name}</p>
                      {i.description && (
                        <p className="text-xs text-zinc-600 mt-1.5 line-clamp-2">{i.description}</p>
                      )}
                    </div>
                    <p className="text-xs text-zinc-600 shrink-0">
                      {i.created_at?.toDate?.().toLocaleDateString('es-ES') ?? '—'}
                    </p>
                  </div>
                  {i.admin_notes && (
                    <p className="text-xs text-lime-400/70 mt-2 bg-lime-400/5 rounded px-2 py-1">
                      Nota: {i.admin_notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── PAYMENTS TAB ── */}
      {tab === 'payments' && (
        <div className="space-y-10">
          <StripePaymentsPanel users={users} />
          <div className="border-t border-zinc-800 pt-8">
            <CancellationsPanel />
          </div>
        </div>
      )}

      {/* ── INVITES TAB ── */}
      {tab === 'invites' && <InvitesPanel />}

      {/* ── NPS TAB ── */}
      {tab === 'nps' && <NPSPanel />}

      {/* ── STRAVA TAB ── */}
      {tab === 'strava' && <StravaWebhookPanel />}

      {/* Confirm action dialog */}
      {confirmAction && (
        <ConfirmDialog
          action={confirmAction}
          onConfirm={executeAction}
          onCancel={() => { setConfirmAction(null); setActionError(null); }}
          loading={actionLoading}
        />
      )}

      {/* Incident detail modal */}
      {selectedIncident && (
        <IncidentModal
          incident={selectedIncident}
          onClose={() => setSelectedIncident(null)}
          onSaved={(updated) => {
            setIncidents(prev => prev.map(i => i.id === updated.id ? updated : i));
            setSelectedIncident(null);
          }}
        />
      )}
    </main>
  );
};

export default AdminPage;
