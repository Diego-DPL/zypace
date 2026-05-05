import { useState, useEffect, useCallback, useRef } from 'react';
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

const SupportPage = () => {
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
      console.error('Error loading incidents', e);
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
      // Upload attachment if present
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
      console.error('Error creating incident', e);
      setSubmitError('Error al enviar: ' + (e?.message ?? 'inténtalo de nuevo'));
    }
    setSubmitting(false);
  };

  const inputClass = "w-full p-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 text-sm placeholder-zinc-500 focus:ring-2 focus:ring-lime-400 focus:border-lime-400 outline-none transition";
  const labelClass = "block text-xs font-medium text-zinc-400 mb-1";

  return (
    <main className="container mx-auto p-4 sm:p-6 lg:p-8 max-w-3xl">

      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100">Soporte</h1>
          <p className="text-sm text-zinc-500 mt-1">
            ¿Tienes algún problema o duda? Abre una incidencia y te responderemos.
          </p>
        </div>
        <button
          onClick={() => { setShowForm(s => !s); setSubmitError(null); }}
          className="shrink-0 px-4 py-2 bg-lime-400 hover:bg-lime-500 text-black text-sm font-semibold rounded-lg transition-colors shadow-lg shadow-lime-400/10"
        >
          + Nueva incidencia
        </button>
      </div>

      {/* Success banner */}
      {successMsg && (
        <div className="mb-5 bg-green-950/50 border border-green-800 text-green-400 rounded-xl px-4 py-3 text-sm">
          ✓ Incidencia enviada. El equipo de soporte te responderá pronto.
        </div>
      )}

      {/* New incident form */}
      {showForm && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
          <h2 className="text-base font-bold text-zinc-100 mb-4">Nueva incidencia</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Categoría</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className={inputClass}>
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
                <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                  className={inputClass}>
                  <option value="baja">Baja — consulta o mejora</option>
                  <option value="media">Media — problema que puedo evitar</option>
                  <option value="alta">Alta — bloquea mi uso</option>
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass}>Asunto</label>
              <input
                type="text"
                value={form.subject}
                onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                placeholder="Describe brevemente el problema"
                className={inputClass}
                required
              />
            </div>

            <div>
              <label className={labelClass}>Descripción detallada</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={4}
                placeholder="Qué intentabas hacer, qué ocurrió, qué esperabas que pasase…"
                className={`${inputClass} resize-none`}
                required
              />
            </div>

            {/* Screenshot / attachment */}
            <div>
              <label className={labelClass}>Captura de pantalla <span className="text-zinc-600 font-normal">(opcional, máx. 10 MB)</span></label>
              {attachmentPreview ? (
                <div className="relative inline-block">
                  <img
                    src={attachmentPreview}
                    alt="Vista previa"
                    className="max-h-48 max-w-full rounded-lg border border-zinc-700 object-contain"
                  />
                  <button
                    type="button"
                    onClick={clearAttachment}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-zinc-700 hover:bg-red-900 text-zinc-300 rounded-full text-xs flex items-center justify-center transition-colors"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <label className="flex items-center gap-3 px-4 py-3 bg-zinc-800 border border-dashed border-zinc-600 hover:border-lime-400 rounded-lg cursor-pointer transition-colors group">
                  <svg className="w-5 h-5 text-zinc-500 group-hover:text-lime-400 transition-colors" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  <span className="text-sm text-zinc-500 group-hover:text-zinc-300 transition-colors">
                    {attachmentFile ? attachmentFile.name : 'Adjuntar captura de pantalla'}
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
              )}
            </div>

            {submitError && (
              <p className="text-red-400 text-sm bg-red-950/40 border border-red-800 rounded-lg px-3 py-2">{submitError}</p>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setShowForm(false); clearAttachment(); setSubmitError(null); }}
                className="px-4 py-2 text-sm text-zinc-400 border border-zinc-700 rounded-lg hover:text-zinc-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-lime-400 hover:bg-lime-500 text-black text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
              >
                {submitting ? (attachmentFile ? 'Subiendo adjunto…' : 'Enviando…') : 'Enviar incidencia'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Incidents list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-400">Mis incidencias</h2>
          <div className="flex items-center gap-3">
            {!loading && <span className="text-xs text-zinc-600">{incidents.length} total</span>}
            <button onClick={loadIncidents} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">↻ Recargar</button>
          </div>
        </div>

        {loadError && (
          <div className="bg-red-950/40 border border-red-800 text-red-400 rounded-xl px-4 py-3 text-sm">
            {loadError}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 rounded-full border-2 border-zinc-700 border-t-lime-400 animate-spin" />
          </div>
        ) : incidents.length === 0 && !loadError ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
            <div className="text-4xl mb-3">🎫</div>
            <p className="text-zinc-400 font-medium text-sm">Sin incidencias</p>
            <p className="text-zinc-600 text-xs mt-1">Si tienes alguna duda o problema, usa el botón de arriba.</p>
          </div>
        ) : (
          incidents.map(i => (
            <div key={i.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              {/* Card header */}
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
                <svg
                  className={`w-4 h-4 text-zinc-500 ml-3 mt-1 shrink-0 transition-transform ${expandedId === i.id ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
                >
                  <path d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Expanded detail */}
              {expandedId === i.id && (
                <div className="border-t border-zinc-800 p-4 space-y-4 bg-zinc-950/30">
                  {i.description && (
                    <div>
                      <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Tu descripción</p>
                      <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{i.description}</p>
                    </div>
                  )}

                  {/* Attachment */}
                  {i.attachment_url && (
                    <div>
                      <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Captura adjunta</p>
                      <a href={i.attachment_url} target="_blank" rel="noopener noreferrer">
                        <img
                          src={i.attachment_url}
                          alt="Adjunto"
                          className="max-h-64 max-w-full rounded-lg border border-zinc-700 object-contain hover:opacity-90 transition-opacity"
                        />
                      </a>
                    </div>
                  )}

                  {/* Messages / replies */}
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
    </main>
  );
};

export default SupportPage;
