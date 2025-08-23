import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

interface Race { id: number; name: string; date: string; }
interface Workout { id: number; workout_date: string; description: string; is_completed: boolean; distance_km?: number | null; plan_id?: number; }
interface Activity { activity_id: string; start_date: string; name: string; distance_m?: number | null; sport_type?: string; }

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
  const [marking, setMarking] = useState<number | null>(null);
  const [weeklyTrend, setWeeklyTrend] = useState<number[]>([]);

  const iso = (d: Date) => d.toISOString().substring(0,10);
  const weekStartISO = () => {
    const d = new Date();
    const day = d.getDay() || 7; // 1=Mon .. 7=Sun
    if (day !== 1) d.setDate(d.getDate() - (day - 1));
    d.setHours(0,0,0,0);
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
      const todayISO = iso(new Date());
      const { data: races } = await supabase.from('races').select('*').eq('user_id', user.id).gte('date', todayISO).order('date', { ascending: true }).limit(1);
      const nr = races?.[0] || null;
      setNextRace(nr);

      let planId: number | null = null;
      if (nr) {
        const { data: planRow } = await supabase.from('training_plans').select('id').eq('user_id', user.id).eq('race_id', nr.id).maybeSingle();
        planId = planRow?.id || null;
      }

      const wStart = weekStartISO();
      const wEnd = weekEndISO();
      const { data: workoutsWeek } = await supabase.from('workouts').select('id, workout_date, description, is_completed, distance_km, plan_id').eq('user_id', user.id).gte('workout_date', wStart).lte('workout_date', wEnd).order('workout_date');
      setWeekWorkouts(workoutsWeek || []);

      const since7 = iso(new Date(Date.now()-7*86400000));
      const since28 = iso(new Date(Date.now()-28*86400000));
      const { data: activities7 } = await supabase.from('strava_activities').select('activity_id, start_date, name, distance_m, sport_type').eq('user_id', user.id).gte('start_date', since7).order('start_date', { ascending: false }).limit(5);
      setRecentActivities(activities7 || []);
      const { data: activities28 } = await supabase.from('strava_activities').select('distance_m, start_date').eq('user_id', user.id).gte('start_date', since28);
      const { data: workouts28 } = await supabase.from('workouts').select('distance_km, workout_date').eq('user_id', user.id).gte('workout_date', since28);

      const planKmWeek = (workoutsWeek||[]).reduce((a,w)=> a + (w.distance_km||0),0);
      const actKmWeek = (activities7||[]).filter(a=>a.start_date>=wStart).reduce((a,a2)=> a + ((a2.distance_m||0)/1000),0);
      setWeeklyKm({ plan: planKmWeek, activities: actKmWeek, total: planKmWeek + actKmWeek });

      const actKm28 = (activities28||[]).reduce((a,a2)=> a + ((a2.distance_m||0)/1000),0);
      const wKm28 = (workouts28||[]).reduce((a,w)=> a + (w.distance_km||0),0);
      setLast28Km({ activities: actKm28, workouts: wKm28, total: actKm28 + wKm28 });

      const weekBlocks:number[] = [];
      for (let i=3;i>=0;i--) {
        const start = new Date(Date.now() - (i+1)*7*86400000);
        const end = new Date(start.getTime()+7*86400000);
        const sISO = iso(start); const eISO = iso(end);
        const wkAct = (activities28||[]).filter(a=>a.start_date>=sISO && a.start_date<eISO).reduce((a,a2)=>a+((a2.distance_m||0)/1000),0);
        const wkW = (workouts28||[]).filter(w=>w.workout_date>=sISO && w.workout_date<eISO).reduce((a,w2)=>a+(w2.distance_km||0),0);
        weekBlocks.push(parseFloat((wkAct+wkW).toFixed(1)));
      }
      setWeeklyTrend(weekBlocks);

      if (planId) {
        const { data: planWorkouts } = await supabase.from('workouts').select('id,is_completed,workout_date,description,distance_km,plan_id').eq('plan_id', planId);
        const total = planWorkouts?.length||0;
        const done = (planWorkouts||[]).filter(w=>w.is_completed).length;
        setPlanProgress({ total, done, percent: total? Math.round(done/total*100):0 });
        const upcoming = (planWorkouts||[]).filter(w=> w.workout_date>=todayISO && !w.is_completed).sort((a,b)=>a.workout_date.localeCompare(b.workout_date)).slice(0,3) as Workout[];
        setUpcomingWorkouts(upcoming);
      } else {
        setPlanProgress(null);
        setUpcomingWorkouts([]);
      }
    } catch(e){
      console.warn('Error dashboard', e);
    } finally { setLoading(false); }
  }, [user]);

  useEffect(()=>{ loadData(); },[loadData]);

  const daysToRace = nextRace ? Math.max(0, Math.ceil((new Date(nextRace.date).getTime()-Date.now())/86400000)) : null;

  const sparklinePath = useMemo(()=>{
    if(!weeklyTrend.length) return '';
    const max = Math.max(...weeklyTrend,1); const w=100; const h=30;
    return weeklyTrend.map((v,i)=>{ const x=(i/(weeklyTrend.length-1))*w; const y= h - (v/max)*h; return `${i?'L':'M'}${x},${y}`;}).join(' ');
  },[weeklyTrend]);
  const maxWeeklyTrend = useMemo(()=> weeklyTrend.length? Math.max(...weeklyTrend):0,[weeklyTrend]);

  const toggleWorkout = async (id:number, cur:boolean) => {
    setMarking(id);
    try {
      const { error } = await supabase.from('workouts').update({ is_completed: !cur }).eq('id', id);
      if(!error){
        setWeekWorkouts(ws=>ws.map(w=>w.id===id?{...w,is_completed:!cur}:w));
        setUpcomingWorkouts(ws=>ws.map(w=>w.id===id?{...w,is_completed:!cur}:w));
        loadData();
      }
    } finally { setMarking(null);} };

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
                        <div className="text-xs font-medium text-gray-500 leading-tight">días para competir<br/><span className="text-orange-600 font-semibold">¡Vamos!</span></div>
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
                    <div className="flex justify-between text-[10px] text-gray-400 mt-1">{weeklyTrend.map((v,i)=>(<span key={i}>{v}</span>))}</div>
                  </div>
                </div>
              </div>
              <div className="relative group rounded-2xl p-[1px] bg-gradient-to-br from-indigo-400 via-violet-500 to-fuchsia-600 shadow-lg">
                <div className="rounded-2xl bg-white/90 h-full p-5 flex flex-col">
                  <span className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Últimos 28 días</span>
                  <div className="flex items-baseline gap-2"><span className="text-2xl font-bold text-gray-800">{last28Km.total.toFixed(1)}</span><span className="text-xs font-semibold text-violet-600">km</span></div>
                  <span className="text-[11px] text-gray-500 mt-1">Plan {last28Km.workouts.toFixed(1)} • Act {last28Km.activities.toFixed(1)}</span>
                  <div className="mt-3 grid grid-cols-4 gap-1">
                    {weeklyTrend.map((v,i)=>{ const pct = maxWeeklyTrend? v/maxWeeklyTrend : 0; return (
                      <div key={i} className="h-12 relative overflow-hidden rounded bg-gradient-to-b from-gray-100 to-gray-50">
                        <div style={{height:`${pct*100}%`}} className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-fuchsia-500 to-violet-400 rounded-t transition-all" />
                        <span className="absolute inset-x-0 top-0 text-[9px] text-center text-gray-400 pt-0.5">S{i+1}</span>
                      </div>);})}
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
                          <path strokeLinecap="round" stroke="url(#gradProg)" strokeWidth="3.5" fill="none" strokeDasharray="97" strokeDashoffset={97 - (97*planProgress.percent)/100} d="M18 2.5a15.5 15.5 0 1 1 0 31 15.5 15.5 0 0 1 0-31Z" />
                          <defs><linearGradient id="gradProg" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stopColor="#f59e0b" /><stop offset="100%" stopColor="#ef4444" /></linearGradient></defs>
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-gray-600">Entrenamientos completados</p>
                        <p className="text-sm font-semibold text-gray-800 mt-1">{planProgress.done} / {planProgress.total}</p>
                        <div className="mt-2 h-1.5 w-full rounded bg-gray-200 overflow-hidden"><div className="h-full bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500" style={{width:`${planProgress.percent}%`}} /></div>
                      </div>
                    </div>
                  ) : <p className="text-gray-400 text-sm">No hay un plan activo.</p>}
                </div>
              </div>
            </div>

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
                            <p className="text-sm font-medium text-gray-700">{new Date(w.workout_date).toLocaleDateString('es-ES', { weekday:'short', day:'numeric', month:'short' })}</p>
                            <p className="text-sm text-gray-800 leading-snug max-w-prose">{w.description}</p>
                            {w.distance_km && <p className="text-[11px] inline-block mt-1 px-2 py-0.5 rounded bg-orange-50 text-orange-600 font-medium">{w.distance_km} km</p>}
                          </div>
                          <button onClick={()=>toggleWorkout(w.id, w.is_completed)} disabled={marking===w.id} className={`px-3 py-1.5 rounded-full text-[11px] font-semibold shadow-sm transition-colors ${w.is_completed ? 'bg-green-600 text-white hover:bg-green-500' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>{marking===w.id? '...' : (w.is_completed? 'Hecho':'Marcar')}</button>
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
                            <p className="text-sm font-medium text-gray-700">{new Date(w.workout_date).toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'short' })}</p>
                            <p className="text-sm text-gray-800 leading-snug max-w-prose">{w.description}</p>
                            {w.distance_km && <p className="text-[11px] inline-block mt-2 px-2 py-0.5 rounded bg-orange-100/60 text-orange-600 font-medium">{w.distance_km} km</p>}
                          </div>
                          <button onClick={()=>toggleWorkout(w.id, w.is_completed)} disabled={marking===w.id} className={`px-3 py-1.5 rounded-full text-[11px] font-semibold shadow-sm transition-colors ${w.is_completed ? 'bg-green-600 text-white hover:bg-green-500' : 'bg-orange-200 text-gray-800 hover:bg-orange-300'}`}>{w.is_completed? 'Hecho':'Marcar'}</button>
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
                            <a
                              href={`https://www.strava.com/activities/${a.activity_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] font-semibold underline"
                              style={{ color: '#FC5200' }}
                            >
                              Ver en Strava
                            </a>
                          </div>
                          <span className="text-xs font-semibold text-sky-600 bg-sky-100 px-2 py-1 rounded-full">{a.distance_m ? (a.distance_m/1000).toFixed(1) : '—'} km</span>
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
