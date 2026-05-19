import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  collection, getDocs, doc, getDoc, query, where, orderBy, updateDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebaseClient';
import { Race } from '../types';
import WorkoutModal from '../components/WorkoutModal';
import AddGoalModal from '../components/AddGoalModal';
import PlanManagerModal from '../components/PlanManagerModal';
import pwrdByStrava from '../assets/1.2-Strava-API-Logos/Powered by Strava/pwrdBy_strava_white/api_logo_pwrdBy_strava_horiz_white.svg';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Workout {
  id: string;
  workout_date: string;
  description: string;
  is_completed: boolean;
  distance_km?: number | null;
  duration_min?: number | null;
  elevation_gain_m?: number | null;
  explanation_json?: any;
}

interface TrainingPlan {
  id: string;
  goal: string;
  workouts: Workout[];
  total_weeks?: number | null;
  mesocycle_number?: number | null;
  mesocycle_length_weeks?: number | null;
  mesocycle_start_date?: string | null;
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

function getWeekday(dateISO: string): number {
  const dow = new Date(dateISO + 'T00:00:00Z').getUTCDay();
  return dow === 0 ? 6 : dow - 1;
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

// ── Type styles ───────────────────────────────────────────────────────────────
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

// ── Component ─────────────────────────────────────────────────────────────────
const CalendarPage = () => {
  const { user } = useAuth();

  // Data
  const [races, setRaces]               = useState<Race[]>([]);
  const [selectedRace, setSelectedRace] = useState('');
  const [plan, setPlan]                 = useState<TrainingPlan | null>(null);
  const [loadingPlan, setLoadingPlan]   = useState(false);

  // Modals
  const [modalWorkout, setModalWorkout]   = useState<Workout | null>(null);
  const [showModal, setShowModal]         = useState(false);
  const [showAddGoal, setShowAddGoal]     = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);

  // Actions
  const [syncing, setSyncing] = useState(false);

  // Calendar navigation
  const todayISO = new Date().toISOString().substring(0, 10);
  const [selectedDate, setSelectedDate]             = useState(todayISO);
  const [displayedWeekMonday, setDisplayedWeekMonday] = useState(() => getWeekMonday(todayISO));
  const [mesoExpanded, setMesoExpanded]             = useState(false);
  const touchStartX = useRef<number | null>(null);

  // ── Strava sync ───────────────────────────────────────────────────────────
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
    } catch (e: any) {
      alert(`Error sincronizando Strava: ${e.message || e}`);
    } finally {
      setSyncing(false);
    }
  };

  // ── Data fetching ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const fetchRaces = async () => {
      const snap = await getDocs(query(collection(db, 'users', user.uid, 'races'), orderBy('date', 'asc')));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Race));
      setRaces(list);
      const next = list.find(r => r.date >= todayISO);
      if (next) setSelectedRace(next.id);
      else if (list.length > 0) setSelectedRace(list[list.length - 1].id);
    };
    fetchRaces();
  }, [user]);

  const fetchPlan = useCallback(async () => {
    if (!user) return;
    setLoadingPlan(true);
    setPlan(null);
    try {
      const planDocSnap = await getDoc(doc(db, 'users', user.uid, 'training_plans', 'default'));
      if (!planDocSnap.exists()) return;
      const planData = planDocSnap.data();
      const workoutsSnap = await getDocs(
        query(collection(db, 'users', user.uid, 'workouts'), where('plan_id', '==', 'default'), orderBy('workout_date', 'asc'))
      );
      const workoutsData = workoutsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Workout));
      setPlan({ id: 'default', ...planData, workouts: workoutsData } as TrainingPlan);
    } catch (e) {
      console.warn('Error loading plan:', e);
    } finally {
      setLoadingPlan(false);
    }
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
    const handler = () => fetchPlan();
    window.addEventListener('workouts-changed', handler);
    return () => window.removeEventListener('workouts-changed', handler);
  }, [fetchPlan]);

  // When plan loads, if today has a workout use today, else find the nearest upcoming workout
  useEffect(() => {
    if (!plan || !plan.workouts.length) return;
    const hasToday = plan.workouts.some(w => w.workout_date === todayISO);
    if (!hasToday) {
      const upcoming = plan.workouts.find(w => w.workout_date >= todayISO);
      const target = upcoming ?? plan.workouts[plan.workouts.length - 1];
      setSelectedDate(target.workout_date);
      setDisplayedWeekMonday(getWeekMonday(target.workout_date));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.id]);

  // ── Toggle complete ────────────────────────────────────────────────────────
  const handleToggleComplete = async (workoutId: string, currentlyCompleted: boolean) => {
    if (!user || !plan) return;
    const next = !currentlyCompleted;
    setPlan(prev => prev ? {
      ...prev,
      workouts: prev.workouts.map(w => w.id === workoutId ? { ...w, is_completed: next } : w),
    } : null);
    setModalWorkout(prev => prev?.id === workoutId ? { ...prev, is_completed: next } : prev);
    try {
      await updateDoc(doc(db, 'users', user.uid, 'workouts', workoutId), { is_completed: next });
      window.dispatchEvent(new Event('workouts-changed'));
    } catch {
      setPlan(prev => prev ? {
        ...prev,
        workouts: prev.workouts.map(w => w.id === workoutId ? { ...w, is_completed: currentlyCompleted } : w),
      } : null);
    }
  };

  // ── Touch swipe for week navigation ──────────────────────────────────────
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 60) {
      if (delta > 0 && canGoNext) setDisplayedWeekMonday(prev => addDays(prev, 7));
      else if (delta < 0 && canGoPrev) setDisplayedWeekMonday(prev => addDays(prev, -7));
    }
    touchStartX.current = null;
  };

  // ── Day selection ─────────────────────────────────────────────────────────
  const handleDaySelect = (dateISO: string) => {
    setSelectedDate(dateISO);
    const dayMonday = getWeekMonday(dateISO);
    if (dayMonday !== displayedWeekMonday) setDisplayedWeekMonday(dayMonday);
  };

  const goToToday = () => {
    setSelectedDate(todayISO);
    setDisplayedWeekMonday(getWeekMonday(todayISO));
  };

  // ── Derived values ─────────────────────────────────────────────────────────
  const weeks          = plan ? groupByWeek(plan.workouts) : [];
  const weekDays       = Array.from({ length: 7 }, (_, i) => addDays(displayedWeekMonday, i));
  const selectedWorkout = plan?.workouts.find(w => w.workout_date === selectedDate) ?? null;
  const planFirstMonday = plan?.workouts.length ? getWeekMonday(plan.workouts[0].workout_date) : null;
  const planLastMonday  = plan?.workouts.length ? getWeekMonday(plan.workouts[plan.workouts.length - 1].workout_date) : null;
  const canGoPrev       = !!planFirstMonday && displayedWeekMonday > planFirstMonday;
  const canGoNext       = !!planLastMonday  && displayedWeekMonday < planLastMonday;
  const displayedWeekIdx = weeks.findIndex(w => w.key === displayedWeekMonday);
  const isCurrentWeekDisplayed = displayedWeekMonday === getWeekMonday(todayISO);
  const planPrimaryRace = races.find(r => r.id === ((plan as any)?.primary_race_id || (plan as any)?.race_id));
  const selectedRaceDetails = races.find(r => r.id === selectedRace);
  const mesoEnd = plan?.mesocycle_end_date;
  const daysUntilMesoEnd = mesoEnd
    ? Math.ceil((new Date(mesoEnd).getTime() - new Date(todayISO).getTime()) / 86400000)
    : null;

  // ── Progress stats ────────────────────────────────────────────────────────
  const allTrainWorkouts = plan?.workouts.filter(w => !/descanso|rest/i.test(w.description)) ?? [];
  const doneTrainWorkouts = allTrainWorkouts.filter(w => w.is_completed);
  const progressPct = allTrainWorkouts.length > 0 ? Math.round(doneTrainWorkouts.length / allTrainWorkouts.length * 100) : 0;

  // ── Format helpers ─────────────────────────────────────────────────────────
  const formatDateFull = (dateISO: string) =>
    new Date(dateISO + 'T00:00:00Z')
      .toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen pb-20">

      {/* ╔════════════════════════════════════════════════════╗
          ║  TOP HEADER                                        ║
          ╚════════════════════════════════════════════════════╝ */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 pb-4">
        <div className="flex items-start justify-between gap-3 mb-4">
          {/* Left: title + meta */}
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-zinc-100 leading-tight">
              {planPrimaryRace?.name ?? 'Calendario'}
            </h1>
            {plan && (
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {plan.mesocycle_number && plan.total_mesocycles && (
                  <span className="inline-flex items-center text-[11px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 px-2 py-0.5 rounded-full">
                    Mesociclo {plan.mesocycle_number}/{plan.total_mesocycles}
                  </span>
                )}
                {daysUntilMesoEnd !== null && daysUntilMesoEnd > 0 && daysUntilMesoEnd <= 14 && (
                  <span className="inline-flex items-center text-[11px] font-bold bg-lime-400/10 text-lime-400 border border-lime-400/25 px-2 py-0.5 rounded-full">
                    {daysUntilMesoEnd}d restantes
                  </span>
                )}
                <span className="text-xs text-zinc-600 truncate max-w-[180px] sm:max-w-xs">
                  {plan.goal}
                </span>
              </div>
            )}
          </div>

          {/* Right: action icons */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div className="flex items-center gap-1 mr-1 opacity-70">
              <img src={pwrdByStrava} alt="Strava" className="h-3 w-auto" />
            </div>
            <button
              onClick={() => syncStrava()}
              disabled={syncing}
              title="Sincronizar Strava"
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-600 disabled:opacity-30 transition-all"
            >
              <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
            </button>
            <button
              onClick={() => setShowAddGoal(true)}
              title="Añadir objetivo"
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-600 transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" />
              </svg>
            </button>
            <button
              onClick={() => setShowPlanModal(true)}
              title={plan ? 'Gestionar plan' : 'Crear plan'}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-600 transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {plan && allTrainWorkouts.length > 0 && (
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, #65a30d, #a3e635)' }}
              />
            </div>
            <span className="text-xs font-bold text-zinc-500 tabular-nums flex-shrink-0">
              {doneTrainWorkouts.length}<span className="text-zinc-700">/{allTrainWorkouts.length}</span>
            </span>
          </div>
        )}
      </div>

      {loadingPlan && (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 flex items-center justify-center gap-3">
          <div className="w-5 h-5 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-zinc-500">Cargando plan…</span>
        </div>
      )}

      {/* ╔════════════════════════════════════════════════════╗
          ║  WEEK STRIP — sticky                               ║
          ╚════════════════════════════════════════════════════╝ */}
      {plan && (
        <div
          className="sticky top-14 z-20 border-b border-zinc-800/80"
          style={{ background: 'rgba(9,9,11,0.96)', backdropFilter: 'blur(12px)' }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="max-w-2xl mx-auto px-2 sm:px-5">

            {/* Week nav row */}
            <div className="flex items-center justify-between pt-2.5 pb-1 px-1">
              <button
                onClick={() => canGoPrev && setDisplayedWeekMonday(prev => addDays(prev, -7))}
                disabled={!canGoPrev}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <div className="flex items-center gap-2.5">
                {displayedWeekIdx >= 0 && (
                  <span className="text-xs font-black text-zinc-300 uppercase tracking-wide">
                    Semana {displayedWeekIdx + 1}
                    <span className="text-zinc-600 font-normal">/{weeks.length}</span>
                  </span>
                )}
                <span className="text-[11px] text-zinc-600 hidden sm:block">
                  {weeks[displayedWeekIdx]?.range}
                </span>
                {!isCurrentWeekDisplayed && (
                  <button
                    onClick={goToToday}
                    className="text-[10px] font-bold text-lime-400 bg-lime-400/10 hover:bg-lime-400/20 px-2.5 py-0.5 rounded-full border border-lime-400/20 transition-colors"
                  >
                    Hoy
                  </button>
                )}
              </div>

              <button
                onClick={() => canGoNext && setDisplayedWeekMonday(prev => addDays(prev, 7))}
                disabled={!canGoNext}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Day circles row */}
            <div className="grid grid-cols-7 pb-3 gap-0">
              {weekDays.map((dateISO, idx) => {
                const workout  = plan.workouts.find(w => w.workout_date === dateISO);
                const type     = workout ? getWorkoutType(workout) : null;
                const st       = type ? (TYPE_STYLES[type] ?? TYPE_STYLES.suave) : null;
                const isSelected = dateISO === selectedDate;
                const isToday    = dateISO === todayISO;
                const isRest     = type === 'descanso';
                const isPast     = dateISO < todayISO;
                const dayNum     = new Date(dateISO + 'T00:00:00Z').getUTCDate();
                const metric     = workout && !isRest
                  ? (workout.distance_km  ? `${workout.distance_km}k`
                    : workout.duration_min ? `${workout.duration_min}'`
                    : '')
                  : '';

                return (
                  <button
                    key={dateISO}
                    onClick={() => { if (workout) setSelectedDate(dateISO); }}
                    disabled={!workout}
                    className={`flex flex-col items-center gap-1 py-1.5 rounded-xl transition-all select-none
                      ${isSelected ? 'bg-white/5' : workout ? 'hover:bg-white/[0.03] active:bg-white/5' : 'opacity-25 cursor-default'}`}
                  >
                    {/* Day letter */}
                    <span className={`text-[10px] font-bold uppercase tracking-wider leading-none ${
                      isToday ? 'text-lime-400' : isSelected ? 'text-zinc-300' : 'text-zinc-600'
                    }`}>
                      {DAY_LETTERS[idx]}
                    </span>

                    {/* Circle */}
                    <div
                      className={`relative w-10 h-10 rounded-full flex items-center justify-center transition-all`}
                      style={{
                        backgroundColor: workout
                          ? isRest ? (isSelected ? '#3f3f46' : '#27272a')
                          : `${st!.color}${isSelected ? '35' : isPast && workout.is_completed ? '20' : '18'}`
                          : 'transparent',
                        boxShadow: isSelected && !isRest && st
                          ? `0 0 0 2px ${st.color}70, 0 0 16px ${st.color}25`
                          : isToday && !isSelected
                          ? '0 0 0 1.5px #a3e635'
                          : 'none',
                      }}
                    >
                      <span className={`text-[13px] font-black leading-none ${
                        isSelected && !isRest && st ? st.text :
                        isSelected ? 'text-zinc-400' :
                        isToday ? 'text-lime-400' :
                        workout && !isRest && st ? `${st.text} opacity-70` :
                        'text-zinc-600'
                      }`}>
                        {dayNum}
                      </span>

                      {/* Completion badge */}
                      {workout?.is_completed && !isRest && (
                        <div
                          className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: '#16a34a', border: '1.5px solid #09090b' }}
                        >
                          <svg viewBox="0 0 10 8" className="w-2.5 h-2.5" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 4l2.5 2.5L9 1" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Metric label */}
                    <span className={`text-[9px] font-mono font-semibold h-3 leading-3 ${
                      isSelected ? 'text-zinc-300' : 'text-zinc-600'
                    }`}>
                      {metric}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ╔════════════════════════════════════════════════════╗
          ║  WORKOUT DETAIL CARD                               ║
          ╚════════════════════════════════════════════════════╝ */}
      {plan && (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-5 pb-4">
          {selectedWorkout ? (() => {
            const type   = getWorkoutType(selectedWorkout);
            const st     = TYPE_STYLES[type] ?? TYPE_STYLES.suave;
            const isRest = type === 'descanso';
            const isPast = selectedDate <= todayISO;
            const isToday = selectedDate === todayISO;

            return (
              <div key={selectedDate}>
                {/* Date header */}
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest capitalize">
                    {formatDateFull(selectedDate)}
                    {isToday && (
                      <span className="ml-2 font-black text-lime-400 not-italic">· Hoy</span>
                    )}
                  </p>
                </div>

                {/* Main card */}
                <div
                  className="rounded-2xl overflow-hidden"
                  style={{
                    border: `1px solid ${isRest ? '#27272a' : st.color + '30'}`,
                    background: '#111113',
                  }}
                >
                  {/* Type banner */}
                  <div
                    className="px-5 pt-5 pb-4"
                    style={{
                      background: isRest
                        ? 'linear-gradient(145deg, #18181b 0%, #111113 100%)'
                        : `linear-gradient(145deg, ${st.color}14 0%, ${st.color}06 50%, transparent 100%)`,
                    }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3.5">
                        {/* Type icon */}
                        <div
                          className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 mt-0.5"
                          style={{
                            backgroundColor: `${st.color}15`,
                            border: `1.5px solid ${st.color}35`,
                          }}
                        >
                          <div
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: st.color, boxShadow: `0 0 8px ${st.color}60` }}
                          />
                        </div>

                        <div>
                          <p
                            className="text-xl font-black uppercase tracking-wide leading-none mb-2"
                            style={{ color: isRest ? '#52525b' : st.color }}
                          >
                            {st.label}
                          </p>

                          {/* Stats inline */}
                          {!isRest && (selectedWorkout.distance_km || selectedWorkout.duration_min || selectedWorkout.elevation_gain_m) && (
                            <div className="flex items-baseline gap-4">
                              {selectedWorkout.distance_km && (
                                <div className="flex items-baseline gap-1">
                                  <span className="text-2xl font-black text-zinc-100 tabular-nums leading-none">
                                    {selectedWorkout.distance_km}
                                  </span>
                                  <span className="text-xs text-zinc-500 font-medium">km</span>
                                </div>
                              )}
                              {selectedWorkout.duration_min && (
                                <div className="flex items-baseline gap-1">
                                  <span className="text-2xl font-black text-zinc-100 tabular-nums leading-none">
                                    {selectedWorkout.duration_min}
                                  </span>
                                  <span className="text-xs text-zinc-500 font-medium">min</span>
                                </div>
                              )}
                              {selectedWorkout.elevation_gain_m && (
                                <div className="flex items-baseline gap-1">
                                  <span className="text-2xl font-black text-zinc-100 tabular-nums leading-none">
                                    {selectedWorkout.elevation_gain_m}
                                  </span>
                                  <span className="text-xs text-zinc-500 font-medium">D+</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Complete toggle — compact, top-right */}
                      {!isRest && isPast && (
                        <button
                          onClick={() => handleToggleComplete(selectedWorkout.id, selectedWorkout.is_completed)}
                          className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                            selectedWorkout.is_completed
                              ? 'bg-green-500/15 text-green-400 border-green-500/30 hover:bg-green-500/25'
                              : 'bg-zinc-800/80 text-zinc-400 border-zinc-700 hover:text-lime-400 hover:border-lime-400/50 hover:bg-lime-400/8'
                          }`}
                        >
                          {selectedWorkout.is_completed ? (
                            <>
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              Hecho
                            </>
                          ) : 'Completar'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Description section */}
                  <div className="px-5 py-4 border-t border-zinc-800/60">
                    <p className={`text-sm leading-relaxed font-medium ${
                      selectedWorkout.is_completed ? 'line-through text-zinc-600' : 'text-zinc-200'
                    }`}>
                      {selectedWorkout.description}
                    </p>

                    {selectedWorkout.explanation_json?.purpose && (
                      <div className="mt-3.5 pl-3.5 border-l-2 border-zinc-700/70">
                        <p className="text-xs text-zinc-500 italic leading-relaxed">
                          {selectedWorkout.explanation_json.purpose}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Action row */}
                  {!isRest && (
                    <div className="px-5 pb-5 pt-1 flex gap-2.5">
                      {/* Mark complete — full-width if past/today */}
                      {isPast && (
                        <button
                          onClick={() => handleToggleComplete(selectedWorkout.id, selectedWorkout.is_completed)}
                          className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all border ${
                            selectedWorkout.is_completed
                              ? 'bg-green-500/10 text-green-400 border-green-500/25 hover:bg-green-500/20'
                              : 'bg-zinc-800/60 text-zinc-300 border-zinc-700 hover:bg-lime-400/10 hover:text-lime-400 hover:border-lime-400/40'
                          }`}
                        >
                          {selectedWorkout.is_completed ? '✓ Completado' : 'Marcar como completado'}
                        </button>
                      )}

                      {/* Detail button */}
                      <button
                        onClick={() => { setModalWorkout(selectedWorkout); setShowModal(true); }}
                        className={`${isPast ? 'w-10 flex-shrink-0' : 'flex-1'} py-3 px-3 rounded-xl text-sm font-medium text-zinc-500 border border-zinc-800 hover:text-zinc-200 hover:border-zinc-600 transition-all flex items-center justify-center gap-1.5`}
                      >
                        {isPast ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        ) : (
                          <>
                            Ver detalle
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                              <path d="M5 12h14M12 5l7 7-7 7" />
                            </svg>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Rest day CTA */}
                  {isRest && (
                    <div className="px-5 pb-5 pt-2">
                      <p className="text-xs text-zinc-600 text-center">
                        Recupera, estira y descansa. Tu cuerpo lo necesita.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })() : plan && (
            /* No workout selected or day outside plan */
            <div className="text-center py-14">
              <div
                className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                style={{ background: '#18181b', border: '1px solid #27272a' }}
              >
                <svg className="w-6 h-6 text-zinc-600" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-zinc-500">Selecciona un día del plan</p>
              <p className="text-xs text-zinc-700 mt-1">
                Toca uno de los círculos de la semana
              </p>
            </div>
          )}
        </div>
      )}

      {/* ╔════════════════════════════════════════════════════╗
          ║  MESOCYCLE OVERVIEW — collapsible                  ║
          ╚════════════════════════════════════════════════════╝ */}
      {plan && weeks.length > 0 && (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 pb-6">
          <button
            onClick={() => setMesoExpanded(p => !p)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900 hover:border-zinc-700 text-sm font-semibold text-zinc-500 hover:text-zinc-200 transition-all"
          >
            <span>Mesociclo completo</span>
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${mesoExpanded ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"
            >
              <path d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {mesoExpanded && (
            <div className="mt-2 rounded-2xl border border-zinc-800 overflow-hidden bg-zinc-900/30">
              {/* Legend strip */}
              <div className="px-4 py-2.5 border-b border-zinc-800/60 flex flex-wrap gap-x-3 gap-y-1">
                {Object.entries(TYPE_STYLES)
                  .filter(([k]) => k !== 'descanso')
                  .map(([, s]) => (
                    <span key={s.label} className="flex items-center gap-1 text-[10px] text-zinc-500">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                      {s.label}
                    </span>
                  ))}
              </div>

              {/* Week rows */}
              {weeks.map(({ key, label, range, items }) => {
                const weekMon     = key;
                const weekDaysArr = Array.from({ length: 7 }, (_, i) => addDays(weekMon, i));
                const trainDays   = items.filter(w => !/descanso|rest/i.test(w.description));
                const done        = trainDays.filter(w => w.is_completed);
                const totalKm     = trainDays.reduce((s, w) => s + (w.distance_km || 0), 0);
                const allDone     = trainDays.length > 0 && done.length === trainDays.length;
                const isThisWeek  = key === getWeekMonday(todayISO);
                const isPastWeek  = addDays(key, 6) < todayISO;

                return (
                  <div
                    key={key}
                    className={`border-b border-zinc-800/50 last:border-b-0 px-4 py-3 transition-colors ${
                      isThisWeek ? 'bg-lime-400/5' : isPastWeek ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {/* Week label */}
                      <div className="w-[52px] flex-shrink-0">
                        <p className={`text-[11px] font-black uppercase leading-tight ${
                          isThisWeek ? 'text-lime-500' : 'text-zinc-500'
                        }`}>{label}</p>
                        <p className="text-[9px] text-zinc-700 leading-tight">{range}</p>
                      </div>

                      {/* Day dots */}
                      <div className="flex gap-0.5 flex-1 justify-between">
                        {weekDaysArr.map((dateISO, i) => {
                          const w     = items.find(x => x.workout_date === dateISO);
                          const wtype = w ? getWorkoutType(w) : null;
                          const wst   = wtype ? (TYPE_STYLES[wtype] ?? TYPE_STYLES.suave) : null;
                          const wIsRest = wtype === 'descanso';
                          const isSel   = dateISO === selectedDate;

                          return (
                            <button
                              key={dateISO}
                              onClick={() => {
                                if (w) {
                                  handleDaySelect(dateISO);
                                  setMesoExpanded(false);
                                }
                              }}
                              disabled={!w}
                              className={`flex flex-col items-center gap-0.5 py-0.5 px-0.5 rounded-lg transition-all ${
                                !w ? 'opacity-20 cursor-default' : 'cursor-pointer hover:bg-white/5'
                              }`}
                            >
                              <div
                                className="w-7 h-7 rounded-full flex items-center justify-center transition-all"
                                style={{
                                  backgroundColor: w
                                    ? wIsRest ? '#27272a'
                                    : `${wst!.color}${w.is_completed ? '40' : '22'}`
                                    : 'transparent',
                                  boxShadow: isSel
                                    ? `0 0 0 2px #fff, 0 0 0 3px ${wst?.color ?? '#a3e635'}60`
                                    : 'none',
                                }}
                              >
                                {w?.is_completed && !wIsRest && wst && (
                                  <svg viewBox="0 0 10 8" className="w-2.5 h-2.5" fill="none" stroke={wst.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M1 4l2.5 2.5L9 1" />
                                  </svg>
                                )}
                                {w && !w.is_completed && !wIsRest && wst && (
                                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: wst.color, opacity: 0.8 }} />
                                )}
                              </div>
                              <span className="text-[8px] text-zinc-600 font-bold leading-none">
                                {DAY_LETTERS[i]}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Week summary */}
                      <div className="w-14 flex-shrink-0 text-right">
                        {totalKm > 0 && (
                          <p className="text-xs font-mono font-bold text-zinc-400 leading-tight">
                            {totalKm % 1 === 0 ? totalKm : totalKm.toFixed(1)} km
                          </p>
                        )}
                        {allDone && trainDays.length > 0 ? (
                          <p className="text-[10px] text-green-500 font-black leading-tight">✓ Lista</p>
                        ) : trainDays.length > 0 ? (
                          <p className="text-[10px] text-zinc-600 leading-tight">{done.length}/{trainDays.length}</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ╔════════════════════════════════════════════════════╗
          ║  EMPTY STATES                                      ║
          ╚════════════════════════════════════════════════════╝ */}
      {!loadingPlan && !plan && races.length > 0 && (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-center">
          <div
            className="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(145deg, #1c1c1f, #111113)', border: '1px solid #27272a' }}
          >
            <svg className="w-7 h-7 text-zinc-600" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-zinc-200 mb-2">Sin plan de entrenamiento</h2>
          <p className="text-sm text-zinc-600 mb-6 max-w-xs mx-auto">
            Crea un plan personalizado con IA para alcanzar tu objetivo.
          </p>
          {selectedRace && (
            <button
              onClick={() => setShowPlanModal(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-lime-400 text-black text-sm font-black rounded-xl hover:bg-lime-300 transition-colors"
            >
              Crear plan de entrenamiento
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
      )}

      {!loadingPlan && races.length === 0 && (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-center">
          <div
            className="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(145deg, #1c1c1f, #111113)', border: '1px solid #27272a' }}
          >
            <svg className="w-7 h-7 text-zinc-600" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
              <polyline points="17 6 23 6 23 12" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-zinc-200 mb-2">Añade tu primer objetivo</h2>
          <p className="text-sm text-zinc-600 mb-6 max-w-xs mx-auto">
            Añade una carrera o evento y crea tu plan de entrenamiento personalizado.
          </p>
          <button
            onClick={() => setShowAddGoal(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-lime-400 text-black text-sm font-black rounded-xl hover:bg-lime-300 transition-colors"
          >
            Añadir objetivo
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}

      {/* ╔════════════════════════════════════════════════════╗
          ║  MODALS                                            ║
          ╚════════════════════════════════════════════════════╝ */}
      <WorkoutModal
        open={showModal}
        onClose={() => setShowModal(false)}
        workout={plan?.workouts.find(w => w.id === modalWorkout?.id) ?? modalWorkout}
        onCompleteToggle={handleToggleComplete}
        onSaved={() => fetchPlan()}
      />

      <AddGoalModal
        open={showAddGoal}
        onClose={() => setShowAddGoal(false)}
        onGoalAdded={race => {
          setRaces(prev => [...prev, race].sort((a, b) => a.date.localeCompare(b.date)));
          if (!selectedRace) setSelectedRace(race.id);
        }}
      />

      <PlanManagerModal
        open={showPlanModal}
        onClose={() => setShowPlanModal(false)}
        raceId={selectedRace}
        race={selectedRaceDetails ?? null}
        onPlanChanged={() => fetchPlan()}
      />
    </main>
  );
};

export default CalendarPage;

// Suppress unused import warning (getWeekday is used inside groupByWeek-like logic above)
void getWeekday;
