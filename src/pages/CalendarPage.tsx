import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  collection, getDocs, doc, query, where, orderBy, updateDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebaseClient';
import { Race } from './RacesPage';
import WorkoutModal from '../components/WorkoutModal';

interface Workout {
  id: string;
  workout_date: string;
  description: string;
  is_completed: boolean;
  distance_km?: number | null;
  duration_min?: number | null;
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

// Mon=0 … Sun=6
function getWeekday(dateISO: string): number {
  const dow = new Date(dateISO + 'T00:00:00Z').getUTCDay();
  return dow === 0 ? 6 : dow - 1;
}

function getWorkoutType(w: Workout): string {
  if (w.explanation_json?.type) return w.explanation_json.type;
  const d = w.description.toLowerCase();
  if (/descanso|rest/.test(d))      return 'descanso';
  if (/fuerza/.test(d))             return 'fuerza';
  if (/series|fartlek|\dx/.test(d)) return 'series';
  if (/umbral/.test(d))             return 'umbral';
  if (/tempo/.test(d))              return 'tempo';
  if (/largo/.test(d))              return 'largo';
  return 'suave';
}

const TYPE_STYLES: Record<string, { bg: string; border: string; dot: string; text: string; label: string; color: string }> = {
  suave:    { bg: 'bg-green-50',  border: 'border-green-200',  dot: 'bg-green-400',  text: 'text-green-700',  label: 'Suave',  color: '#4ade80' },
  largo:    { bg: 'bg-blue-50',   border: 'border-blue-200',   dot: 'bg-blue-400',   text: 'text-blue-700',   label: 'Largo',  color: '#60a5fa' },
  series:   { bg: 'bg-red-50',    border: 'border-red-200',    dot: 'bg-red-400',    text: 'text-red-700',    label: 'Series', color: '#f87171' },
  umbral:   { bg: 'bg-amber-50',  border: 'border-amber-200',  dot: 'bg-amber-400',  text: 'text-amber-700',  label: 'Umbral', color: '#fbbf24' },
  tempo:    { bg: 'bg-lime-50', border: 'border-lime-200', dot: 'bg-lime-300', text: 'text-lime-700', label: 'Tempo',  color: '#fb923c' },
  fuerza:   { bg: 'bg-purple-50', border: 'border-purple-200', dot: 'bg-purple-400', text: 'text-purple-700', label: 'Fuerza', color: '#c084fc' },
  descanso: { bg: 'bg-zinc-900',   border: 'border-zinc-800',   dot: 'bg-gray-300',   text: 'text-zinc-600',   label: 'Desc.', color: '#d1d5db' },
};

function groupByWeek(workouts: Workout[]): Array<{ key: string; label: string; range: string; items: Workout[] }> {
  const map = new Map<string, Workout[]>();
  for (const w of workouts) {
    const d   = new Date(w.workout_date + 'T00:00:00Z');
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
      const fmt = (d: Date) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
      return { key, label: `Semana ${n}`, range: `${fmt(mon)} – ${fmt(sun)}`, items };
    });
}

const CalendarPage = () => {
  const { user } = useAuth();
  const [races, setRaces]               = useState<Race[]>([]);
  const [selectedRace, setSelectedRace] = useState('');
  const [plan, setPlan]                 = useState<TrainingPlan | null>(null);
  const [loadingPlan, setLoadingPlan]   = useState(false);
  const [calendarView, setCalendarView] = useState(true);
  const [modalWorkout, setModalWorkout] = useState<Workout | null>(null);
  const [showModal, setShowModal]       = useState(false);

  const todayISO = new Date().toISOString().substring(0, 10);

  useEffect(() => {
    if (!user) return;
    const fetchRaces = async () => {
      const snap = await getDocs(query(collection(db, 'users', user.uid, 'races'), orderBy('date', 'asc')));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Race));
      setRaces(list);
      // Auto-select next upcoming race
      const next = list.find(r => r.date >= todayISO);
      if (next) setSelectedRace(next.id);
      else if (list.length > 0) setSelectedRace(list[list.length - 1].id);
    };
    fetchRaces();
  }, [user]);

  const fetchPlanForRace = useCallback(async (raceId: string) => {
    if (!user || !raceId) return;
    setLoadingPlan(true);
    setPlan(null);
    try {
      const planSnap = await getDocs(
        query(collection(db, 'users', user.uid, 'training_plans'), where('race_id', '==', raceId))
      );
      if (planSnap.empty) return;
      const planDoc  = planSnap.docs[0];
      const planData = planDoc.data();
      const planId   = planDoc.id;
      const workoutsSnap = await getDocs(
        query(collection(db, 'users', user.uid, 'workouts'), where('plan_id', '==', planId), orderBy('workout_date', 'asc'))
      );
      const workoutsData = workoutsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Workout));
      setPlan({ id: planId, ...planData, workouts: workoutsData } as TrainingPlan);
    } catch (e) {
      console.warn('Error loading plan:', e);
    } finally {
      setLoadingPlan(false);
    }
  }, [user]);

  useEffect(() => {
    if (selectedRace) fetchPlanForRace(selectedRace);
    else setPlan(null);
  }, [selectedRace, fetchPlanForRace]);

  // Re-sync after external changes (e.g., completing from another tab)
  useEffect(() => {
    const handler = () => { if (selectedRace) fetchPlanForRace(selectedRace); };
    window.addEventListener('workouts-changed', handler);
    return () => window.removeEventListener('workouts-changed', handler);
  }, [selectedRace, fetchPlanForRace]);

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
      setModalWorkout(prev => prev?.id === workoutId ? { ...prev, is_completed: currentlyCompleted } : prev);
    }
  };

  const selectedRaceDetails = races.find(r => r.id === selectedRace);
  const mesoEnd = plan?.mesocycle_end_date;
  const daysUntilMesoEnd = mesoEnd
    ? Math.ceil((new Date(mesoEnd).getTime() - new Date(todayISO).getTime()) / 86400000)
    : null;

  return (
    <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-16">
      {/* Page header */}
      <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100">Calendario</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Tu plan de entrenamiento día a día</p>
        </div>
        {plan && (
          <Link to={`/training-plan?race=${selectedRace}`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-lime-50 border border-lime-200 text-lime-700 text-sm font-semibold hover:bg-lime-100 transition-colors">
            Gestionar plan →
          </Link>
        )}
      </div>

      {/* Race selector */}
      <div className="mb-5">
        <select
          value={selectedRace}
          onChange={e => setSelectedRace(e.target.value)}
          className="w-full sm:w-72 p-2.5 border border-zinc-700 rounded-lg focus:ring-2 focus:ring-lime-400 focus:border-lime-400 bg-zinc-900 text-zinc-100 text-sm"
        >
          <option value="">-- Selecciona una carrera --</option>
          {races.map(r => (
            <option key={r.id} value={r.id}>
              {r.name} ({new Date(r.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })})
            </option>
          ))}
        </select>
      </div>

      {loadingPlan && (
        <div className="flex items-center gap-2 text-zinc-500 text-sm py-8">
          <div className="w-4 h-4 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" />
          Cargando plan…
        </div>
      )}

      {/* Plan loaded */}
      {!loadingPlan && selectedRace && plan && (() => {
        const allTrain = plan.workouts.filter(w => !/descanso|rest/i.test(w.description));
        const doneTrain = allTrain.filter(w => w.is_completed);
        const pct = allTrain.length > 0 ? Math.round(doneTrain.length / allTrain.length * 100) : 0;

        return (
          <div>
            {/* Compact plan strip */}
            <div className="mb-5 px-4 py-3 bg-zinc-900 rounded-xl border border-zinc-800 shadow-sm flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-bold text-zinc-100">{selectedRaceDetails?.name}</h2>
                  {plan.mesocycle_number && plan.total_mesocycles && (
                    <span className="text-[11px] font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                      Meso {plan.mesocycle_number}/{plan.total_mesocycles}
                    </span>
                  )}
                  {daysUntilMesoEnd !== null && daysUntilMesoEnd <= 14 && daysUntilMesoEnd > 0 && (
                    <span className="text-[11px] font-semibold bg-lime-100 text-lime-700 px-2 py-0.5 rounded-full">
                      Meso acaba en {daysUntilMesoEnd}d
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">{plan.goal}</p>
              </div>
              {allTrain.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-zinc-700 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-zinc-400 font-semibold tabular-nums">{doneTrain.length}/{allTrain.length}</span>
                </div>
              )}
            </div>

            {/* View toggle */}
            <div className="flex items-center gap-2 mb-4">
              {(['calendario', 'lista'] as const).map(v => (
                <button key={v} onClick={() => setCalendarView(v === 'calendario')}
                  className={`px-3 py-1.5 text-sm font-semibold rounded-lg border transition-colors ${
                    (v === 'calendario') === calendarView
                      ? 'bg-lime-400 text-black border-lime-400'
                      : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-lime-400'
                  }`}>
                  {v === 'calendario' ? '▦ Calendario' : '≡ Lista'}
                </button>
              ))}
            </div>

            {/* ── CALENDAR VIEW ── */}
            {calendarView && (() => {
              const weeks = groupByWeek(plan.workouts);
              const todayWorkout = plan.workouts.find(w => w.workout_date === todayISO);
              const tomorrowISO = (() => {
                const d = new Date(todayISO + 'T00:00:00Z');
                d.setUTCDate(d.getUTCDate() + 1);
                return d.toISOString().split('T')[0];
              })();
              const tomorrowWorkout = plan.workouts.find(w => w.workout_date === tomorrowISO);
              const currentWeekKey = (() => {
                const d = new Date(todayISO + 'T00:00:00Z');
                const dow = d.getUTCDay();
                const mon = new Date(d);
                mon.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
                return mon.toISOString().split('T')[0];
              })();

              return (
                <div className="space-y-5">
                  {/* Today / Tomorrow banner */}
                  {(todayWorkout || tomorrowWorkout) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {([
                        { label: 'Hoy', w: todayWorkout, iso: todayISO, accent: true },
                        { label: 'Mañana', w: tomorrowWorkout, iso: tomorrowISO, accent: false },
                      ] as { label: string; w: Workout | undefined; iso: string; accent: boolean }[]).map(({ label, w, iso, accent }) => {
                        if (!w) return (
                          <div key={iso} className="rounded-xl border border-dashed border-zinc-800 p-4 flex items-center justify-center text-zinc-600 text-sm min-h-[100px]">
                            {label} — sin entrenamiento
                          </div>
                        );
                        const type = getWorkoutType(w);
                        const st = TYPE_STYLES[type] ?? TYPE_STYLES.suave;
                        const isRest = type === 'descanso';
                        return (
                          <div key={iso} className={`rounded-xl p-4 ${st.bg}`}
                            style={{ border: accent ? `2px solid ${st.color}` : `1px solid ${st.color}40`, borderLeftWidth: 5, borderLeftColor: st.color }}>
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-xs font-black uppercase tracking-widest ${accent ? 'text-lime-600' : 'text-zinc-500'}`}>{label}</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${st.bg} ${st.text} ${st.border}`}>{st.label}</span>
                              </div>
                              {!isRest && (
                                <button
                                  onClick={() => handleToggleComplete(w.id, w.is_completed)}
                                  title={w.is_completed ? 'Marcar pendiente' : 'Marcar completado'}
                                  className={`flex-shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors ${
                                    w.is_completed ? 'bg-green-500 border-green-500 text-white' : 'bg-zinc-900 border-zinc-700 text-zinc-600 hover:border-green-400 hover:text-green-400'
                                  }`}
                                >✓</button>
                              )}
                            </div>
                            <p className={`text-sm font-semibold leading-snug mb-1.5 ${w.is_completed ? 'line-through text-zinc-600' : 'text-zinc-100'}`}>
                              {w.description}
                            </p>
                            {w.explanation_json?.purpose && (
                              <p className="text-[11px] text-zinc-500 italic mb-2">{w.explanation_json.purpose}</p>
                            )}
                            <div className="flex items-center justify-between">
                              <div className="flex gap-3 text-[11px] font-mono text-zinc-500">
                                {w.distance_km && <span>{w.distance_km} km</span>}
                                {w.duration_min && <span>{w.duration_min} min</span>}
                              </div>
                              <button
                                onClick={() => { setModalWorkout(w); setShowModal(true); }}
                                className="text-[11px] text-zinc-600 hover:text-zinc-400 underline"
                              >Ver detalle →</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Weekly grids */}
                  <div className="overflow-x-auto">
                    <div style={{ minWidth: 560 }}>
                      <div className="grid grid-cols-[90px_repeat(7,1fr)] gap-1 mb-1 px-1">
                        <div />
                        {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d => (
                          <div key={d} className="text-center text-[11px] font-bold text-zinc-600 py-1">{d}</div>
                        ))}
                      </div>

                      {weeks.map(({ key, label, range, items }) => {
                        const isCurrentWeek = key === currentWeekKey;
                        const isPastWeek    = key < currentWeekKey;
                        const weeklyKm  = items.reduce((s, w) => s + (w.distance_km  || 0), 0);
                        const weeklyMin = items.reduce((s, w) => s + (w.duration_min || 0), 0);
                        const trainDays = items.filter(w => !/descanso|rest/i.test(w.description));
                        const doneDays  = trainDays.filter(w => w.is_completed);
                        const doneKm    = doneDays.reduce((s, w) => s + (w.distance_km || 0), 0);
                        const pctW      = trainDays.length > 0 ? Math.round(doneDays.length / trainDays.length * 100) : 0;
                        const allDone   = trainDays.length > 0 && doneDays.length === trainDays.length;

                        return (
                          <div key={key} className={`mb-3 rounded-xl overflow-hidden transition-opacity ${isPastWeek ? 'opacity-60' : ''}`}
                            style={{ border: isCurrentWeek ? '1.5px solid #a3e635' : '1px solid #f3f4f6' }}>
                            {/* Week header */}
                            <div className={`flex items-center justify-between px-3 py-2 ${isCurrentWeek ? 'bg-lime-50' : 'bg-zinc-900'}`}>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-[11px] font-black uppercase tracking-wide ${isCurrentWeek ? 'text-lime-600' : 'text-zinc-500'}`}>
                                  {isCurrentWeek ? 'Esta semana' : label}
                                </span>
                                <span className="text-[10px] text-zinc-600">{range}</span>
                                {allDone && trainDays.length > 0 && (
                                  <span className="text-[10px] font-bold text-green-600 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full">✓ Completa</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                {weeklyKm > 0 && (
                                  <span className="text-[11px] font-mono font-semibold text-zinc-400">
                                    {weeklyKm.toFixed(0)} km
                                    {doneKm > 0 && doneKm < weeklyKm && (
                                      <span className="text-green-600 font-normal ml-1">({doneKm.toFixed(0)} hecho)</span>
                                    )}
                                  </span>
                                )}
                                {weeklyMin > 0 && weeklyKm === 0 && (
                                  <span className="text-[11px] font-mono text-zinc-500">{weeklyMin} min</span>
                                )}
                                {trainDays.length > 0 && (
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-14 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                                      <div className={`h-full rounded-full transition-all ${allDone ? 'bg-green-500' : 'bg-lime-300'}`} style={{ width: `${pctW}%` }} />
                                    </div>
                                    <span className={`text-[10px] font-semibold tabular-nums ${allDone ? 'text-green-600' : 'text-zinc-500'}`}>{doneDays.length}/{trainDays.length}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Day cells */}
                            <div className="grid grid-cols-[90px_repeat(7,1fr)] gap-1 p-2 bg-white">
                              <div className="flex flex-col justify-center gap-0.5 pr-1">
                                {weeklyKm > 0 && <span className="text-[10px] text-zinc-600 font-mono">{weeklyKm.toFixed(0)} km</span>}
                                {weeklyMin > 0 && weeklyKm === 0 && <span className="text-[10px] text-zinc-600 font-mono">{weeklyMin} min</span>}
                              </div>
                              {Array.from({ length: 7 }, (_, col) => {
                                const w = items.find(x => getWeekday(x.workout_date) === col);
                                if (!w) return (
                                  <div key={col} className="h-[90px] rounded-lg bg-zinc-900 border border-dashed border-zinc-800" />
                                );
                                const type    = getWorkoutType(w);
                                const st      = TYPE_STYLES[type] ?? TYPE_STYLES.suave;
                                const isToday = w.workout_date === todayISO;
                                const isPast  = w.workout_date < todayISO;
                                const isRest  = type === 'descanso';
                                const dayNum  = new Date(w.workout_date + 'T00:00:00Z').getUTCDate();
                                const canToggle = !isRest && (isToday || isPast);

                                return (
                                  <div key={col} className="relative">
                                    <div
                                      onClick={() => { setModalWorkout(w); setShowModal(true); }}
                                      className={`h-[90px] rounded-lg flex flex-col p-1.5 cursor-pointer transition-all hover:shadow-md hover:scale-[1.02] select-none
                                        ${st.bg}
                                        ${isToday ? 'ring-2 ring-lime-400 ring-offset-1' : ''}
                                        ${w.is_completed && !isRest ? 'opacity-50' : ''}
                                      `}
                                      style={{ border: '1px solid #e5e7eb', borderLeftWidth: 3, borderLeftColor: st.color }}
                                    >
                                      <div className="flex items-center justify-between">
                                        <span className={`text-[11px] font-bold leading-none ${isToday ? 'text-lime-600' : 'text-zinc-500'}`}>{dayNum}</span>
                                        {w.is_completed && !isRest && <span className="text-[9px] text-green-500 font-black leading-none">✓</span>}
                                      </div>
                                      <div className="flex-1" />
                                      <div className={`text-[10px] font-bold leading-tight truncate ${st.text}`}>{st.label}</div>
                                      {w.distance_km ? (
                                        <div className="text-[10px] text-zinc-500 font-mono leading-tight">{w.distance_km}km</div>
                                      ) : w.duration_min ? (
                                        <div className="text-[10px] text-zinc-500 font-mono leading-tight">{w.duration_min}min</div>
                                      ) : null}
                                    </div>
                                    {canToggle && (
                                      <button
                                        onClick={e => { e.stopPropagation(); handleToggleComplete(w.id, w.is_completed); }}
                                        title={w.is_completed ? 'Desmarcar' : 'Completar'}
                                        className={`absolute bottom-1.5 right-1.5 w-5 h-5 rounded-full border-2 flex items-center justify-center text-[9px] font-bold transition-colors z-10 ${
                                          w.is_completed
                                            ? 'bg-green-500 border-green-500 text-white'
                                            : 'bg-zinc-900 border-zinc-700 text-zinc-600 hover:border-green-400 hover:text-green-400'
                                        }`}
                                      >✓</button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Legend */}
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(TYPE_STYLES).filter(([k]) => k !== 'descanso').map(([k, s]) => (
                      <span key={k} className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border font-medium ${s.bg} ${s.border} ${s.text}`}>
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                        {s.label}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* ── LIST VIEW ── */}
            {!calendarView && (
              <div className="space-y-4">
                {groupByWeek(plan.workouts).map(({ key, label, range, items }) => {
                  const trainDays = items.filter(w => !/descanso|rest/i.test(w.description));
                  const doneDays  = trainDays.filter(w => w.is_completed);
                  const allDone   = trainDays.length > 0 && doneDays.length === trainDays.length;
                  const pctL      = trainDays.length > 0 ? Math.round(doneDays.length / trainDays.length * 100) : 0;
                  const hasToday  = items.some(w => w.workout_date === todayISO);

                  return (
                    <div key={key} className={`rounded-xl border ${hasToday ? 'border-lime-200' : 'border-zinc-800'}`}>
                      <div className={`flex items-center justify-between px-4 py-3 rounded-t-xl ${hasToday ? 'bg-lime-50' : 'bg-zinc-900'}`}>
                        <div>
                          <span className="font-semibold text-sm text-zinc-200">{label}</span>
                          <span className="text-xs text-zinc-500 ml-2">{range}</span>
                        </div>
                        {trainDays.length > 0 && (
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                              <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pctL}%` }} />
                            </div>
                            <span className={`text-xs font-semibold ${allDone ? 'text-green-600' : 'text-zinc-500'}`}>{doneDays.length}/{trainDays.length}</span>
                          </div>
                        )}
                      </div>
                      <ul className="divide-y divide-zinc-800">
                        {items.map(w => {
                          const isRest  = /descanso|rest/i.test(w.description);
                          const isToday = w.workout_date === todayISO;
                          const isPast  = w.workout_date < todayISO;
                          return (
                            <li key={w.id}
                              className={`flex items-center gap-3 px-4 py-3 transition-colors cursor-pointer
                                ${w.is_completed ? 'bg-green-50/60 hover:bg-green-50' : isToday ? 'bg-lime-50/50 hover:bg-lime-50' : 'hover:bg-zinc-900'}
                              `}
                              onClick={() => { setModalWorkout(w); setShowModal(true); }}
                            >
                              {!isRest ? (
                                <button
                                  onClick={e => { e.stopPropagation(); handleToggleComplete(w.id, w.is_completed); }}
                                  title={w.is_completed ? 'Marcar pendiente' : 'Marcar completado'}
                                  className={`flex-shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors
                                    ${w.is_completed
                                      ? 'bg-green-500 border-green-500 text-white'
                                      : isPast
                                        ? 'border-zinc-700 text-zinc-600 hover:border-green-400 hover:text-green-400'
                                        : 'border-zinc-700 text-transparent hover:border-green-400 hover:text-green-300'
                                    }`}
                                >✓</button>
                              ) : (
                                <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-zinc-600 text-xs">—</div>
                              )}
                              <div className="flex-shrink-0 w-28">
                                <div className={`text-xs font-semibold capitalize ${isToday ? 'text-lime-600' : 'text-zinc-500'}`}>
                                  {new Date(w.workout_date + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
                                </div>
                                {isToday && <span className="text-[10px] font-bold text-lime-500 uppercase tracking-wide">Hoy</span>}
                              </div>
                              <span className={`flex-1 text-sm min-w-0 ${w.is_completed ? 'line-through text-zinc-600' : isRest ? 'text-zinc-600 italic' : 'text-zinc-100'}`}>
                                {w.description}
                              </span>
                              {(w.distance_km || w.duration_min) && (
                                <span className="flex-shrink-0 text-xs text-zinc-600 font-mono">
                                  {w.distance_km ? `${w.distance_km}km` : ''}{w.distance_km && w.duration_min ? ' · ' : ''}{w.duration_min ? `${w.duration_min}min` : ''}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Workout detail modal */}
            <WorkoutModal
              open={showModal}
              onClose={() => setShowModal(false)}
              workout={plan?.workouts.find(w => w.id === modalWorkout?.id) ?? modalWorkout}
              onCompleteToggle={handleToggleComplete}
              onSaved={() => { if (selectedRace) fetchPlanForRace(selectedRace); }}
            />
          </div>
        );
      })()}

      {/* No plan for this race */}
      {!loadingPlan && selectedRace && !plan && (
        <div className="text-center py-16 px-4">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-lime-50 flex items-center justify-center text-2xl">📋</div>
          <h2 className="text-lg font-semibold text-zinc-100 mb-2">Sin plan para {selectedRaceDetails?.name}</h2>
          <p className="text-sm text-zinc-500 mb-6">Crea un plan de entrenamiento personalizado con IA para esta carrera.</p>
          <Link to={`/training-plan?race=${selectedRace}`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-lime-400 text-black font-semibold rounded-lg hover:bg-lime-500 transition-colors">
            Crear plan de entrenamiento →
          </Link>
        </div>
      )}

      {/* No races at all */}
      {!loadingPlan && races.length === 0 && (
        <div className="text-center py-16 px-4">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-zinc-900 flex items-center justify-center text-2xl">🏁</div>
          <h2 className="text-lg font-semibold text-zinc-100 mb-2">Añade tu primera carrera</h2>
          <p className="text-sm text-zinc-500 mb-6">Primero añade una carrera para poder crear un plan de entrenamiento.</p>
          <Link to="/races"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gray-800 text-white font-semibold rounded-lg hover:bg-gray-900 transition-colors">
            Ir a Carreras →
          </Link>
        </div>
      )}
    </main>
  );
};

export default CalendarPage;
