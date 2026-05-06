import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  collection, addDoc, getDocs,
  query, where, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebaseClient';
import { useAuth } from '../context/AuthContext';

type IncidentStatus = 'abierta' | 'en_proceso' | 'resuelta';

interface Incident {
  id: string;
  subject: string;
  category: string;
  description: string;
  status: IncidentStatus;
  priority: string;
  created_at: any;
  admin_notes: string;
  attachment_url?: string;
  messages: Array<{ sender: string; text: string; timestamp: string }>;
}

const STATUS_CONFIG: Record<IncidentStatus, { label: string; color: string; icon: string }> = {
  abierta:    { label: 'Abierta',    color: 'bg-red-950/50 text-red-400 border-red-800',         icon: '●' },
  en_proceso: { label: 'En proceso', color: 'bg-yellow-950/50 text-yellow-400 border-yellow-800', icon: '◐' },
  resuelta:   { label: 'Resuelta',   color: 'bg-green-950/50 text-green-400 border-green-800',    icon: '✓' },
};

const FAQ_ITEMS = [
  {
    q: '¿Qué datos de Strava usa Zypace?',
    a: 'Zypace lee el listado de actividades del atleta (distancia, tiempo, ritmo, frecuencia cardíaca) para marcar entrenamientos como completados y calibrar las zonas de ritmo personalizadas. No modificamos ni eliminamos datos de tu cuenta Strava.',
  },
  {
    q: '¿Cómo conecto mi cuenta de Strava?',
    a: 'Ve a Ajustes → pestaña Integraciones → pulsa "Conectar con Strava". Serás redirigido a Strava para autorizar el acceso. Una vez autorizado, vuelves a Zypace automáticamente.',
  },
  {
    q: '¿Cómo desconecto mi cuenta de Strava?',
    a: 'Ve a Ajustes → pestaña Integraciones → pulsa "Desconectar Strava". Esto elimina los tokens de acceso de nuestros servidores y revoca el acceso desde Strava. También puedes revocar el acceso directamente desde tu perfil de Strava en Configuración → Mis aplicaciones.',
  },
  {
    q: '¿Con qué frecuencia se sincronizan las actividades?',
    a: 'Zypace usa el sistema de webhooks de Strava: cada vez que terminas una actividad, Strava nos lo notifica automáticamente en segundos. No es necesario pulsar "Sincronizar" manualmente, aunque ese botón sigue disponible por si necesitas forzar una actualización.',
  },
  {
    q: '¿Puedo usar Zypace sin conectar Strava?',
    a: 'Sí. Strava es opcional. Puedes seguir tu plan de entrenamiento y marcar los entrenamientos manualmente sin ninguna integración.',
  },
  {
    q: '¿Dónde están mis datos almacenados?',
    a: 'Los datos se almacenan en Google Firebase (Firestore y Storage), en centros de datos de la Unión Europea. Consulta nuestra Política de privacidad para más información.',
  },
  {
    q: 'La sincronización con Strava no funciona correctamente',
    a: 'Prueba a desconectar y volver a conectar tu cuenta Strava desde Ajustes. Si el problema persiste, abre una incidencia desde esta página (requiere login) y nuestro equipo lo revisará.',
  },
];

// ── FAQ item ─────────────────────────────────────────────────────────
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-zinc-800 last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-4 text-left gap-4 hover:text-zinc-100 transition-colors"
      >
        <span className="text-sm font-medium text-zinc-200">{q}</span>
        <svg
          className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
        >
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <p className="pb-4 text-sm text-zinc-400 leading-relaxed">{a}</p>
      )}
    </div>
  );
}

// ── Disconnect steps ──────────────────────────────────────────────────
function DisconnectSteps() {
  const steps = [
    { n: '1', text: 'Inicia sesión en Zypace' },
    { n: '2', text: 'Ve a Ajustes en el menú superior' },
    { n: '3', text: 'Abre la pestaña Integraciones' },
    { n: '4', text: 'Pulsa "Desconectar Strava"' },
    { n: '5', text: 'Confirma la acción — el acceso se revoca inmediatamente' },
  ];
  return (
    <ol className="space-y-2.5 mt-4">
      {steps.map(s => (
        <li key={s.n} className="flex items-start gap-3">
          <span className="w-6 h-6 rounded-full bg-zinc-700 text-xs font-bold text-zinc-300 flex items-center justify-center shrink-0 mt-0.5">
            {s.n}
          </span>
          <span className="text-sm text-zinc-400">{s.text}</span>
        </li>
      ))}
    </ol>
  );
}

// ── Incident ticket system (logged-in only) ───────────────────────────
function IncidentSystem() {
  const { user } = useAuth();
  const [incidents, setIncidents]     = useState<Incident[]>([]);
  const [loading, setLoading]         = useState(true);
  const [loadError, setLoadError]     = useState<string | null>(null);
  const [showForm, setShowForm]       = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg]   = useState(false);
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    subject: '',
    category: 'pregunta',
    priority: 'media',
    description: '',
  });

  const loadIncidents = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(null);
    try {
      const q = query(
        collection(db, 'incidents'),
        where('user_uid', '==', user.uid),
        orderBy('created_at', 'desc'),
      );
      const snap = await getDocs(q);
      setIncidents(snap.docs.map(d => ({ id: d.id, ...d.data() } as Incident)));
    } catch (e: any) {
      setLoadError('No se pudieron cargar las incidencias. ' + (e?.message ?? ''));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { loadIncidents(); }, [loadIncidents]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setAttachmentFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = ev => setAttachmentPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setAttachmentPreview(null);
    }
  };

  const clearAttachment = () => {
    setAttachmentFile(null);
    setAttachmentPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      let attachment_url: string | null = null;
      if (attachmentFile) {
        const path = `incident-attachments/${user.uid}/${Date.now()}-${attachmentFile.name}`;
        const fileRef = storageRef(storage, path);
        await uploadBytes(fileRef, attachmentFile);
        attachment_url = await getDownloadURL(fileRef);
      }
      await addDoc(collection(db, 'incidents'), {
        user_uid:       user.uid,
        user_email:     user.email,
        user_name:      user.displayName || user.email?.split('@')[0] || 'Usuario',
        ...form,
        status:         'abierta',
        admin_notes:    '',
        messages:       [],
        attachment_url: attachment_url ?? null,
        created_at:     serverTimestamp(),
        updated_at:     serverTimestamp(),
      });
      setForm({ subject: '', category: 'pregunta', priority: 'media', description: '' });
      clearAttachment();
      setShowForm(false);
      setSuccessMsg(true);
      setTimeout(() => setSuccessMsg(false), 5000);
      loadIncidents();
    } catch (e: any) {
      setSubmitError('Error al enviar: ' + (e?.message ?? 'inténtalo de nuevo'));
    }
    setSubmitting(false);
  };

  const inputClass = "w-full p-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 text-sm placeholder-zinc-500 focus:ring-2 focus:ring-lime-400 focus:border-lime-400 outline-none transition";
  const labelClass = "block text-xs font-medium text-zinc-400 mb-1";

  return (
    <section id="mis-incidencias" className="mt-12">
      <div className="flex items-center justify-between mb-5 gap-4">
        <div>
          <h2 className="text-xl font-bold text-zinc-100">Mis incidencias</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Seguimiento de tus consultas y problemas reportados</p>
        </div>
        <button
          onClick={() => { setShowForm(s => !s); setSubmitError(null); }}
          className="shrink-0 px-4 py-2 bg-lime-400 hover:bg-lime-500 text-black text-sm font-semibold rounded-lg transition-colors shadow-lg shadow-lime-400/10"
        >
          + Nueva incidencia
        </button>
      </div>

      {successMsg && (
        <div className="mb-5 bg-green-950/50 border border-green-800 text-green-400 rounded-xl px-4 py-3 text-sm">
          ✓ Incidencia enviada. El equipo de soporte te responderá pronto.
        </div>
      )}

      {showForm && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
          <h3 className="text-base font-bold text-zinc-100 mb-4">Nueva incidencia</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Categoría</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={inputClass}>
                  <option value="pregunta">Pregunta general</option>
                  <option value="plan">Plan de entrenamiento</option>
                  <option value="bug">Error en la app</option>
                  <option value="cuenta">Cuenta / acceso</option>
                  <option value="strava">Integración Strava</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Prioridad</label>
                <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className={inputClass}>
                  <option value="baja">Baja — consulta o mejora</option>
                  <option value="media">Media — problema que puedo evitar</option>
                  <option value="alta">Alta — bloquea mi uso</option>
                </select>
              </div>
            </div>
            <div>
              <label className={labelClass}>Asunto</label>
              <input
                type="text" value={form.subject}
                onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                placeholder="Describe brevemente el problema"
                className={inputClass} required
              />
            </div>
            <div>
              <label className={labelClass}>Descripción detallada</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={4} placeholder="Qué intentabas hacer, qué ocurrió, qué esperabas que pasase…"
                className={`${inputClass} resize-none`} required
              />
            </div>
            <div>
              <label className={labelClass}>Captura de pantalla <span className="text-zinc-600 font-normal">(opcional, máx. 10 MB)</span></label>
              {attachmentPreview ? (
                <div className="relative inline-block">
                  <img src={attachmentPreview} alt="Vista previa" className="max-h-48 max-w-full rounded-lg border border-zinc-700 object-contain" />
                  <button type="button" onClick={clearAttachment}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-zinc-700 hover:bg-red-900 text-zinc-300 rounded-full text-xs flex items-center justify-center transition-colors">✕</button>
                </div>
              ) : (
                <label className="flex items-center gap-3 px-4 py-3 bg-zinc-800 border border-dashed border-zinc-600 hover:border-lime-400 rounded-lg cursor-pointer transition-colors group">
                  <svg className="w-5 h-5 text-zinc-500 group-hover:text-lime-400 transition-colors" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  <span className="text-sm text-zinc-500 group-hover:text-zinc-300 transition-colors">
                    {attachmentFile ? attachmentFile.name : 'Adjuntar captura de pantalla'}
                  </span>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                </label>
              )}
            </div>
            {submitError && (
              <p className="text-red-400 text-sm bg-red-950/40 border border-red-800 rounded-lg px-3 py-2">{submitError}</p>
            )}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => { setShowForm(false); clearAttachment(); setSubmitError(null); }}
                className="px-4 py-2 text-sm text-zinc-400 border border-zinc-700 rounded-lg hover:text-zinc-200 transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={submitting}
                className="px-4 py-2 bg-lime-400 hover:bg-lime-500 text-black text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors">
                {submitting ? (attachmentFile ? 'Subiendo adjunto…' : 'Enviando…') : 'Enviar incidencia'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          {!loading && <span className="text-xs text-zinc-600">{incidents.length} incidencia{incidents.length !== 1 ? 's' : ''}</span>}
          <button onClick={loadIncidents} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors ml-auto">↻ Recargar</button>
        </div>

        {loadError && (
          <div className="bg-red-950/40 border border-red-800 text-red-400 rounded-xl px-4 py-3 text-sm">{loadError}</div>
        )}

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 rounded-full border-2 border-zinc-700 border-t-lime-400 animate-spin" />
          </div>
        ) : incidents.length === 0 && !loadError ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-zinc-500 text-sm">No tienes ninguna incidencia abierta.</p>
          </div>
        ) : (
          incidents.map(i => (
            <div key={i.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandedId(expandedId === i.id ? null : i.id)}
                className="w-full flex items-start justify-between p-4 hover:bg-zinc-800/40 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${STATUS_CONFIG[i.status]?.color}`}>
                      {STATUS_CONFIG[i.status]?.icon} {STATUS_CONFIG[i.status]?.label}
                    </span>
                    <span className="text-xs text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded">{i.category}</span>
                    {i.messages?.some(m => m.sender === 'admin') && (
                      <span className="text-xs text-lime-400 font-semibold">💬 Respuesta</span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-zinc-100">{i.subject}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {i.created_at?.toDate?.().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) ?? '—'}
                  </p>
                </div>
                <svg className={`w-4 h-4 text-zinc-500 ml-3 mt-1 shrink-0 transition-transform ${expandedId === i.id ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedId === i.id && (
                <div className="border-t border-zinc-800 p-4 space-y-4 bg-zinc-950/30">
                  {i.description && (
                    <div>
                      <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Tu descripción</p>
                      <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{i.description}</p>
                    </div>
                  )}
                  {i.attachment_url && (
                    <div>
                      <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Captura adjunta</p>
                      <a href={i.attachment_url} target="_blank" rel="noopener noreferrer">
                        <img src={i.attachment_url} alt="Adjunto"
                          className="max-h-64 max-w-full rounded-lg border border-zinc-700 object-contain hover:opacity-90 transition-opacity" />
                      </a>
                    </div>
                  )}
                  {i.messages?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Hilo de respuestas</p>
                      {i.messages.map((m, idx) => (
                        <div key={idx} className={`rounded-xl p-3 text-sm ${
                          m.sender === 'admin'
                            ? 'bg-lime-400/10 border border-lime-400/20 text-zinc-200'
                            : 'bg-zinc-800 text-zinc-300'
                        }`}>
                          <p className="text-xs font-bold mb-1 text-zinc-500">
                            {m.sender === 'admin' ? '💬 Soporte Zypace' : 'Tú'}
                          </p>
                          <p className="leading-relaxed">{m.text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {i.status === 'resuelta' && (
                    <div className="bg-green-950/30 border border-green-800 rounded-lg p-3 text-xs text-green-400 flex items-center gap-2">
                      <span>✓</span> Esta incidencia ha sido marcada como resuelta.
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

// ── Main SupportPage ──────────────────────────────────────────────────
const SupportPage = () => {
  const { user } = useAuth();

  return (
    <main className="container mx-auto p-4 sm:p-6 lg:p-8 max-w-3xl">

      {/* ── Hero ── */}
      <div className="mb-10">
        <p className="text-xs font-semibold text-lime-400 uppercase tracking-widest mb-2">Centro de ayuda</p>
        <h1 className="text-4xl font-bold text-zinc-100 mb-3">¿En qué podemos ayudarte?</h1>
        <p className="text-zinc-400 text-base leading-relaxed max-w-xl">
          Encuentra respuestas a las preguntas más frecuentes sobre Zypace, la integración con Strava
          y cómo gestionar tu cuenta.
        </p>
      </div>

      {/* ── Quick cards ── */}
      <div className="grid sm:grid-cols-3 gap-4 mb-10">
        <a
          href="mailto:support.zypace@gmail.com"
          className="group bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl p-5 transition-colors"
        >
          <div className="w-9 h-9 rounded-lg bg-lime-400/10 flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-lime-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-zinc-200 group-hover:text-white transition-colors">Contactar por email</p>
          <p className="text-xs text-zinc-500 mt-1">support.zypace@gmail.com</p>
        </a>

        <a
          href="#faq"
          className="group bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl p-5 transition-colors"
        >
          <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-zinc-200 group-hover:text-white transition-colors">Preguntas frecuentes</p>
          <p className="text-xs text-zinc-500 mt-1">Respuestas rápidas</p>
        </a>

        {user ? (
          <a
            href="#mis-incidencias"
            className="group bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl p-5 transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a3 3 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-zinc-200 group-hover:text-white transition-colors">Abrir incidencia</p>
            <p className="text-xs text-zinc-500 mt-1">Soporte personalizado</p>
          </a>
        ) : (
          <Link
            to="/login"
            className="group bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl p-5 transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-zinc-200 group-hover:text-white transition-colors">Iniciar sesión</p>
            <p className="text-xs text-zinc-500 mt-1">Para abrir incidencias</p>
          </Link>
        )}
      </div>

      {/* ── Strava integration section ── */}
      <section className="mb-10">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 rounded-lg bg-[#FC4C02]/10 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-[#FC4C02]">
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-zinc-100">Integración con Strava</h2>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {/* How data is used */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Cómo usamos tus datos</p>
            <ul className="space-y-2.5 text-sm text-zinc-400">
              {[
                'Leemos tus actividades (distancia, ritmo, tiempo)',
                'Marcamos automáticamente los entrenamientos completados',
                'Calibramos tus zonas de ritmo personalizadas',
                'Nunca modificamos ni eliminamos actividades de Strava',
                'No compartimos datos con terceros',
              ].map(item => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-lime-400 mt-0.5 shrink-0">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* How to disconnect */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Cómo desconectar Strava</p>
            <p className="text-xs text-zinc-600 mb-1">Puedes revocar el acceso en cualquier momento</p>
            <DisconnectSteps />
            <p className="text-xs text-zinc-600 mt-3">
              También puedes revocar el acceso directamente desde{' '}
              <a
                href="https://www.strava.com/settings/apps"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#FC4C02] hover:underline"
              >
                Strava → Configuración → Mis aplicaciones
              </a>.
            </p>
          </div>
        </div>

        {/* Powered by Strava */}
        <div className="mt-4 flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-3">
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-[#FC4C02] shrink-0">
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
          </svg>
          <p className="text-xs text-zinc-400">
            Zypace utiliza la API de Strava y sigue las{' '}
            <a href="https://www.strava.com/legal/api" target="_blank" rel="noopener noreferrer" className="text-zinc-300 hover:text-white underline underline-offset-2">
              directrices de uso de la API de Strava
            </a>.
          </p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="mb-10">
        <h2 className="text-lg font-bold text-zinc-100 mb-4">Preguntas frecuentes</h2>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 divide-y-0">
          {FAQ_ITEMS.map(item => <FaqItem key={item.q} q={item.q} a={item.a} />)}
        </div>
      </section>

      {/* ── Legal links ── */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-4">Documentos legales</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Privacidad', to: '/privacy' },
            { label: 'Términos de uso', to: '/terms' },
            { label: 'Seguridad', to: '/security' },
            { label: 'Cookies', to: '/cookies' },
          ].map(({ label, to }) => (
            <Link
              key={to}
              to={to}
              className="bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-lg px-4 py-3 text-sm text-zinc-400 hover:text-zinc-200 transition-colors text-center"
            >
              {label}
            </Link>
          ))}
        </div>
      </section>

      {/* ── Incident system (logged-in users only) ── */}
      {user && <IncidentSystem />}

      {/* ── Not logged in CTA ── */}
      {!user && (
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
          <p className="text-zinc-400 text-sm mb-4">
            ¿No encuentras lo que buscas? Inicia sesión para abrir una incidencia y nuestro equipo te responderá personalmente.
          </p>
          <Link
            to="/login"
            className="inline-block px-5 py-2.5 bg-lime-400 hover:bg-lime-500 text-black text-sm font-semibold rounded-lg transition-colors"
          >
            Iniciar sesión para obtener soporte
          </Link>
        </section>
      )}

    </main>
  );
};

export default SupportPage;
