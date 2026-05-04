import { useState, useEffect, useCallback } from 'react';
import { Calendar, momentLocalizer, Views, View } from 'react-big-calendar';
import type { Event } from 'react-big-calendar';
import moment from 'moment';
import 'moment/locale/es';
import { Race } from '../pages/RacesPage';
import { collection, getDocs, doc, query, where, orderBy, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebaseClient';
import { useAuth } from '../context/AuthContext';

moment.locale('es');
const localizer = momentLocalizer(moment);

interface WorkoutEvent {
  id: string;
  plan_id?: string;
  workout_date: string;
  description: string;
  is_completed: boolean;
  explanation_json?: any;
}

interface RaceCalendarProps {
  races: Race[];
}

const RaceCalendar = ({ races }: RaceCalendarProps) => {
  const { user } = useAuth();
  const [date, setDate] = useState(new Date());
  const [view, setView] = useState<View>(Views.MONTH);
  const [workouts, setWorkouts] = useState<WorkoutEvent[]>([]);
  const [loadingWorkouts, setLoadingWorkouts] = useState(false);
  const [activities, setActivities] = useState<any[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  // Filtros de visibilidad
  const [showRaces, setShowRaces] = useState(true);
  const [showWorkouts, setShowWorkouts] = useState(true);
  const [showActivities, setShowActivities] = useState(true);
  const [modalWorkout, setModalWorkout] = useState<any | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Helper para clasificar tipo de entrenamiento
  const classifyWorkout = (desc: string) => {
    const d = (desc || '').toLowerCase();
    if (/series|interval|intervalo/.test(d)) return 'series';
    if (/tempo/.test(d)) return 'tempo';
    if (/largo|tirada larga|long run/.test(d)) return 'largo';
    if (/descanso|rest/.test(d)) return 'descanso';
    return 'otro';
  };

  const loadWorkouts = useCallback(async () => {
    if (!user) return;
    setLoadingWorkouts(true);
    try {
      const snap = await getDocs(collection(db, 'users', user.uid, 'workouts'));
      setWorkouts(snap.docs.map(d => ({ id: d.id, ...d.data() } as WorkoutEvent)));
    } catch (e) {
      console.warn('Error loading workouts', e);
    }
    setLoadingWorkouts(false);
  }, [user]);

  useEffect(() => { loadWorkouts(); }, [loadWorkouts]);

  // Cargar actividades Strava (últimos 90 días)
  const loadActivities = useCallback(async () => {
    if (!user) return;
    setLoadingActivities(true);
    try {
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
      const q = query(
        collection(db, 'users', user.uid, 'strava_activities'),
        where('start_date', '>=', since),
        orderBy('start_date', 'asc'),
      );
      const snap = await getDocs(q);
      setActivities(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.warn('Error loading activities', e);
    }
    setLoadingActivities(false);
  }, [user]);

  useEffect(() => { loadActivities(); }, [loadActivities]);

  // Escuchar eventos globales de refresco (generados después de crear un plan)
  useEffect(() => {
    const handler = () => loadWorkouts();
    window.addEventListener('workouts-changed', handler);
    return () => window.removeEventListener('workouts-changed', handler);
  }, [loadWorkouts]);

  const toggleCompleted = async (workoutId: string, current: boolean) => {
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid, 'workouts', workoutId), {
      is_completed: !current,
    });
    setWorkouts(ws => ws.map(w => w.id === workoutId ? { ...w, is_completed: !current } : w));
  };

  const syncStrava = async (opts: { full?: boolean; reset?: boolean } = {}) => {
    if (!user) return;
    try {
      const syncStravaFn = httpsCallable(functions, 'syncStrava');
      const res = await syncStravaFn(opts);
      const data = res.data as any;
      await loadWorkouts();
      await loadActivities();
      window.dispatchEvent(new Event('workouts-changed'));
      if (data) {
        alert(`Strava sync: nuevas ${data.importedNew}, fetched ${data.fetchedTotal}, matched ${data.matchedWorkouts}`);
      } else {
        alert('Sincronización completada');
      }
    } catch (e: any) {
      console.warn('Error sync-strava', e);
      alert(`Error sincronizando Strava: ${e.message || e}`);
    }
  };

  const events: Event[] = [
    ...(showRaces ? races.map(race => ({
      title: `🏁 ${race.name}`,
      start: new Date(race.date),
      end: new Date(race.date),
      allDay: true,
      resource: { type: 'race', race },
    })) : []),
    ...(showWorkouts ? workouts.map(w => ({
      title: `${w.is_completed ? '✅' : '🏃'} ${w.description}`,
      start: new Date(w.workout_date),
      end: new Date(w.workout_date),
      allDay: true,
      resource: { type: 'workout', workout: w, workoutType: classifyWorkout(w.description) },
    })) : []),
    ...(showActivities ? activities.map(a => ({
      title: `📊 ${(a.distance_m ? (a.distance_m / 1000).toFixed(1) + 'k ' : '')}${a.name || 'Actividad'}`,
      start: new Date(a.start_date),
      end: new Date(a.start_date),
      allDay: true,
      resource: { type: 'activity', activity: a },
    })) : [])
  ];

  const eventStyleGetter = (event: any) => {
    let backgroundColor = '#3182ce';
    if (event.resource?.type === 'race') backgroundColor = '#6366f1';
    if (event.resource?.type === 'activity') backgroundColor = '#0ea5e9';
    if (event.resource?.type === 'workout') {
      const wt = event.resource.workoutType;
      if (event.resource.workout.is_completed) {
        backgroundColor = '#16a34a';
      } else {
        switch (wt) {
          case 'series': backgroundColor = '#9333ea'; break;
          case 'tempo': backgroundColor = '#2563eb'; break;
          case 'largo': backgroundColor = '#0d9488'; break;
          case 'descanso': backgroundColor = '#6b7280'; break;
          default: backgroundColor = '#f59e0b';
        }
      }
    }
    return { style: { backgroundColor, borderRadius: '5px', opacity: 0.92, color: 'white', border: 0, display: 'block', fontSize: '0.72rem' } };
  };

  // Resumen semanal (kms totales)
  const weekStart = moment(date).startOf('isoWeek');
  const weekEnd = moment(date).endOf('isoWeek');
  const workoutsWeekKm = workouts.reduce((acc, w: any) => {
    if (moment(w.workout_date).isBetween(weekStart, weekEnd, undefined, '[]') && (w as any).distance_km) {
      return acc + ((w as any).distance_km || 0);
    }
    return acc;
  }, 0);
  const activitiesWeekKm = activities.reduce((acc, a: any) => {
    if (moment(a.start_date).isBetween(weekStart, weekEnd, undefined, '[]')) {
      return acc + (a.distance_m ? a.distance_m / 1000 : 0);
    }
    return acc;
  }, 0);
  const totalWeekKm = workoutsWeekKm + activitiesWeekKm;

  const onSelectEvent = (event: any) => {
    if (event.resource?.type === 'workout') {
      const w = event.resource.workout as WorkoutEvent;
      setModalWorkout(w);
      setShowModal(true);
    } else if (event.resource?.type === 'activity') {
      const a = event.resource.activity as any;
      window.open(`https://www.strava.com/activities/${a.activity_id}`, '_blank', 'noopener');
    }
  };

  return (
    <div className="h-[650px] p-3 bg-gray-50 rounded-lg flex flex-col text-gray-800">
      <div className="flex flex-col gap-2 mb-2 text-xs sm:text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            {loadingWorkouts ? <span className="text-gray-500">Entrenamientos...</span> : <span className="text-gray-500">Workouts: {workouts.length}</span>}
            {loadingActivities ? <span className="text-gray-500">Actividades...</span> : <span className="text-gray-500">Act: {activities.length}</span>}
            <span className="text-gray-600 font-medium">Semana {weekStart.format('DD/MM')} - {weekEnd.format('DD/MM')}:</span>
            <span className="text-gray-700">Plan {workoutsWeekKm.toFixed(1)} km</span>
            <span className="text-gray-700">Strava {activitiesWeekKm.toFixed(1)} km</span>
            <span className="text-gray-900 font-semibold">Total {totalWeekKm.toFixed(1)} km</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => syncStrava()} className="px-2 py-1 bg-lime-400 text-white rounded text-[10px] sm:text-xs hover:bg-lime-500" title="Sincronizar actividades recientes de Strava">Sync</button>
            <button onClick={() => syncStrava({ full: true })} className="px-2 py-1 bg-lime-500 text-white rounded text-[10px] sm:text-xs hover:bg-lime-600">Full</button>
            <button onClick={() => syncStrava({ reset: true, full: true })} className="px-2 py-1 bg-lime-600 text-white rounded text-[10px] sm:text-xs hover:bg-orange-800">Reset</button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[11px] sm:text-xs">
          <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={showRaces} onChange={(e) => setShowRaces(e.target.checked)} /> Carreras</label>
          <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={showWorkouts} onChange={(e) => setShowWorkouts(e.target.checked)} /> Plan</label>
          <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={showActivities} onChange={(e) => setShowActivities(e.target.checked)} /> Actividades</label>
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: '#9333ea' }}></span>Series</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: '#2563eb' }}></span>Tempo</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: '#0d9488' }}></span>Largo</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: '#6b7280' }}></span>Descanso</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: '#f59e0b' }}></span>Otro</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: '#16a34a' }}></span>Completado</span>
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: '100%' }}
          views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
          date={date}
          view={view}
          onNavigate={(newDate) => setDate(newDate)}
          onView={(newView) => setView(newView)}
          onSelectEvent={onSelectEvent}
          messages={{
            next: "Siguiente",
            previous: "Anterior",
            today: "Hoy",
            month: "Mes",
            week: "Semana",
            day: "Día",
            agenda: "Agenda"
          }}
          eventPropGetter={eventStyleGetter}
        />
      </div>
      <p className="text-xs text-gray-400 mt-2">Filtros arriba. Click en un workout para ver detalle. Las actividades abren "Ver en Strava".</p>
      {showModal && modalWorkout && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 relative">
            <button onClick={() => setShowModal(false)} className="absolute top-2 right-2 text-gray-400 hover:text-gray-600">✕</button>
            <h3 className="text-xl font-bold text-gray-800 mb-2">Detalle Entrenamiento</h3>
            <p className="text-sm text-gray-500 mb-2">{new Date(modalWorkout.workout_date).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            <p className="text-gray-800 font-medium mb-4">{modalWorkout.description}</p>
            {modalWorkout.explanation_json && (
              <div className="space-y-3 text-sm">
                {modalWorkout.explanation_json.type && <p><span className="font-semibold">Tipo:</span> {modalWorkout.explanation_json.type}</p>}
                {modalWorkout.explanation_json.purpose && <p><span className="font-semibold">Objetivo:</span> {modalWorkout.explanation_json.purpose}</p>}
                {modalWorkout.explanation_json.details && <p><span className="font-semibold">Cómo hacerlo:</span> {modalWorkout.explanation_json.details}</p>}
                {modalWorkout.explanation_json.intensity && <p><span className="font-semibold">Intensidad:</span> {modalWorkout.explanation_json.intensity}</p>}
              </div>
            )}
            {!modalWorkout.explanation_json && <p className="text-sm text-gray-500">Sin explicación detallada disponible.</p>}
            <div className="mt-6 flex justify-between items-center">
              <button
                onClick={() => { toggleCompleted(modalWorkout.id, modalWorkout.is_completed); setModalWorkout({ ...modalWorkout, is_completed: !modalWorkout.is_completed }); }}
                className="px-3 py-2 text-xs rounded bg-green-600 text-white hover:bg-green-700"
              >
                {modalWorkout.is_completed ? 'Marcar incompleto' : 'Marcar completado'}
              </button>
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-lime-400 text-white rounded-lg hover:bg-lime-500 text-sm font-semibold">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RaceCalendar;
