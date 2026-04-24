import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  collection, getDocs, doc, query, where, orderBy, limit, updateDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebaseClient';

interface Race     { id: string; name: string; date: string; }
interface Workout  { id: string; workout_date: string; description: string; is_completed: boolean; distance_km?: number | null; plan_id?: string; }
interface Activity { activity_id: string; start_date: string; name: string; distance_m?: number | null; sport_type?: string; }
interface IntensityWeek { label: string; kmZ1: number; kmZ4: number; kmZ5: number; total: number; }
interface FitnessData   { ctl: number; atl: number; tsb: number; history: { ctl: number; atl: number }[]; }

function FitnessChart({ data }: { data: { ctl: number; atl: number }[] }) {
  if (data.length < 2) return null;
  const maxV = Math.max(...data.flatMap(d => [d.ctl, d.atl]), 1);
  const W = 100, H = 40;
  const px = (i: number) => ((i / (data.length - 1)) * W).toFixed(2);
  const py = (v: number) => (H - (v / maxV) * (H - 2) - 1).toFixed(2);
  const mkPath = (key: 'ctl' | 'atl') =>
    data.map((d, i) => `${i === 0 ? 'M' : 'L'}${px(i)},${py(d[key])}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-12 mt-1" preserveAspectRatio="none">
      <path d={mkPath('ctl')} fill="none" stroke="#6366f1" strokeWidth="0.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d={mkPath('atl')} fill="none" stroke="#f97316" strokeWidth="0.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const HomePage = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [nextRace, setNextRace] = useState<Race | null>(null);
  const [weekWorkouts, setWeekWorkouts] = useState<Workout[]>([]);
  const [recentActivities, setRecentActivities] = useState<Activity[]>([]);
  const [planProgress, setPlanProgress] = useState<{ total: number; done: number; percent: number } | null>(null);
  const [weeklyKm, setWeeklyKm] = useState<{ plan: number; activities: number; total: number }>({ plan: 0, activities: 0, total: 0 });
  const [last28Km, setLast28Km] = useState<{ activities: number; workouts: number; total: number }>({ activities: 0, workouts: 0, total: 0 });
  const [upcomingWorkouts, setUpcomingWorkouts] = useState<Workout[]>([]);
  const [marking, setMarking] = useState<string | null>(null);
  const [weeklyTrend, setWeeklyTrend] = useState<number[]>([]);
  const [intensityWeeks, setIntensityWeeks] = useState<IntensityWeek[]>([]);
  const [fitnessData, setFitnessData] = useState<FitnessData | null>(null);

  const iso = (d: Date) => d.toISOString().substring(0, 10);
  const weekStartISO = () => {
    const d = new Date();
    const day = d.getDay() || 7;
    if (day !== 1) d.setDate(d.getDate() - (day - 1));
    d.setHours(0, 0, 0, 0);
    return iso(d);
  };
  const weekEndISO = () => {
    const s = new Date(weekStartISO());
    s.setDate(s.getDate() + 6);
    return iso(s);
  };

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const todayISO  = iso(new Date());
      const wStart    = weekStartISO();
      const wEnd      = weekEndISO();
      const since7    = iso(new Date(Date.now() - 7  * 86400000));
      const since28   = iso(new Date(Date.now() - 28 * 86400000));
      const since90   = iso(new Date(Date.now() - 90 * 86400000));
      const uid       = user.uid;

      // ── Next race ──────────────────────────────────────────────
      const racesSnap = await getDocs(
        query(collection(db, 'users', uid, 'races'),
          where('date', '>=', todayISO),
          orderBy('date', 'asc'),
          limit(1),
        )
      );
      const nr: Race | null = racesSnap.empty ? null : { id: racesSnap.docs[0].id, ...racesSnap.docs[0].data() } as Race;
      setNextRace(nr);

      // ── Active plan for next race ──────────────────────────────
      let planId: string | null = null;
      if (nr) {
        const planSnap = await getDocs(
          query(collection(db, 'users', uid, 'training_plans'), where('race_id', '==', nr.id))
        );
        planId = planSnap.empty ? null : planSnap.docs[0].id;
      }

      // ── This week's workouts ───────────────────────────────────
      const wwSnap = await getDocs(
        query(collection(db, 'users', uid, 'workouts'),
          where('workout_date', '>=', wStart),
          where('workout_date', '<=', wEnd),
          orderBy('workout_date', 'asc'),
        )
      );
      const workoutsWeek = wwSnap.docs.map(d => ({ id: d.id, ...d.data() } as Workout));
      setWeekWorkouts(workoutsWeek);

      // ── Recent activities (last 7 days, max 5) ─────────────────
      const act7Snap = await getDocs(
        query(collection(db, 'users', uid, 'strava_activities'),
          where('start_date', '>=', since7),
          orderBy('start_date', 'desc'),
          limit(5),
        )
      );
      const activities7 = act7Snap.docs.map(d => ({ ...d.data() } as Activity));
      setRecentActivities(activities7);

      // ── Activities 28 days ─────────────────────────────────────
      const act28Snap = await getDocs(
        query(collection(db, 'users', uid, 'strava_activities'), where('start_date', '>=', since28))
      );
      const activities28 = act28Snap.docs.map(d => d.data());

      // ── Workouts 28 days ───────────────────────────────────────
      const w28Snap = await getDocs(
        query(collection(db, 'users', uid, 'workouts'), where('workout_date', '>=', since28))
      );
      const workouts28 = w28Snap.docs.map(d => d.data());

      // ── Weekly km stats ────────────────────────────────────────
      const planKmWeek = workoutsWeek.reduce((a, w) => a + (w.distance_km || 0), 0);
      const actKmWeek  = activities7.filter(a => a.start_date >= wStart).reduce((a, a2) => a + ((a2.distance_m || 0) / 1000), 0);
      setWeeklyKm({ plan: planKmWeek, activities: actKmWeek, total: planKmWeek + actKmWeek });

      const actKm28 = activities28.reduce((a, a2: any) => a + ((a2.distance_m || 0) / 1000), 0);
      const wKm28   = workouts28.reduce((a, w: any) => a + (w.distance_km || 0), 0);
      setLast28Km({ activities: actKm28, workouts: wKm28, total: actKm28 + wKm28 });

      // ── Weekly trend (4 weeks) ─────────────────────────────────
      const weekBlocks: number[] = [];
      for (let i = 3; i >= 0; i--) {
        const start = new Date(Date.now() - (i + 1) * 7 * 86400000);
        const end   = new Date(start.getTime() + 7 * 86400000);
        const sISO  = iso(start); const eISO = iso(end);
        const wkAct = activities28.filter((a: any) => a.start_date >= sISO && a.start_date < eISO).reduce((a, a2: any) => a + ((a2.distance_m || 0) / 1000), 0);
        const wkW   = workouts28.filter((w: any) => w.workout_date >= sISO && w.workout_date < eISO).reduce((a, w2: any) => a + (w2.distance_km || 0), 0);
        weekBlocks.push(parseFloat((wkAct + wkW).toFixed(1)));
      }
      setWeeklyTrend(weekBlocks);

      // ── Intensity distribution (4 weeks) ──────────────────────
      const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
      const fmtD = (d: Date) => `${d.getDate()} ${months[d.getMonth()]}`;
      const iWeeks: IntensityWeek[] = [];
      for (let i = 3; i >= 0; i--) {
        const start = new Date(Date.now() - (i + 1) * 7 * 86400000);
        const end   = new Date(start.getTime() + 7 * 86400000);
        const sISO  = iso(start); const eISO = iso(end);
        const label = `${fmtD(start)}–${fmtD(new Date(end.getTime() - 86400000))}`;
        let kmZ1 = 0, kmZ4 = 0, kmZ5 = 0;
        for (const w of workouts28) {
          if (!(w as any).is_completed) continue;
          if ((w as any).workout_date < sISO || (w as any).workout_date >= eISO) continue;
          const km    = ((w as any).distance_km || 0) as number;
          const type: string = (w as any).explanation_json?.type || '';
          if (type === 'suave' || type === 'largo') kmZ1 += km;
          else if (type === 'umbral' || type === 'tempo') kmZ4 += km;
          else if (type === 'series') kmZ5 += km;
        }
        iWeeks.push({ label, kmZ1, kmZ4, kmZ5, total: kmZ1 + kmZ4 + kmZ5 });
      }
      setIntensityWeeks(iWeeks);

      // ── Fitness model CTL/ATL/TSB (90 days) ───────────────────
      const w90Snap = await getDocs(
        query(collection(db, 'users', uid, 'workouts'), where('workout_date', '>=', since90))
      );
      const workouts90 = w90Snap.docs.map(d => d.data());

      const tssMap: Record<string, number> = {};
      for (const w of workouts90) {
        if (!(w as any).is_completed) continue;
        const km    = ((w as any).distance_km || 0) as number;
        const type: string = (w as any).explanation_json?.type || '';
        const factor = (type === 'umbral' || type === 'tempo') ? 2.5 : type === 'series' ? 3.5 : 1.0;
        const d = (w as any).workout_date as string;
        tssMap[d] = (tssMap[d] || 0) + km * factor;
      }

      let ctl = 0, atl = 0;
      const kCtl = 1 / 42, kAtl = 1 / 7;
      const fitnessHistory: { ctl: number; atl: number }[] = [];
      for (let di = 89; di >= 0; di--) {
        const dayDate = iso(new Date(Date.now() - di * 86400000));
        const tss = tssMap[dayDate] || 0;
        ctl = ctl * (1 - kCtl) + tss * kCtl;
        atl = atl * (1 - kAtl) + tss * kAtl;
        fitnessHistory.push({ ctl: parseFloat(ctl.toFixed(2)), atl: parseFloat(atl.toFixed(2)) });
      }
      if (ctl >= 0.3) {
        setFitnessData({
          ctl:     parseFloat(ctl.toFixed(1)),
          atl:     parseFloat(atl.toFixed(1)),
          tsb:     parseFloat((ctl - atl).toFixed(1)),
          history: fitnessHistory,
        });
      }

      // ── Plan progress ──────────────────────────────────────────
      if (planId) {
        const pwSnap = await getDocs(
          query(collection(db, 'users', uid, 'workouts'), where('plan_id', '==', planId))
        );
        const planWorkouts = pwSnap.docs.map(d => ({ id: d.id, ...d.data() } as Workout));
        const total = planWorkouts.length;
        const done  = planWorkouts.filter(w => w.is_completed).length;
        setPlanProgress({ total, done, percent: total ? Math.round(done / total * 100) : 0 });
        const upcoming = planWorkouts
          .filter(w => w.workout_date >= todayISO && !w.is_completed)
          .sort((a, b) => a.workout_date.localeCompare(b.workout_date))
          .slice(0, 3);
        setUpcomingWorkouts(upcoming);
      } else {
        setPlanProgress(null);
        setUpcomingWorkouts([]);
      }
    } catch (e) {
      console.warn('Error dashboard', e);
    } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const daysToRace = nextRace ? Math.max(0, Math.ceil((new Date(nextRace.date).getTime() - Date.now()) / 86400000)) : null;

  const sparklinePath = useMemo(() => {
    if (!weeklyTrend.length) return '';
    const max = Math.max(...weeklyTrend, 1); const w = 100; const h = 30;
    return weeklyTrend.map((v, i) => { const x = (i / (weeklyTrend.length - 1)) * w; const y = h - (v / max) * h; return `${i ? 'L' : 'M'}${x},${y}`; }).join(' ');
  }, [weeklyTrend]);
  const maxWeeklyTrend = useMemo(() => weeklyTrend.length ? Math.max(...weeklyTrend) : 0, [weeklyTrend]);

  const toggleWorkout = async (id: string, cur: boolean) => {
    setMarking(id);
    try {
      await updateDoc(doc(db, 'users', user!.uid, 'workouts', id), { is_completed: !cur });
      setWeekWorkouts(ws => ws.map(w => w.id === id ? { ...w, is_completed: !cur } : w));
      setUpcomingWorkouts(ws => ws.map(w => w.id === id ? { ...w, is_completed: !cur } : w));
      loadData();
    } finally { setMarking(null); }
  };

  return (
    <main className="relative">
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-orange-50 via-white to-rose-50" />
      <div className="absolute top-0 inset-x-0 h-[280px] -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(255,140,0,0.25),transparent_60%)]" />
      <div className="container mx-auto px-4 sm:px-6 lg:px-10 pt-8 pb-16">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-orange-600 via-pink-600 to-purple-600 text-transparent bg-clip-text drop-shadow-sm">Tu Panel</h1>
            {user && <p className="mt-2 text-sm text-gray-600">Hola <span className="font-semibold text-gray-800">{user.email}</span>, este es tu resumen de entrenamiento.</p>}
          </div>
          {nextRace && (
            <div className="px-5 py-4 rounded-2xl bg-white/70 backdrop-blur shadow-sm border border-white/60 flex flex-col items-start gap-1">
              <span className="text-[11px] uppercase tracking-wide text-gray-500">Cuenta atrás</span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-gray-800 leading-none">{daysToRace}</span>
                <span className="text-xs font-medium text-gray-500">días</span>
              </div>
              <p className="text-xs text-gray-600 mt-1 font-medium">{nextRace.name}</p>
              <p className="text-[11px] text-gray-400">{new Date(nextRace.date).toLocaleDateString()}</p>
            </div>
          )}
        </div>
        {loading ? (
          <p className="text-gray-500">Cargando datos...</p>
        ) : (
          <div className="space-y-12">
            {/* Stat cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
              <div className="relative group rounded-2xl p-[1px] bg-gradient-to-br from-orange-400 via-pink-500 to-purple-600 shadow-lg">
                <div className="rounded-2xl h-full w-full bg-white/90 backdrop-blur-sm p-5 flex flex-col">
                  <span className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Próxima carrera</span>
                  {nextRace ? (
                    <>
                      <span className="font-semibold text-gray-800 line-clamp-1" title={nextRace.name}>{nextRace.name}</span>
                      <span className="text-xs text-gray-600">{new Date(nextRace.date).toLocaleDateString()}</span>
                      {daysToRace != null && <div className="mt-3 flex items-center gap-3">
                        <div className="relative w-14 h-14">
                          <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-orange-500 to-pink-500 opacity-20 animate-pulse" />
                          <div className="absolute inset-0 rounded-full bg-white flex items-center justify-center font-bold text-gray-800 text-lg shadow-inner">{daysToRace}</div>
                        </div>
                        <div className="text-xs font-medium text-gray-500 leading-tight">días para competir<br /><span className="text-orange-600 font-semibold">¡Vamos!</span></div>
                      </div>}
                    </>
                  ) : <span className="text-gray-400 text-sm">Añade una carrera para iniciar</span>}
                </div>
              </div>
              <div className="relative group rounded-2xl p-[1px] bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600 shadow-lg">
                <div className="rounded-2xl bg-white/90 h-full p-5 flex flex-col">
                  <span className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Semana actual</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-gray-800">{weeklyKm.total.toFixed(1)}</span>
                    <span className="text-xs font-semibold text-emerald-600">km</span>
                  </div>
                  <span className="text-[11px] text-gray-500 mt-1">Plan {weeklyKm.plan.toFixed(1)} • Strava {weeklyKm.activities.toFixed(1)}</span>
                  <div className="mt-3">
                    <svg viewBox="0 0 100 30" className="w-full h-8 overflow-visible">
                      <path d={sparklinePath} fill="none" strokeWidth={2} stroke="url(#gradWeek)" strokeLinecap="round" />
                      <defs>
                        <linearGradient id="gradWeek" x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stopColor="#059669" /><stop offset="100%" stopColor="#06b6d4" /></linearGradient>
                      </defs>
                    </svg>
                    <div className="flex justify-between text-[10px] text-gray-400 mt-1">{weeklyTrend.map((v, i) => (<span key={i}>{v}</span>))}</div>
                  </div>
                </div>
              </div>
              <div className="relative group rounded-2xl p-[1px] bg-gradient-to-br from-indigo-400 via-violet-500 to-fuchsia-600 shadow-lg">
                <div className="rounded-2xl bg-white/90 h-full p-5 flex flex-col">
                  <span className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Últimos 28 días</span>
                  <div className="flex items-baseline gap-2"><span className="text-2xl font-bold text-gray-800">{last28Km.total.toFixed(1)}</span><span className="text-xs font-semibold text-violet-600">km</span></div>
                  <span className="text-[11px] text-gray-500 mt-1">Plan {last28Km.workouts.toFixed(1)} • Act {last28Km.activities.toFixed(1)}</span>
                  <div className="mt-3 grid grid-cols-4 gap-1">
                    {weeklyTrend.map((v, i) => { const pct = maxWeeklyTrend ? v / maxWeeklyTrend : 0; return (
                      <div key={i} className="h-12 relative overflow-hidden rounded bg-gradient-to-b from-gray-100 to-gray-50">
                        <div style={{ height: `${pct * 100}%` }} className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-fuchsia-500 to-violet-400 rounded-t transition-all" />
                        <span className="absolute inset-x-0 top-0 text-[9px] text-center text-gray-400 pt-0.5">S{i + 1}</span>
                      </div>);
                    })}
                  </div>
                </div>
              </div>
              <div className="relative group rounded-2xl p-[1px] bg-gradient-to-br from-yellow-400 via-orange-500 to-red-500 shadow-lg">
                <div className="rounded-2xl bg-white/90 h-full p-5 flex flex-col items-start">
                  <span className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Progreso plan</span>
                  {planProgress ? (
                    <div className="flex items-center gap-4 w-full">
                      <div className="relative w-20 h-20">
                        <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-orange-300 to-red-300 opacity-30" />
                        <div className="absolute inset-0 rounded-full bg-white flex items-center justify-center text-xs font-semibold text-gray-600">{planProgress.percent}%</div>
                        <svg className="absolute inset-0" viewBox="0 0 36 36">
                          <path className="text-gray-200" stroke="currentColor" strokeWidth="3.5" fill="none" d="M18 2.5a15.5 15.5 0 1 1 0 31 15.5 15.5 0 0 1 0-31Z" />
                          <path strokeLinecap="round" stroke="url(#gradProg)" strokeWidth="3.5" fill="none" strokeDasharray="97" strokeDashoffset={97 - (97 * planProgress.percent) / 100} d="M18 2.5a15.5 15.5 0 1 1 0 31 15.5 15.5 0 0 1 0-31Z" />
                          <defs><linearGradient id="gradProg" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stopColor="#f59e0b" /><stop offset="100%" stopColor="#ef4444" /></linearGradient></defs>
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-gray-600">Entrenamientos completados</p>
                        <p className="text-sm font-semibold text-gray-800 mt-1">{planProgress.done} / {planProgress.total}</p>
                        <div className="mt-2 h-1.5 w-full rounded bg-gray-200 overflow-hidden"><div className="h-full bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500" style={{ width: `${planProgress.percent}%` }} /></div>
                      </div>
                    </div>
                  ) : <p className="text-gray-400 text-sm">No hay un plan activo.</p>}
                </div>
              </div>
            </div>

            {/* Intensity distribution panel */}
            {intensityWeeks.some(w => w.total > 0) && (
              <div className="relative rounded-2xl p-[1px] bg-gradient-to-br from-emerald-300 via-teal-200 to-cyan-300 shadow">
                <div className="rounded-2xl bg-white/90 backdrop-blur-sm p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-800">Distribución de intensidad polarizada</h2>
                      <p className="text-xs text-gray-500 mt-0.5">Entrenamientos completados · últimas 4 semanas</p>
                    </div>
                    <div className="flex items-center gap-4 text-xs flex-wrap">
                      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-400 inline-block shrink-0" /><span className="text-gray-600">Z1 Fácil/Largo</span></span>
                      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-orange-400 inline-block shrink-0" /><span className="text-gray-600">Z4 Umbral/Tempo</span></span>
                      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-400 inline-block shrink-0" /><span className="text-gray-600">Z5 Series</span></span>
                    </div>
                  </div>
                  <div className="space-y-4">
                    {intensityWeeks.map((week, idx) => {
                      if (week.total === 0) return (
                        <div key={idx} className="flex items-center gap-3">
                          <span className="text-[11px] text-gray-400 w-24 text-right shrink-0">{week.label}</span>
                          <div className="flex-1 h-4 rounded-full bg-gray-100" />
                          <span className="text-[11px] text-gray-400 w-12 shrink-0" />
                          <span className="text-[11px] text-gray-300 w-14 text-right shrink-0">sin datos</span>
                        </div>
                      );
                      const tot  = week.total;
                      const pZ1  = Math.round(week.kmZ1 / tot * 100);
                      const pZ4  = Math.round(week.kmZ4 / tot * 100);
                      const pZ5  = Math.round(week.kmZ5 / tot * 100);
                      const onTarget = pZ1 >= 80;
                      return (
                        <div key={idx}>
                          <div className="flex items-center gap-3">
                            <span className="text-[11px] text-gray-500 w-24 text-right shrink-0">{week.label}</span>
                            <div className="flex-1 h-4 rounded-full overflow-hidden bg-gray-100 flex">
                              {week.kmZ1 > 0 && <div className="h-full bg-emerald-400 transition-all" style={{ width: `${(week.kmZ1 / tot) * 100}%` }} title={`Z1: ${week.kmZ1.toFixed(1)} km`} />}
                              {week.kmZ4 > 0 && <div className="h-full bg-orange-400 transition-all" style={{ width: `${(week.kmZ4 / tot) * 100}%` }} title={`Z4: ${week.kmZ4.toFixed(1)} km`} />}
                              {week.kmZ5 > 0 && <div className="h-full bg-red-400 transition-all"    style={{ width: `${(week.kmZ5 / tot) * 100}%` }} title={`Z5: ${week.kmZ5.toFixed(1)} km`} />}
                            </div>
                            <span className="text-xs font-medium text-gray-700 w-12 text-right shrink-0">{tot.toFixed(1)} km</span>
                            <span className={`text-[10px] font-bold w-14 text-right shrink-0 ${onTarget ? 'text-emerald-600' : 'text-amber-600'}`}>
                              {pZ1}% Z1
                            </span>
                          </div>
                          <div className="flex gap-4 mt-0.5 pl-[108px] text-[10px]">
                            {week.kmZ1 > 0 && <span className="text-emerald-600">Z1 {week.kmZ1.toFixed(1)} km ({pZ1}%)</span>}
                            {week.kmZ4 > 0 && <span className="text-orange-500">Z4 {week.kmZ4.toFixed(1)} km ({pZ4}%)</span>}
                            {week.kmZ5 > 0 && <span className="text-red-500">Z5 {week.kmZ5.toFixed(1)} km ({pZ5}%)</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-5 pt-4 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-500">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    <span>
                      Objetivo <span className="font-semibold text-gray-700">polarizado / noruego</span>:
                      {' '}<span className="text-emerald-700 font-semibold">≥80% km en Z1</span> (fácil/largo) ·
                      {' '}<span className="text-orange-600 font-semibold">≤20% en Z4-Z5</span> (umbral/series)
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Fitness model: CTL / ATL / TSB */}
            {fitnessData && (
              <div className="relative rounded-2xl p-[1px] bg-gradient-to-br from-violet-300 via-purple-200 to-indigo-300 shadow">
                <div className="rounded-2xl bg-white/90 backdrop-blur-sm p-6">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-5">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-800">Forma física</h2>
                      <p className="text-xs text-gray-500 mt-0.5">Fitness crónico · fatiga aguda · balance — últimos 90 días</p>
                    </div>
                    <span className={`self-start text-xs font-bold px-3 py-1.5 rounded-full ${
                      fitnessData.tsb >  10 ? 'bg-sky-100 text-sky-700'         :
                      fitnessData.tsb >   0 ? 'bg-emerald-100 text-emerald-700' :
                      fitnessData.tsb > -15 ? 'bg-green-100 text-green-700'     :
                      fitnessData.tsb > -30 ? 'bg-amber-100 text-amber-700'     :
                                              'bg-red-100 text-red-700'
                    }`}>
                      {fitnessData.tsb >  10 ? 'Fresco · listo para competir'    :
                       fitnessData.tsb >   0 ? 'En forma'                         :
                       fitnessData.tsb > -15 ? 'Entrenando bien'                  :
                       fitnessData.tsb > -30 ? 'Carga alta · descansa pronto'     :
                                               'Riesgo sobreentrenamiento'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-center">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-indigo-500 mb-0.5">CTL</div>
                      <div className="text-2xl font-bold text-indigo-700">{fitnessData.ctl}</div>
                      <div className="text-[10px] text-indigo-400 mt-0.5">fitness crónico</div>
                    </div>
                    <div className="rounded-xl border border-orange-100 bg-orange-50 p-3 text-center">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-orange-500 mb-0.5">ATL</div>
                      <div className="text-2xl font-bold text-orange-600">{fitnessData.atl}</div>
                      <div className="text-[10px] text-orange-400 mt-0.5">fatiga aguda</div>
                    </div>
                    <div className={`rounded-xl border p-3 text-center ${fitnessData.tsb >= 0 ? 'border-emerald-100 bg-emerald-50' : 'border-amber-100 bg-amber-50'}`}>
                      <div className={`text-[10px] font-semibold uppercase tracking-wide mb-0.5 ${fitnessData.tsb >= 0 ? 'text-emerald-500' : 'text-amber-500'}`}>TSB</div>
                      <div className={`text-2xl font-bold ${fitnessData.tsb >= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {fitnessData.tsb > 0 ? '+' : ''}{fitnessData.tsb}
                      </div>
                      <div className={`text-[10px] mt-0.5 ${fitnessData.tsb >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>balance</div>
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-xl px-3 pt-2 pb-1">
                    <div className="flex justify-between text-[9px] text-gray-400 mb-0.5">
                      <span>90 días atrás</span>
                      <span className="flex items-center gap-3">
                        <span className="flex items-center gap-1"><span className="w-2 h-px bg-indigo-400 inline-block" />CTL</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-px bg-orange-400 inline-block" />ATL</span>
                      </span>
                      <span>hoy</span>
                    </div>
                    <FitnessChart data={fitnessData.history} />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-3">
                    CTL = media ponderada 42 días · ATL = media ponderada 7 días · TSB = CTL − ATL · basado en km × factor de zona (Z1×1 / Z4×2.5 / Z5×3.5)
                  </p>
                </div>
              </div>
            )}

            {/* Main sections */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
              <div className="lg:col-span-2 space-y-8">
                <div className="relative group rounded-2xl p-[1px] bg-gradient-to-br from-gray-200 via-gray-100 to-gray-200 shadow">
                  <div className="rounded-2xl bg-white/90 backdrop-blur-sm p-6">
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">Entrenamientos de esta semana <span className="text-xs font-normal text-gray-400">(lunes-domingo)</span></h2>
                      <button onClick={loadData} className="text-xs font-medium text-orange-600 hover:text-orange-700">Refrescar</button>
                    </div>
                    {weekWorkouts.length === 0 && <p className="text-sm text-gray-500">No hay entrenamientos en esta semana.</p>}
                    <ul className="divide-y divide-gray-100">
                      {weekWorkouts.map(w => (
                        <li key={w.id} className="py-4 flex items-start justify-between gap-6">
                          <div>
                            <p className="text-sm font-medium text-gray-700">{new Date(w.workout_date).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
                            <p className="text-sm text-gray-800 leading-snug max-w-prose">{w.description}</p>
                            {w.distance_km && <p className="text-[11px] inline-block mt-1 px-2 py-0.5 rounded bg-orange-50 text-orange-600 font-medium">{w.distance_km} km</p>}
                          </div>
                          <button onClick={() => toggleWorkout(w.id, w.is_completed)} disabled={marking === w.id} className={`px-3 py-1.5 rounded-full text-[11px] font-semibold shadow-sm transition-colors ${w.is_completed ? 'bg-green-600 text-white hover:bg-green-500' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>{marking === w.id ? '...' : (w.is_completed ? 'Hecho' : 'Marcar')}</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="relative group rounded-2xl p-[1px] bg-gradient-to-br from-orange-300 via-orange-200 to-yellow-200 shadow">
                  <div className="rounded-2xl bg-white/90 backdrop-blur-sm p-6">
                    <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">Próximos entrenos {planProgress && <span className="text-[11px] font-normal text-gray-400">(siguientes 3)</span>}</h2>
                    {upcomingWorkouts.length === 0 && <p className="text-sm text-gray-500">No hay próximos entrenos (o no hay plan).</p>}
                    <ul className="space-y-3">
                      {upcomingWorkouts.map(w => (
                        <li key={w.id} className="flex justify-between items-start border border-orange-100 rounded-xl p-4 bg-gradient-to-br from-orange-50 to-white shadow-sm">
                          <div>
                            <p className="text-sm font-medium text-gray-700">{new Date(w.workout_date).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })}</p>
                            <p className="text-sm text-gray-800 leading-snug max-w-prose">{w.description}</p>
                            {w.distance_km && <p className="text-[11px] inline-block mt-2 px-2 py-0.5 rounded bg-orange-100/60 text-orange-600 font-medium">{w.distance_km} km</p>}
                          </div>
                          <button onClick={() => toggleWorkout(w.id, w.is_completed)} disabled={marking === w.id} className={`px-3 py-1.5 rounded-full text-[11px] font-semibold shadow-sm transition-colors ${w.is_completed ? 'bg-green-600 text-white hover:bg-green-500' : 'bg-orange-200 text-gray-800 hover:bg-orange-300'}`}>{w.is_completed ? 'Hecho' : 'Marcar'}</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <div className="space-y-8 xl:col-span-1">
                <div className="relative group rounded-2xl p-[1px] bg-gradient-to-br from-blue-300 via-cyan-200 to-sky-200 shadow">
                  <div className="rounded-2xl bg-white/90 backdrop-blur-sm p-6">
                    <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">Actividad reciente</h2>
                    {recentActivities.length === 0 && <p className="text-sm text-gray-500">Sin actividades recientes.</p>}
                    <ul className="space-y-3 text-sm">
                      {recentActivities.map(a => (
                        <li key={a.activity_id} className="flex justify-between items-center bg-gradient-to-r from-sky-50 to-white border border-sky-100 rounded-xl px-3 py-2">
                          <div className="pr-3">
                            <p className="font-medium text-gray-700 leading-snug line-clamp-1" title={a.name}>{a.name || 'Actividad'}</p>
                            <p className="text-[11px] text-gray-500">{new Date(a.start_date).toLocaleDateString()} • {a.sport_type || 'Run'}</p>
                            <a href={`https://www.strava.com/activities/${a.activity_id}`} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold underline" style={{ color: '#FC5200' }}>
                              Ver en Strava
                            </a>
                          </div>
                          <span className="text-xs font-semibold text-sky-600 bg-sky-100 px-2 py-1 rounded-full">{a.distance_m ? (a.distance_m / 1000).toFixed(1) : '—'} km</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="relative group rounded-2xl p-[1px] bg-gradient-to-br from-slate-300 via-slate-200 to-slate-300 shadow">
                  <div className="rounded-2xl bg-white/90 backdrop-blur-sm p-6">
                    <h2 className="text-lg font-semibold text-gray-800 mb-4">Consejos rápidos</h2>
                    <ul className="space-y-3 text-xs text-gray-600">
                      <li className="flex gap-2"><span className="text-orange-500">⚡</span><span>Marca tus entrenos para ver la evolución del plan.</span></li>
                      <li className="flex gap-2"><span className="text-sky-500">🔄</span><span>Sincroniza Strava tras cada sesión clave.</span></li>
                      <li className="flex gap-2"><span className="text-emerald-500">🛠️</span><span>Ajusta la disponibilidad y regenera si cambian tus semanas.</span></li>
                      <li className="flex gap-2"><span className="text-purple-500">🧠</span><span>Lee la explicación de cada workout para entender la intención.</span></li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
};

export default HomePage;
