import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  collection, getDocs, doc, getDoc, query, where, orderBy, updateDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebaseClient';
import { Race } from '../types';
import AddGoalModal from '../components/AddGoalModal';
import PlanManagerModal from '../components/PlanManagerModal';
import pwrdByStrava from '../assets/1.2-Strava-API-Logos/Powered by Strava/pwrdBy_strava_white/api_logo_pwrdBy_strava_horiz_white.svg';
import { parseExercises } from '../lib/strengthParser';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Workout {
  id: string;
  workout_date: string;
  description: string;
  is_completed: boolean;
  rpe?: number | null;
  feeling?: string | null;
  notes?: string | null;
  sleep_quality?: number | null;
  freshness_start?: string | null;
  distance_km?: number | null;
  duration_min?: number | null;
  elevation_gain_m?: number | null;
  explanation_json?: any;
}

interface StravaActivity {
  activity_id?: number;
  name?: string;
  distance_m?: number;
  moving_time?: number;
  sport_type?: string | null;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
  total_elevation_gain?: number | null;
  suffer_score?: number | null;
  average_cadence?: number | null;
  pr_count?: number | null;
}

interface TrainingPlan {
  id: string;
  goal: string;
  workouts: Workout[];
  mesocycle_number?: number | null;
  mesocycle_end_date?: string | null;
  total_mesocycles?: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getWeekMonday(dateISO: string): string {
  const d = new Date(dateISO + 'T00:00:00Z');
  const dow = d.getUTCDay();
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return mon.toISOString().split('T')[0];
}
function addDays(dateISO: string, days: number): string {
  const d = new Date(dateISO + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}
function getWorkoutType(w: Workout): string {
  if (w.explanation_json?.type) return w.explanation_json.type;
  const d = w.description.toLowerCase();
  if (/descanso|rest/.test(d))            return 'descanso';
  if (/fuerza/.test(d))                   return 'fuerza';
  if (/subida|desnivel|d\+|hill/.test(d)) return 'subida';
  if (/series|fartlek|\dx/.test(d))       return 'series';
  if (/umbral/.test(d))                   return 'umbral';
  if (/tempo/.test(d))                    return 'tempo';
  if (/largo/.test(d))                    return 'largo';
  return 'suave';
}
function groupByWeek(workouts: Workout[]): Array<{ key: string; label: string; range: string; items: Workout[] }> {
  const map = new Map<string, Workout[]>();
  for (const w of workouts) {
    const d = new Date(w.workout_date + 'T00:00:00Z');
    const dow = d.getUTCDay();
    const mon = new Date(d);
    mon.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
    const key = mon.toISOString().split('T')[0];
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(w);
  }
  let n = 0;
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, items]) => {
      n++;
      const mon = new Date(key + 'T00:00:00Z');
      const sun = new Date(mon); sun.setUTCDate(mon.getUTCDate() + 6);
      const fmt = (d: Date) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' });
      return { key, label: `Sem ${n}`, range: `${fmt(mon)}–${fmt(sun)}`, items };
    });
}
function formatPace(secs: number, distM: number): string {
  if (!distM || distM < 100 || !secs) return '—';
  const spk = secs / (distM / 1000);
  return `${Math.floor(spk / 60)}:${Math.round(spk % 60).toString().padStart(2, '0')}/km`;
}
function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}
function getRpeColor(n: number): string {
  if (n <= 2) return '#22c55e';
  if (n <= 4) return '#84cc16';
  if (n === 5) return '#eab308';
  if (n <= 6) return '#f97316';
  if (n <= 8) return '#ef4444';
  return '#b91c1c';
}

// ── Constants ─────────────────────────────────────────────────────────────────
const TYPE_STYLES: Record<string, { bg: string; border: string; dot: string; text: string; label: string; color: string }> = {
  suave:    { bg: 'bg-green-950/60',  border: 'border-green-800',  dot: 'bg-green-400',  text: 'text-green-400',  label: 'Suave',    color: '#4ade80' },
  largo:    { bg: 'bg-blue-950/60',   border: 'border-blue-800',   dot: 'bg-blue-400',   text: 'text-blue-400',   label: 'Largo',    color: '#60a5fa' },
  series:   { bg: 'bg-red-950/60',    border: 'border-red-800',    dot: 'bg-red-400',    text: 'text-red-400',    label: 'Series',   color: '#f87171' },
  umbral:   { bg: 'bg-amber-950/60',  border: 'border-amber-800',  dot: 'bg-amber-400',  text: 'text-amber-400',  label: 'Umbral',   color: '#fbbf24' },
  tempo:    { bg: 'bg-orange-950/60', border: 'border-orange-800', dot: 'bg-orange-400', text: 'text-orange-400', label: 'Tempo',    color: '#fb923c' },
  subida:   { bg: 'bg-yellow-950/60', border: 'border-yellow-700', dot: 'bg-yellow-400', text: 'text-yellow-400', label: 'Subida',   color: '#facc15' },
  fuerza:   { bg: 'bg-purple-950/60', border: 'border-purple-800', dot: 'bg-purple-400', text: 'text-purple-400', label: 'Fuerza',   color: '#c084fc' },
  descanso: { bg: 'bg-zinc-900',      border: 'border-zinc-800',   dot: 'bg-zinc-600',   text: 'text-zinc-500',   label: 'Descanso', color: '#52525b' },
};
const DAY_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const RPE_LABELS  = ['','Muy fácil','Fácil','Moderado','Algo duro','Duro','Duro+','Muy duro','Muy duro+','Casi máximo','Máximo'];
const FEELING_OPTIONS = [
  { value: 'great',      label: '¡Genial!', emoji: '🚀', active: 'bg-green-900/50 border-green-500 text-green-300'   },
  { value: 'good',       label: 'Bien',     emoji: '😊', active: 'bg-teal-900/50 border-teal-500 text-teal-300'      },
  { value: 'average',    label: 'Normal',   emoji: '😐', active: 'bg-yellow-900/50 border-yellow-500 text-yellow-300'},
  { value: 'tired',      label: 'Cansado',  emoji: '😓', active: 'bg-orange-900/50 border-orange-500 text-orange-300'},
  { value: 'very_tired', label: 'Agotado',  emoji: '😩', active: 'bg-red-900/50 border-red-500 text-red-300'         },
] as const;
const SLEEP_OPTIONS = [
  { value: 1, label: 'Pésimo',    emoji: '😴', active: 'bg-red-900/50 border-red-500 text-red-300'           },
  { value: 2, label: 'Malo',      emoji: '😪', active: 'bg-orange-900/50 border-orange-500 text-orange-300'  },
  { value: 3, label: 'Regular',   emoji: '😐', active: 'bg-yellow-900/50 border-yellow-500 text-yellow-300'  },
  { value: 4, label: 'Bueno',     emoji: '😊', active: 'bg-teal-900/50 border-teal-500 text-teal-300'        },
  { value: 5, label: 'Excelente', emoji: '🌟', active: 'bg-green-900/50 border-green-500 text-green-300'     },
] as const;
const FRESHNESS_OPTIONS = [
  { value: 'fresh',      label: 'Fresco',     emoji: '🚀', active: 'bg-green-900/50 border-green-500 text-green-300'   },
  { value: 'normal',     label: 'Normal',     emoji: '👌', active: 'bg-teal-900/50 border-teal-500 text-teal-300'      },
  { value: 'heavy',      label: 'Pesado',     emoji: '😓', active: 'bg-orange-900/50 border-orange-500 text-orange-300'},
  { value: 'very_heavy', label: 'Muy pesado', emoji: '🦵', active: 'bg-red-900/50 border-red-500 text-red-300'         },
] as const;
const PHASE_STYLES: Record<string, string> = {
  base: 'bg-teal-900/50 text-teal-400 border-teal-800',
  desarrollo: 'bg-blue-900/50 text-blue-400 border-blue-800',
  especifico: 'bg-lime-900/50 text-lime-400 border-lime-800',
  taper: 'bg-purple-900/50 text-purple-400 border-purple-800',
};
const PHASE_LABELS: Record<string, string> = {
  base: 'Base', desarrollo: 'Desarrollo', especifico: 'Específica', taper: 'Taper',
};

// ── Sub-components ─────────────────────────────────────────────────────────────
function SectionLabel({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className="w-[3px] h-4 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">{children}</span>
    </div>
  );
}

function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center bg-zinc-800/60 rounded-xl px-3 py-2.5 border border-zinc-700/50">
      <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500 mb-1">{label}</span>
      <span className="text-sm font-black text-zinc-100 tabular-nums leading-none">{value}</span>
      {sub && <span className="text-[9px] text-zinc-600 mt-0.5">{sub}</span>}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
const CalendarPage = () => {
  const { user } = useAuth();

  // Data
  const [races, setRaces]               = useState<Race[]>([]);
  const [selectedRace, setSelectedRace] = useState('');
  const [plan, setPlan]                 = useState<TrainingPlan | null>(null);
  const [loadingPlan, setLoadingPlan]   = useState(false);

  // Modals
  const [showAddGoal, setShowAddGoal]     = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);

  // Strava sync
  const [syncing, setSyncing] = useState(false);

  // Calendar nav
  const todayISO = new Date().toISOString().substring(0, 10);
  const [selectedDate, setSelectedDate]               = useState(todayISO);
  const [displayedWeekMonday, setDisplayedWeekMonday] = useState(() => getWeekMonday(todayISO));
  const [mesoExpanded, setMesoExpanded]               = useState(false);
  const touchStartX   = useRef<number | null>(null);
  const workoutCardRef = useRef<HTMLDivElement | null>(null);

  // Workout card
  const [cardExpanded, setCardExpanded] = useState(false);

  // Session log form
  const [logRpe,       setLogRpe]       = useState(0);
  const [logFeeling,   setLogFeeling]   = useState('');
  const [logNotes,     setLogNotes]     = useState('');
  const [logSleep,     setLogSleep]     = useState<number | null>(null);
  const [logFreshness, setLogFreshness] = useState('');
  const [saving,       setSaving]       = useState(false);
  const [saved,        setSaved]        = useState(false);

  // Strava data for selected day
  const [stravaActs,     setStravaActs]     = useState<StravaActivity[]>([]);
  const [loadingStrava,  setLoadingStrava]  = useState(false);

  // ── Strava sync ────────────────────────────────────────────────────────────
  const syncStrava = async (opts: { full?: boolean; reset?: boolean } = {}) => {
    if (!user) return;
    setSyncing(true);
    try {
      const fn  = httpsCallable(functions, 'syncStrava');
      const res = await fn(opts);
      const data = res.data as any;
      window.dispatchEvent(new Event('workouts-changed'));
      alert(data
        ? `Sync completado: ${data.importedNew} nuevas, ${data.fetchedTotal} descargadas`
        : 'Sincronización completada');
    } catch (e: any) { alert(`Error: ${e.message || e}`); }
    finally { setSyncing(false); }
  };

  // ── Data fetching ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    (async () => {
      const snap = await getDocs(query(collection(db, 'users', user.uid, 'races'), orderBy('date', 'asc')));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Race));
      setRaces(list);
      const next = list.find(r => r.date >= todayISO);
      setSelectedRace(next?.id ?? list[list.length - 1]?.id ?? '');
    })();
  }, [user]);

  const fetchPlan = useCallback(async () => {
    if (!user) return;
    setLoadingPlan(true); setPlan(null);
    try {
      const snap = await getDoc(doc(db, 'users', user.uid, 'training_plans', 'default'));
      if (!snap.exists()) return;
      const ws = await getDocs(
        query(collection(db, 'users', user.uid, 'workouts'), where('plan_id', '==', 'default'), orderBy('workout_date', 'asc'))
      );
      setPlan({ id: 'default', ...snap.data(), workouts: ws.docs.map(d => ({ id: d.id, ...d.data() } as Workout)) } as TrainingPlan);
    } catch (e) { console.warn(e); }
    finally { setLoadingPlan(false); }
  }, [user]);

  useEffect(() => { if (user) fetchPlan(); }, [user, fetchPlan]);

  useEffect(() => {
    if (plan && !selectedRace) {
      const id = (plan as any).primary_race_id || (plan as any).race_id;
      if (id) setSelectedRace(id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  useEffect(() => {
    const h = () => fetchPlan();
    window.addEventListener('workouts-changed', h);
    return () => window.removeEventListener('workouts-changed', h);
  }, [fetchPlan]);

  // Jump to nearest workout when plan first loads
  useEffect(() => {
    if (!plan?.workouts.length) return;
    if (!plan.workouts.some(w => w.workout_date === todayISO)) {
      const t = plan.workouts.find(w => w.workout_date >= todayISO) ?? plan.workouts[plan.workouts.length - 1];
      setSelectedDate(t.workout_date);
      setDisplayedWeekMonday(getWeekMonday(t.workout_date));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.id]);

  // When selected date changes: load log data, load Strava, auto-expand today
  useEffect(() => {
    if (!plan || !user) return;
    const w = plan.workouts.find(x => x.workout_date === selectedDate);

    // Restore log fields from saved workout data
    setLogRpe(w?.rpe ?? 0);
    setLogFeeling(w?.feeling ?? '');
    setLogNotes(w?.notes ?? '');
    setLogSleep(typeof w?.sleep_quality === 'number' ? w.sleep_quality : null);
    setLogFreshness(w?.freshness_start ?? '');
    setSaved(false);

    // Auto-expand today; collapse other days
    setCardExpanded(selectedDate === todayISO);

    // Scroll to top of workout card so the user always starts from the beginning
    requestAnimationFrame(() => {
      workoutCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // Load Strava activities for past/today days
    if (selectedDate <= todayISO) {
      setLoadingStrava(true);
      setStravaActs([]);
      getDocs(query(collection(db, 'users', user.uid, 'strava_activities'), where('start_date', '==', selectedDate)))
        .then(s => setStravaActs(s.docs.map(d => d.data() as StravaActivity)))
        .catch(console.warn)
        .finally(() => setLoadingStrava(false));
    } else {
      setStravaActs([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, plan?.id, user]);

  // ── Toggle complete ────────────────────────────────────────────────────────
  const handleToggleComplete = async (workoutId: string, current: boolean) => {
    if (!user || !plan) return;
    const next = !current;
    setPlan(prev => prev ? { ...prev, workouts: prev.workouts.map(w => w.id === workoutId ? { ...w, is_completed: next } : w) } : null);
    try {
      await updateDoc(doc(db, 'users', user.uid, 'workouts', workoutId), { is_completed: next });
      window.dispatchEvent(new Event('workouts-changed'));
    } catch {
      setPlan(prev => prev ? { ...prev, workouts: prev.workouts.map(w => w.id === workoutId ? { ...w, is_completed: current } : w) } : null);
    }
  };

  // ── Save session log ───────────────────────────────────────────────────────
  const handleSaveLog = async () => {
    if (!user || !selectedWorkout) return;
    setSaving(true);
    try {
      const updates: Record<string, unknown> = {
        rpe: logRpe || null, feeling: logFeeling || null,
        notes: logNotes.trim() || null, sleep_quality: logSleep ?? null,
        freshness_start: logFreshness || null,
      };
      if (!selectedWorkout.is_completed && selectedDate <= todayISO &&
          (logRpe > 0 || logFeeling || logNotes.trim() || logFreshness)) {
        updates.is_completed = true;
      }
      await updateDoc(doc(db, 'users', user.uid, 'workouts', selectedWorkout.id), updates);
      setPlan(prev => prev ? {
        ...prev,
        workouts: prev.workouts.map(w => w.id === selectedWorkout.id ? { ...w, ...updates } : w),
      } : null);
      setSaved(true);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  // ── Touch swipe ────────────────────────────────────────────────────────────
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd   = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const d = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(d) > 60) {
      if (d > 0 && canGoNext) setDisplayedWeekMonday(p => addDays(p, 7));
      else if (d < 0 && canGoPrev) setDisplayedWeekMonday(p => addDays(p, -7));
    }
    touchStartX.current = null;
  };

  const handleDaySelect = (dateISO: string) => {
    setSelectedDate(dateISO);
    const m = getWeekMonday(dateISO);
    if (m !== displayedWeekMonday) setDisplayedWeekMonday(m);
  };

  const goToToday = () => { setSelectedDate(todayISO); setDisplayedWeekMonday(getWeekMonday(todayISO)); };

  // ── Derived ────────────────────────────────────────────────────────────────
  const weeks             = plan ? groupByWeek(plan.workouts) : [];
  const weekDays          = Array.from({ length: 7 }, (_, i) => addDays(displayedWeekMonday, i));
  const selectedWorkout   = plan?.workouts.find(w => w.workout_date === selectedDate) ?? null;
  const planFirstMonday   = plan?.workouts.length ? getWeekMonday(plan.workouts[0].workout_date) : null;
  const planLastMonday    = plan?.workouts.length ? getWeekMonday(plan.workouts[plan.workouts.length - 1].workout_date) : null;
  const canGoPrev         = !!planFirstMonday && displayedWeekMonday > planFirstMonday;
  const canGoNext         = !!planLastMonday  && displayedWeekMonday < planLastMonday;
  const displayedWeekIdx  = weeks.findIndex(w => w.key === displayedWeekMonday);
  const isCurrentWeekShown = displayedWeekMonday === getWeekMonday(todayISO);
  const planPrimaryRace   = races.find(r => r.id === ((plan as any)?.primary_race_id || (plan as any)?.race_id));
  const selectedRaceDetails = races.find(r => r.id === selectedRace);
  const allTrain          = plan?.workouts.filter(w => !/descanso|rest/i.test(w.description)) ?? [];
  const doneTrain         = allTrain.filter(w => w.is_completed);
  const progressPct       = allTrain.length > 0 ? Math.round(doneTrain.length / allTrain.length * 100) : 0;
  const daysUntilMesoEnd  = plan?.mesocycle_end_date
    ? Math.ceil((new Date(plan.mesocycle_end_date).getTime() - new Date(todayISO).getTime()) / 86400000)
    : null;
  const formatDateFull    = (iso: string) =>
    new Date(iso + 'T00:00:00Z').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen pb-24">

      {/* ══════════ HEADER ══════════ */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 pb-4">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-zinc-100 leading-tight">
              {planPrimaryRace?.name ?? 'Calendario'}
            </h1>
            {plan && (
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {plan.mesocycle_number && plan.total_mesocycles && (
                  <span className="text-[11px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                    Mes {plan.mesocycle_number}/{plan.total_mesocycles}
                  </span>
                )}
                {daysUntilMesoEnd != null && (
                  daysUntilMesoEnd <= 0
                    ? <span className="text-[11px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700 px-2 py-0.5 rounded-full">Terminado</span>
                    : daysUntilMesoEnd <= 14 && (
                      <span className="text-[11px] font-bold bg-lime-400/10 text-lime-400 border border-lime-400/20 px-2 py-0.5 rounded-full">
                        {daysUntilMesoEnd}d restantes
                      </span>
                    )
                )}
                <span className="text-xs text-zinc-600 truncate max-w-[180px] sm:max-w-xs">{plan.goal}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <img src={pwrdByStrava} alt="Strava" className="h-3 w-auto opacity-60 mr-0.5" />
            {[
              { icon: syncing ? 'spin' : 'sync',  title: 'Sincronizar Strava',   action: () => syncStrava(),        disabled: syncing },
              { icon: 'plus',   title: 'Añadir objetivo',     action: () => setShowAddGoal(true), disabled: false },
              { icon: 'gear',   title: plan ? 'Gestionar plan' : 'Crear plan', action: () => setShowPlanModal(true), disabled: false },
            ].map(({ icon, title, action, disabled }) => (
              <button key={icon} onClick={action} disabled={disabled} title={title}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-600 disabled:opacity-30 transition-all">
                {icon === 'sync' || icon === 'spin' ? (
                  <svg className={`w-4 h-4 ${icon === 'spin' ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />
                  </svg>
                ) : icon === 'plus' ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>

        {plan && allTrain.length > 0 && (
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, #65a30d, #a3e635)' }} />
            </div>
            <span className="text-xs font-bold text-zinc-600 tabular-nums flex-shrink-0">
              {doneTrain.length}<span className="text-zinc-700">/{allTrain.length}</span>
            </span>
            <span className="text-xs font-black text-lime-500 flex-shrink-0">{progressPct}%</span>
          </div>
        )}
      </div>

      {/* ══════════ MESOCYCLE ENDING / ENDED BANNER ══════════ */}
      {!loadingPlan && plan && (daysUntilMesoEnd === null || daysUntilMesoEnd <= 7) && (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 mb-3">
          {(daysUntilMesoEnd === null || daysUntilMesoEnd <= 0) ? (
            (plan.total_mesocycles ?? 1) > (plan.mesocycle_number ?? 1) ? (
              /* More mesocycles available → generate next */
              <button onClick={() => setShowPlanModal(true)}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-indigo-500/30 bg-indigo-950/40 hover:bg-indigo-950/60 transition-colors text-left">
                <div className="w-9 h-9 rounded-lg bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4.5 h-4.5 text-indigo-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-indigo-300">Tu mesociclo ha terminado</p>
                  <p className="text-xs text-indigo-400/70">Genera el mesociclo {(plan.mesocycle_number || 1) + 1} para seguir progresando</p>
                </div>
                <svg className="w-4 h-4 text-indigo-500 flex-shrink-0 ml-auto" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            ) : (
              /* Last/only mesocycle done → regenerate plan */
              <button onClick={() => setShowPlanModal(true)}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-lime-400/20 bg-lime-950/30 hover:bg-lime-950/50 transition-colors text-left">
                <div className="w-9 h-9 rounded-lg bg-lime-400/10 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4.5 h-4.5 text-lime-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/>
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-lime-300">¡Plan completado!</p>
                  <p className="text-xs text-lime-400/60">Regenera el plan o crea uno nuevo para tu próxima carrera</p>
                </div>
                <svg className="w-4 h-4 text-lime-500/60 flex-shrink-0 ml-auto" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            )
          ) : (
            /* Ending soon (1-7 days) */
            <button onClick={() => setShowPlanModal(true)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-500/20 bg-amber-950/20 hover:bg-amber-950/35 transition-colors text-left">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-4.5 h-4.5 text-amber-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-amber-300">Tu mesociclo termina en {daysUntilMesoEnd} día{daysUntilMesoEnd !== 1 ? 's' : ''}</p>
                <p className="text-xs text-amber-400/60">Prepara el siguiente mesociclo desde ajustes del plan</p>
              </div>
              <svg className="w-4 h-4 text-amber-500/60 flex-shrink-0 ml-auto" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          )}
        </div>
      )}

      {loadingPlan && (
        <div className="max-w-2xl mx-auto px-4 py-16 flex items-center justify-center gap-3">
          <div className="w-5 h-5 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-zinc-500">Cargando plan…</span>
        </div>
      )}

      {plan && (
        <>
          {/* ══════════ MESOCYCLE OVERVIEW (scrolls away above sticky strip) ══════════ */}
          <div className="max-w-2xl mx-auto px-4 sm:px-6 pb-3">
            <button
              onClick={() => setMesoExpanded(p => !p)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900 hover:border-zinc-700 text-sm font-semibold text-zinc-500 hover:text-zinc-200 transition-all"
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4 text-zinc-600" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                Ver mesociclo completo
              </span>
              <svg className={`w-4 h-4 transition-transform duration-200 ${mesoExpanded ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {mesoExpanded && (
              <div className="mt-2 rounded-2xl border border-zinc-800 overflow-hidden">
                {/* Legend */}
                <div className="px-4 py-2.5 border-b border-zinc-800/60 flex flex-wrap gap-x-3 gap-y-1 bg-zinc-900/20">
                  {Object.entries(TYPE_STYLES).filter(([k]) => k !== 'descanso').map(([, s]) => (
                    <span key={s.label} className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                      {s.label}
                    </span>
                  ))}
                </div>
                {weeks.map(({ key, label, range, items }) => {
                  const wDays   = Array.from({ length: 7 }, (_, i) => addDays(key, i));
                  const train   = items.filter(w => !/descanso|rest/i.test(w.description));
                  const done    = train.filter(w => w.is_completed);
                  const km      = train.reduce((s, w) => s + (w.distance_km || 0), 0);
                  const allDone = train.length > 0 && done.length === train.length;
                  const isThis  = key === getWeekMonday(todayISO);
                  const isPast  = addDays(key, 6) < todayISO;
                  return (
                    <div key={key}
                      className={`border-b border-zinc-800/40 last:border-b-0 px-4 py-3 ${isThis ? 'bg-lime-400/5' : isPast ? 'opacity-55' : ''}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-[52px] flex-shrink-0">
                          <p className={`text-[11px] font-black uppercase ${isThis ? 'text-lime-500' : 'text-zinc-500'}`}>{label}</p>
                          <p className="text-[9px] text-zinc-700">{range}</p>
                        </div>
                        <div className="flex flex-1 justify-between">
                          {wDays.map((dateISO, i) => {
                            const w = items.find(x => x.workout_date === dateISO);
                            const t = w ? getWorkoutType(w) : null;
                            const s = t ? (TYPE_STYLES[t] ?? TYPE_STYLES.suave) : null;
                            const r = t === 'descanso';
                            const isSel = dateISO === selectedDate;
                            return (
                              <button key={dateISO} disabled={!w}
                                onClick={() => { if (w) { handleDaySelect(dateISO); setMesoExpanded(false); } }}
                                className={`flex flex-col items-center gap-0.5 ${!w ? 'opacity-20 cursor-default' : 'hover:opacity-100 cursor-pointer'}`}>
                                <div className="w-7 h-7 rounded-full flex items-center justify-center transition-all"
                                  style={{
                                    backgroundColor: w ? (r ? '#27272a' : `${s!.color}${w.is_completed ? '45' : '22'}`) : 'transparent',
                                    boxShadow: isSel ? `0 0 0 2px #fff, 0 0 0 3.5px ${s?.color ?? '#a3e635'}80` : 'none',
                                  }}>
                                  {w?.is_completed && !r && s && (
                                    <svg viewBox="0 0 10 8" className="w-2.5 h-2.5" fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M1 4l2.5 2.5L9 1" />
                                    </svg>
                                  )}
                                  {w && !w.is_completed && !r && s && (
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color, opacity: 0.85 }} />
                                  )}
                                </div>
                                <span className="text-[8px] text-zinc-600 font-bold">{DAY_LETTERS[i]}</span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="w-14 text-right flex-shrink-0">
                          {km > 0 && <p className="text-xs font-mono font-bold text-zinc-500">{km % 1 === 0 ? km : km.toFixed(1)} km</p>}
                          {allDone && train.length > 0
                            ? <p className="text-[10px] text-green-500 font-black">✓ Lista</p>
                            : train.length > 0
                            ? <p className="text-[10px] text-zinc-700">{done.length}/{train.length}</p>
                            : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ══════════ WEEK STRIP — sticky ══════════ */}
          <div
            className="sticky top-14 z-20 border-b border-zinc-800/70"
            style={{ background: 'rgba(9,9,11,0.96)', backdropFilter: 'blur(16px)' }}
            onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}
          >
            <div className="max-w-2xl mx-auto px-2 sm:px-5">
              {/* Week header */}
              <div className="flex items-center justify-between pt-2.5 pb-1 px-1">
                <button onClick={() => canGoPrev && setDisplayedWeekMonday(p => addDays(p, -7))} disabled={!canGoPrev}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-20 disabled:cursor-not-allowed transition-all">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" /></svg>
                </button>
                <div className="flex items-center gap-2.5">
                  {displayedWeekIdx >= 0 && (
                    <span className="text-xs font-black text-zinc-300 uppercase tracking-wide">
                      Semana {displayedWeekIdx + 1}<span className="text-zinc-600 font-normal">/{weeks.length}</span>
                    </span>
                  )}
                  <span className="text-[11px] text-zinc-600 hidden sm:block">{weeks[displayedWeekIdx]?.range}</span>
                  {!isCurrentWeekShown && (
                    <button onClick={goToToday}
                      className="text-[10px] font-bold text-lime-400 bg-lime-400/10 hover:bg-lime-400/20 px-2.5 py-0.5 rounded-full border border-lime-400/20 transition-colors">
                      Hoy
                    </button>
                  )}
                </div>
                <button onClick={() => canGoNext && setDisplayedWeekMonday(p => addDays(p, 7))} disabled={!canGoNext}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-20 disabled:cursor-not-allowed transition-all">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>

              {/* Day circles */}
              <div className="grid grid-cols-7 pb-3 gap-0">
                {weekDays.map((dateISO, idx) => {
                  const w   = plan.workouts.find(x => x.workout_date === dateISO);
                  const t   = w ? getWorkoutType(w) : null;
                  const s   = t ? (TYPE_STYLES[t] ?? TYPE_STYLES.suave) : null;
                  const sel = dateISO === selectedDate;
                  const tod = dateISO === todayISO;
                  const rst = t === 'descanso';
                  const pst = dateISO < todayISO;
                  const day = new Date(dateISO + 'T00:00:00Z').getUTCDate();
                  const met = w && !rst ? (w.distance_km ? `${w.distance_km}k` : w.duration_min ? `${w.duration_min}'` : '') : '';
                  return (
                    <button key={dateISO} onClick={() => w && setSelectedDate(dateISO)} disabled={!w}
                      className={`flex flex-col items-center gap-1 py-1.5 rounded-xl transition-all select-none
                        ${sel ? 'bg-white/5' : w ? 'hover:bg-white/[0.03]' : 'opacity-25 cursor-default'}`}>
                      <span className={`text-[10px] font-bold uppercase tracking-wider leading-none ${tod ? 'text-lime-400' : sel ? 'text-zinc-300' : 'text-zinc-600'}`}>
                        {DAY_LETTERS[idx]}
                      </span>
                      <div className="relative w-10 h-10 rounded-full flex items-center justify-center transition-all"
                        style={{
                          backgroundColor: w
                            ? rst ? (sel ? '#3f3f46' : '#27272a') : `${s!.color}${sel ? '35' : pst && w.is_completed ? '20' : '18'}`
                            : 'transparent',
                          boxShadow: sel && !rst && s ? `0 0 0 2px ${s.color}70, 0 0 16px ${s.color}25`
                            : tod && !sel ? '0 0 0 1.5px #a3e635' : 'none',
                        }}>
                        <span className={`text-[13px] font-black leading-none ${
                          sel && !rst && s ? s.text : sel ? 'text-zinc-400' : tod ? 'text-lime-400' : s ? `${s.text} opacity-70` : 'text-zinc-600'
                        }`}>{day}</span>
                        {w?.is_completed && !rst && (
                          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: '#16a34a', border: '1.5px solid #09090b' }}>
                            <svg viewBox="0 0 10 8" className="w-2.5 h-2.5" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4l2.5 2.5L9 1" /></svg>
                          </div>
                        )}
                      </div>
                      <span className={`text-[9px] font-mono font-semibold h-3 leading-3 ${sel ? 'text-zinc-300' : 'text-zinc-600'}`}>{met}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ══════════ WORKOUT DETAIL CARD ══════════ */}
          <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-5">
            {selectedWorkout ? (() => {
              const type   = getWorkoutType(selectedWorkout);
              const st     = TYPE_STYLES[type] ?? TYPE_STYLES.suave;
              const isRest = type === 'descanso';
              const isPast = selectedDate <= todayISO;
              const isToday = selectedDate === todayISO;
              const exp    = selectedWorkout.explanation_json || {};
              const isStr  = exp.type === 'fuerza' || /fuerza/i.test(selectedWorkout.description || '');
              const exercises = isStr
                ? (Array.isArray(exp.exercises) && exp.exercises.length > 0 ? exp.exercises : parseExercises(exp.details || ''))
                : [];

              return (
                <div key={selectedDate} ref={workoutCardRef}>
                  {/* Date header */}
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest capitalize">
                      {formatDateFull(selectedDate)}
                      {isToday && <span className="ml-2 font-black text-lime-400"> · Hoy</span>}
                    </p>
                  </div>

                  {/* ── Main card ── */}
                  <div className="rounded-2xl overflow-hidden"
                    style={{ border: `1px solid ${isRest ? '#27272a' : st.color + '28'}`, background: '#111113' }}>

                    {/* Type banner */}
                    <div className="px-5 pt-5 pb-4"
                      style={{ background: isRest ? 'linear-gradient(145deg,#18181b,#111113)' : `linear-gradient(145deg,${st.color}15 0%,${st.color}07 55%,transparent 100%)` }}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3.5">
                          <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: `${st.color}12`, border: `1.5px solid ${st.color}30` }}>
                            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: st.color, boxShadow: `0 0 8px ${st.color}50` }} />
                          </div>
                          <div>
                            <p className="text-xl font-black uppercase tracking-wide leading-none mb-2" style={{ color: isRest ? '#52525b' : st.color }}>
                              {st.label}
                            </p>
                            {!isRest && (selectedWorkout.distance_km || selectedWorkout.duration_min || selectedWorkout.elevation_gain_m) && (
                              <div className="flex items-baseline gap-4">
                                {selectedWorkout.distance_km && (
                                  <span className="flex items-baseline gap-1">
                                    <span className="text-2xl font-black text-zinc-100 tabular-nums leading-none">{selectedWorkout.distance_km}</span>
                                    <span className="text-xs text-zinc-500 font-medium">km</span>
                                  </span>
                                )}
                                {selectedWorkout.duration_min && (
                                  <span className="flex items-baseline gap-1">
                                    <span className="text-2xl font-black text-zinc-100 tabular-nums leading-none">{selectedWorkout.duration_min}</span>
                                    <span className="text-xs text-zinc-500 font-medium">min</span>
                                  </span>
                                )}
                                {selectedWorkout.elevation_gain_m && (
                                  <span className="flex items-baseline gap-1">
                                    <span className="text-2xl font-black text-zinc-100 tabular-nums leading-none">{selectedWorkout.elevation_gain_m}</span>
                                    <span className="text-xs text-zinc-500 font-medium">D+</span>
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        {!isRest && isPast && (
                          <button onClick={() => handleToggleComplete(selectedWorkout.id, selectedWorkout.is_completed)}
                            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                              selectedWorkout.is_completed
                                ? 'bg-green-500/15 text-green-400 border-green-500/30 hover:bg-green-500/25'
                                : 'bg-zinc-800/80 text-zinc-400 border-zinc-700 hover:text-lime-400 hover:border-lime-400/50'
                            }`}>
                            {selectedWorkout.is_completed ? (
                              <><svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>Hecho</>
                            ) : 'Completar'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Description */}
                    <div className="px-5 py-4 border-t border-zinc-800/50">
                      <p className={`text-sm leading-relaxed font-medium ${selectedWorkout.is_completed ? 'line-through text-zinc-600' : 'text-zinc-200'}`}>
                        {selectedWorkout.description}
                      </p>
                      {isRest && (
                        <p className="text-xs text-zinc-600 mt-2 italic">Recupera, estira y descansa — es parte del entrenamiento.</p>
                      )}
                    </div>

                    {/* Expand / collapse toggle */}
                    <button
                      onClick={() => setCardExpanded(p => !p)}
                      className="w-full flex items-center justify-between px-5 py-3 border-t border-zinc-800/50 text-xs font-bold text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02] transition-all"
                    >
                      <span>{cardExpanded ? 'Ocultar detalles' : 'Ver entrenamiento completo'}</span>
                      <svg className={`w-4 h-4 transition-transform duration-300 ${cardExpanded ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                        <path d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* ── EXPANDED CONTENT ── */}
                    <div style={{ maxHeight: cardExpanded ? '2400px' : '0', overflow: 'hidden', transition: 'max-height 0.45s cubic-bezier(0.4,0,0.2,1)' }}>

                      {/* ─ Plan de sesión ─ */}
                      {(exp.phase || exp.purpose || exp.details || exp.intensity || exercises.length > 0) && (
                        <div className="px-5 py-5 border-t border-zinc-800/50">
                          <SectionLabel color={st.color}>Plan de sesión</SectionLabel>

                          {/* Badges */}
                          {(exp.phase || exp.type) && (
                            <div className="flex flex-wrap gap-2 mb-4">
                              {exp.phase && (
                                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${PHASE_STYLES[exp.phase] ?? 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
                                  {PHASE_LABELS[exp.phase] ?? exp.phase}
                                </span>
                              )}
                              {exp.type && (
                                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full border border-zinc-700 bg-zinc-800 text-zinc-400 capitalize">
                                  {exp.type}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Purpose */}
                          {exp.purpose && (
                            <div className="mb-4 pl-4 border-l-2 rounded-r-lg py-2 pr-3"
                              style={{ borderColor: `${st.color}60`, backgroundColor: `${st.color}06` }}>
                              <p className="text-xs font-black uppercase tracking-wide mb-1.5" style={{ color: `${st.color}90` }}>Objetivo de la sesión</p>
                              <p className="text-sm text-zinc-300 leading-relaxed">{exp.purpose}</p>
                            </div>
                          )}

                          {/* Strength exercises */}
                          {isStr && exercises.length > 0 && (
                            <div className="mb-4">
                              <p className="text-xs font-black uppercase tracking-wide text-purple-400 mb-3">Ejercicios</p>
                              <div className="space-y-2">
                                {exercises.map((ex: any, i: number) => (
                                  <div key={i} className="flex items-center gap-3 bg-zinc-800/60 border border-zinc-700/60 rounded-xl px-3.5 py-3">
                                    {ex.sets && ex.reps ? (
                                      <div className="flex-shrink-0 min-w-[52px] text-center bg-purple-900/50 border border-purple-700/50 rounded-lg px-2 py-1.5">
                                        <div className="text-sm font-black text-purple-200 leading-none">{ex.sets}×{ex.reps}</div>
                                        <div className="text-[8px] text-purple-500 mt-0.5 uppercase tracking-wide">series</div>
                                      </div>
                                    ) : (
                                      <div className="w-1.5 h-1.5 rounded-full bg-purple-500 flex-shrink-0 ml-1.5" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <span className="text-sm text-zinc-100 font-semibold leading-snug">{ex.name}</span>
                                      {ex.notes && <p className="text-[11px] text-zinc-500 mt-0.5 leading-snug">{ex.notes}</p>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Execution details */}
                          {exp.details && (
                            <div className="mb-4 rounded-xl p-4" style={{ backgroundColor: isStr ? '#1c1c1f' : `${st.color}08`, border: `1px solid ${isStr ? '#27272a' : st.color + '20'}` }}>
                              <p className="text-[10px] font-black uppercase tracking-widest mb-2.5" style={{ color: isStr ? '#71717a' : `${st.color}90` }}>
                                {isStr ? 'Instrucciones' : 'Cómo ejecutarlo'}
                              </p>
                              <p className="text-sm text-zinc-300 whitespace-pre-line leading-relaxed">{exp.details}</p>
                            </div>
                          )}

                          {/* Zone / pace */}
                          {exp.intensity && (
                            <div className="flex items-center gap-3 bg-zinc-800/40 border border-zinc-700/50 rounded-xl px-4 py-3">
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: st.color }} />
                              <div>
                                <span className="text-[10px] font-black uppercase tracking-wide text-zinc-500 block mb-0.5">Zona / Ritmo objetivo</span>
                                <span className="text-sm font-bold text-zinc-200 font-mono">{exp.intensity}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* ─ Strava data ─ */}
                      {isPast && (
                        <div className="px-5 py-5 border-t border-zinc-800/50">
                          <div className="flex items-center justify-between mb-4">
                            <SectionLabel color="#FC5200">Actividad registrada</SectionLabel>
                            <img src={pwrdByStrava} alt="Strava" className="h-3.5 w-auto opacity-70 -mt-4" />
                          </div>

                          {loadingStrava && (
                            <div className="flex items-center gap-2 text-zinc-600 text-xs py-2">
                              <div className="w-3.5 h-3.5 border-2 border-zinc-600 border-t-transparent rounded-full animate-spin" />
                              Cargando datos de Strava…
                            </div>
                          )}

                          {!loadingStrava && stravaActs.length > 0 && stravaActs.map((a, i) => (
                            <div key={i} className="rounded-xl overflow-hidden border border-zinc-800/60 mb-3 last:mb-0">
                              {/* Activity header */}
                              <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'rgba(252,82,0,0.06)', borderBottom: '1px solid rgba(252,82,0,0.15)' }}>
                                <div>
                                  <p className="text-sm font-bold text-zinc-200">{a.name || 'Actividad'}</p>
                                  {a.sport_type && <p className="text-[11px] text-zinc-500 capitalize">{a.sport_type}</p>}
                                </div>
                                {a.activity_id && (
                                  <a href={`https://www.strava.com/activities/${a.activity_id}`}
                                    target="_blank" rel="noopener noreferrer"
                                    className="text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all"
                                    style={{ color: '#FC5200', border: '1px solid rgba(252,82,0,0.3)', backgroundColor: 'rgba(252,82,0,0.08)' }}>
                                    Ver en Strava
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                  </a>
                                )}
                              </div>
                              {/* Primary stats */}
                              <div className="grid grid-cols-3 gap-0 divide-x divide-zinc-800/60">
                                {[
                                  { label: 'Distancia', value: `${Math.round((a.distance_m || 0) / 100) / 10}`, unit: 'km' },
                                  { label: 'Duración',  value: formatDuration(a.moving_time || 0), unit: '' },
                                  { label: 'Ritmo',     value: formatPace(a.moving_time || 0, a.distance_m || 0), unit: '' },
                                ].map(s => (
                                  <div key={s.label} className="flex flex-col items-center justify-center py-4 bg-zinc-900/30">
                                    <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500 mb-1">{s.label}</span>
                                    <span className="text-xl font-black text-zinc-100 tabular-nums leading-none">{s.value}</span>
                                    {s.unit && <span className="text-[10px] text-zinc-600 mt-0.5">{s.unit}</span>}
                                  </div>
                                ))}
                              </div>
                              {/* Secondary stats */}
                              {(a.average_heartrate || a.max_heartrate || (a.total_elevation_gain ?? 0) > 1 || a.average_cadence || a.suffer_score || (a.pr_count ?? 0) > 0) && (
                                <div className="px-4 py-3 flex flex-wrap gap-2 border-t border-zinc-800/40 bg-zinc-900/20">
                                  {a.average_heartrate != null && (
                                    <StatBox label="FC media" value={`${Math.round(a.average_heartrate)}`} sub="ppm" />
                                  )}
                                  {a.max_heartrate != null && (
                                    <StatBox label="FC máx" value={`${Math.round(a.max_heartrate)}`} sub="ppm" />
                                  )}
                                  {(a.total_elevation_gain ?? 0) > 1 && (
                                    <StatBox label="Desnivel+" value={`${Math.round(a.total_elevation_gain!)}`} sub="m" />
                                  )}
                                  {a.average_cadence != null && (
                                    <StatBox label="Cadencia" value={`${Math.round(a.average_cadence * 2)}`} sub="spm" />
                                  )}
                                  {a.suffer_score != null && (
                                    <StatBox label="Sufrimiento" value={String(a.suffer_score)} />
                                  )}
                                  {(a.pr_count ?? 0) > 0 && (
                                    <StatBox label="Récords" value={`${a.pr_count} PR`} />
                                  )}
                                </div>
                              )}
                            </div>
                          ))}

                          {!loadingStrava && stravaActs.length === 0 && (
                            <p className="text-xs text-zinc-600 italic py-1">Sin actividad Strava para este día.</p>
                          )}
                        </div>
                      )}

                      {/* ─ Log de sensaciones ─ */}
                      {isPast && (
                        <div className="px-5 py-5 border-t border-zinc-800/50">
                          <SectionLabel color="#a3e635">
                            {isRest ? 'Registro del día' : '¿Cómo fue el entreno?'}
                          </SectionLabel>

                          <div className="space-y-5">
                            {/* Sleep — shown for all days */}
                            <div>
                              <p className="text-xs font-semibold text-zinc-500 mb-2.5">
                                Sueño previo
                                {logSleep != null && (
                                  <span className="ml-2 text-zinc-400">{SLEEP_OPTIONS.find(o => o.value === logSleep)?.emoji} {SLEEP_OPTIONS.find(o => o.value === logSleep)?.label}</span>
                                )}
                              </p>
                              <div className="flex gap-2 flex-wrap">
                                {SLEEP_OPTIONS.map(opt => (
                                  <button key={opt.value} onClick={() => setLogSleep(logSleep === opt.value ? null : opt.value)}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border transition-all ${logSleep === opt.value ? opt.active : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700'}`}>
                                    <span>{opt.emoji}</span><span>{opt.label}</span>
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Training-day fields */}
                            {!isRest && (
                              <>
                                {/* Feeling */}
                                <div>
                                  <p className="text-xs font-semibold text-zinc-500 mb-2.5">Sensación general</p>
                                  <div className="flex gap-2 flex-wrap">
                                    {FEELING_OPTIONS.map(opt => (
                                      <button key={opt.value} onClick={() => setLogFeeling(logFeeling === opt.value ? '' : opt.value)}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border transition-all ${logFeeling === opt.value ? opt.active : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700'}`}>
                                        <span>{opt.emoji}</span><span>{opt.label}</span>
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                {/* RPE */}
                                <div>
                                  <p className="text-xs font-semibold text-zinc-500 mb-2.5">
                                    Esfuerzo percibido (RPE)
                                    {logRpe > 0 && (
                                      <span className="ml-2 font-black text-zinc-300">{logRpe}/10 · {RPE_LABELS[logRpe]}</span>
                                    )}
                                  </p>
                                  <div className="flex gap-1.5">
                                    {[1,2,3,4,5,6,7,8,9,10].map(n => (
                                      <button key={n} onClick={() => setLogRpe(logRpe === n ? 0 : n)}
                                        className="flex-1 h-10 rounded-xl text-xs font-black transition-all"
                                        style={{
                                          backgroundColor: logRpe >= n ? getRpeColor(n) : 'rgba(39,39,42,0.8)',
                                          color: logRpe >= n ? '#fff' : '#52525b',
                                          boxShadow: logRpe === n ? `0 0 0 2px ${getRpeColor(n)}60, 0 0 12px ${getRpeColor(n)}30` : 'none',
                                          transform: logRpe === n ? 'scale(1.1)' : 'scale(1)',
                                        }}>
                                        {n}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                {/* Freshness */}
                                <div>
                                  <p className="text-xs font-semibold text-zinc-500 mb-2.5">¿Cómo llegaste al entreno?</p>
                                  <div className="flex gap-2 flex-wrap">
                                    {FRESHNESS_OPTIONS.map(opt => (
                                      <button key={opt.value} onClick={() => setLogFreshness(logFreshness === opt.value ? '' : opt.value)}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border transition-all ${logFreshness === opt.value ? opt.active : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700'}`}>
                                        <span>{opt.emoji}</span><span>{opt.label}</span>
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                {/* Notes */}
                                <div>
                                  <p className="text-xs font-semibold text-zinc-500 mb-2.5">Notas libres</p>
                                  <textarea
                                    value={logNotes}
                                    onChange={e => setLogNotes(e.target.value)}
                                    rows={3}
                                    placeholder="Sensaciones, observaciones, lo que quieras recordar…"
                                    className="w-full text-sm p-3.5 border border-zinc-700/60 rounded-xl bg-zinc-900/60 text-zinc-100 placeholder-zinc-600 focus:ring-1 focus:ring-lime-400 focus:border-lime-400 focus:outline-none resize-none transition-colors"
                                  />
                                </div>
                              </>
                            )}

                            {/* Save button */}
                            <button
                              onClick={handleSaveLog}
                              disabled={saving}
                              className={`w-full py-3.5 rounded-xl text-sm font-black transition-all ${
                                saved
                                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                  : 'text-black hover:brightness-105 active:scale-[0.98]'
                              } disabled:opacity-50`}
                              style={!saved ? { background: 'linear-gradient(135deg, #84cc16, #a3e635)' } : {}}
                            >
                              {saving ? (
                                <span className="flex items-center justify-center gap-2">
                                  <div className="w-4 h-4 border-2 border-black/30 border-t-transparent rounded-full animate-spin" />
                                  Guardando…
                                </span>
                              ) : saved ? (
                                <span className="flex items-center justify-center gap-2">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                                  ¡Guardado!
                                </span>
                              ) : isRest ? 'Guardar registro' : 'Guardar sensaciones'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Future workout — mark complete CTA */}
                      {!isPast && !isRest && (
                        <div className="px-5 py-5 border-t border-zinc-800/50">
                          <p className="text-xs text-zinc-600 text-center italic">Este entrenamiento está programado para el futuro.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })() : (
              <div className="text-center py-14">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                  style={{ background: '#18181b', border: '1px solid #27272a' }}>
                  <svg className="w-6 h-6 text-zinc-600" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                </div>
                <p className="text-sm font-semibold text-zinc-500">Selecciona un día del plan</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════ EMPTY STATES ══════════ */}
      {!loadingPlan && !plan && races.length > 0 && (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-center">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center" style={{ background: '#18181b', border: '1px solid #27272a' }}>
            <svg className="w-7 h-7 text-zinc-600" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
          </div>
          <h2 className="text-lg font-bold text-zinc-200 mb-2">Sin plan de entrenamiento</h2>
          <p className="text-sm text-zinc-600 mb-6 max-w-xs mx-auto">Crea un plan personalizado con IA para alcanzar tu objetivo.</p>
          {selectedRace && (
            <button onClick={() => setShowPlanModal(true)}
              className="inline-flex items-center gap-2 px-6 py-3 text-black text-sm font-black rounded-xl hover:brightness-105 transition-all"
              style={{ background: 'linear-gradient(135deg,#84cc16,#a3e635)' }}>
              Crear plan de entrenamiento
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
          )}
        </div>
      )}

      {!loadingPlan && races.length === 0 && (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-center">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center" style={{ background: '#18181b', border: '1px solid #27272a' }}>
            <svg className="w-7 h-7 text-zinc-600" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
            </svg>
          </div>
          <h2 className="text-lg font-bold text-zinc-200 mb-2">Añade tu primer objetivo</h2>
          <p className="text-sm text-zinc-600 mb-6 max-w-xs mx-auto">Añade una carrera o evento y crea tu plan personalizado.</p>
          <button onClick={() => setShowAddGoal(true)}
            className="inline-flex items-center gap-2 px-6 py-3 text-black text-sm font-black rounded-xl hover:brightness-105 transition-all"
            style={{ background: 'linear-gradient(135deg,#84cc16,#a3e635)' }}>
            Añadir objetivo
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </div>
      )}

      {/* ══════════ MODALS ══════════ */}
      <AddGoalModal open={showAddGoal} onClose={() => setShowAddGoal(false)}
        onGoalAdded={race => { setRaces(p => [...p, race].sort((a, b) => a.date.localeCompare(b.date))); if (!selectedRace) setSelectedRace(race.id); }} />
      <PlanManagerModal open={showPlanModal} onClose={() => setShowPlanModal(false)}
        raceId={selectedRace} race={selectedRaceDetails ?? null} onPlanChanged={() => fetchPlan()} />
    </main>
  );
};

export default CalendarPage;
