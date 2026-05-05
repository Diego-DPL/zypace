import { useState, useEffect, useCallback } from 'react';
import {
  collection, getDocs, doc, updateDoc, addDoc,
  query, orderBy, limit, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebaseClient';
import { useAuth } from '../context/AuthContext';

type Tab = 'dashboard' | 'users' | 'incidents';
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
  z1_pace_sec_km: number | null;
  z4_pace_sec_km: number | null;
  z5_pace_sec_km: number | null;
  zones_confidence: string | null;
  zones_calibrated_at: string | null;
  // loaded on expand
  plan?: any | null;
  workouts?: any[];
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
      <div className="flex gap-1 bg-zinc-900 p-1 rounded-xl mb-6 border border-zinc-800 w-fit">
        {([
          ['dashboard', 'Resumen'],
          ['users',     'Usuarios'],
          ['incidents', 'Incidencias'],
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
                        <p className="text-sm font-medium text-zinc-100 truncate">
                          {[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}
                          {u.role === 'admin' && (
                            <span className="ml-2 text-[10px] bg-lime-400/10 text-lime-400 border border-lime-400/30 px-1.5 py-0.5 rounded-full font-bold">ADMIN</span>
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
