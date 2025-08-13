import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { Race } from './RacesPage';

// Definimos los tipos para el plan y los entrenamientos
interface Workout {
  id: number;
  workout_date: string;
  description: string;
  is_completed: boolean;
  distance_km?: number | null;
  duration_min?: number | null;
  explanation_json?: any;
}

interface TrainingPlan {
  id: number;
  goal: string;
  workouts: Workout[];
  model?: string | null;
  used_fallback?: boolean | null;
  attempts?: number | null;
  openai_error?: string | null;
}

const TrainingPlanPage = () => {
  const { user } = useAuth();
  const [races, setRaces] = useState<Race[]>([]);
  const [selectedRace, setSelectedRace] = useState('');
  const [goal, setGoal] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [versionPreview, setVersionPreview] = useState<any | null>(null);
  const [modalWorkout, setModalWorkout] = useState<any | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const fetchRaces = async () => {
      if (!user) return;
      const { data, error } = await supabase
        .from('races')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: true });
      
      if (error) {
        console.error('Error fetching races:', error);
      } else {
        setRaces(data);
      }
    };
    fetchRaces();
  }, [user]);

  const fetchPlanForRace = useCallback(async (raceId: string) => {
    if (!user || !raceId) return;
    setLoadingPlan(true);
    setPlan(null);

    try {
      const { data: planData, error: planError } = await supabase
        .from('training_plans')
        .select('id, goal, model, used_fallback, attempts, openai_error')
        .eq('user_id', user.id)
        .eq('race_id', raceId)
        .maybeSingle(); // Usar maybeSingle() en lugar de single()

      if (planError) {
        console.warn('Warning fetching training plan:', planError);
        return; // No mostrar error, simplemente no hay plan
      }

      if (!planData) {
        return; // No hay plan, es normal
      }

      const { data: workoutsData, error: workoutsError } = await supabase
        .from('workouts')
        .select('*')
        .eq('plan_id', planData.id)
        .order('workout_date', { ascending: true });

      if (workoutsError) {
        console.warn('Warning fetching workouts:', workoutsError);
        return;
      }

      setPlan({ ...planData, workouts: workoutsData });

      // Cargar versiones
      setLoadingVersions(true);
      const { data: vers } = await supabase
        .from('training_plan_versions')
        .select('id, generated_at, model, used_fallback, attempts')
        .eq('plan_id', planData.id)
        .order('generated_at', { ascending: false });
      setVersions(vers || []);
      setLoadingVersions(false);

    } catch (error) {
      console.warn('Error fetching training plan:', error);
      // No mostramos error al usuario, simplemente no hay plan
    } finally {
      setLoadingPlan(false);
    }
  }, [user]);

  useEffect(() => {
    if (selectedRace) {
      fetchPlanForRace(selectedRace);
    } else {
      setPlan(null);
    }
  }, [selectedRace, fetchPlanForRace]);

  const handleGeneratePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedRace) return;

    setLoading(true);

    try {
      const selectedRaceDetails = races.find(r => r.id === parseInt(selectedRace, 10));
      if (!selectedRaceDetails) throw new Error('Carrera no encontrada');

      console.log('Calling Edge Function with:', { race: selectedRaceDetails, goal });

      // Llamar a la Edge Function que contiene la IA
      const { data: functionResponse, error: functionError } = await supabase.functions.invoke('generate-plan', {
        body: {
          race: selectedRaceDetails,
          goal: goal,
        },
      });

      console.log('Edge Function response:', functionResponse, functionError);

      if (functionError) {
        console.error('Edge Function error:', functionError);
        throw new Error(`Error en la función: ${functionError.message || 'Error desconocido'}`);
      }

      if (!functionResponse?.plan) {
        console.error('Invalid response:', functionResponse);
        throw new Error('Respuesta inválida de la IA');
      }

      // Primero eliminar cualquier plan existente para esta carrera
      await supabase
        .from('training_plans')
        .delete()
        .eq('user_id', user.id)
        .eq('race_id', parseInt(selectedRace, 10));

      // 1. Crear el plan de entrenamiento
      const meta = functionResponse.meta || {};
      const { data: planData, error: planError } = await supabase
        .from('training_plans')
        .insert({
          user_id: user.id,
          race_id: parseInt(selectedRace, 10),
          goal: goal,
          model: meta.model || null,
          used_fallback: meta.fallback ?? null,
          attempts: meta.attempts ?? null,
          openai_error: meta.openAiError || meta.openaiError || null,
        })
        .select()
        .single();

      if (planError) {
        console.error('Error creating plan:', planError);
        throw new Error(`Error creando el plan: ${planError.message}`);
      }

      // 2. Preparar y guardar los entrenamientos generados por la IA
      // Parse distancia ("10km", "10 km", "12.5k") y duración ("45 min", "30m")
      const distRegex = /(\d+(?:[.,]\d+)?)\s?(?:km|k)\b/i;
      const durRegex = /(\d{1,3})\s?(?:min|mins|m)\b/i;
    const workoutsToInsert = functionResponse.plan.map((w: any) => {
        const desc: string = w.description || '';
        const dMatch = desc.match(distRegex);
        const distance_km = dMatch ? parseFloat(dMatch[1].replace(',', '.')) : null;
        const tMatch = desc.match(durRegex);
        const duration_min = tMatch ? parseInt(tMatch[1], 10) : null;
        return {
          user_id: user.id,
          plan_id: planData.id,
          workout_date: w.date,
          description: desc,
          distance_km,
          duration_min,
      explanation_json: w.explanation || null,
        };
      });

      const { error: workoutsError } = await supabase
        .from('workouts')
        .insert(workoutsToInsert);

      if (workoutsError) {
        console.error('Error creating workouts:', workoutsError);
        throw new Error(`Error creando los entrenamientos: ${workoutsError.message}`);
      }

      // Snapshot versión inicial del plan recién creado
      await supabase.from('training_plan_versions').insert({
        plan_id: planData.id,
        user_id: user.id,
        race_id: parseInt(selectedRace, 10),
        goal: goal,
        model: meta.model || null,
        used_fallback: meta.fallback ?? null,
        attempts: meta.attempts ?? null,
        openai_error: meta.openAiError || meta.openaiError || null,
        plan_json: { workouts: functionResponse.plan }
      });

  // 3. Volver a cargar el plan desde la BD para mostrarlo
  await fetchPlanForRace(selectedRace);

  // 4. Notificar al calendario que hay nuevos workouts
  window.dispatchEvent(new Event('workouts-changed'));

      alert('¡Plan de entrenamiento generado exitosamente!');

    } catch (error) {
      console.error('Error generating plan:', error);
      alert(`Error al generar el plan: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateFromToday = async () => {
    if (!user || !plan || !selectedRace) return;
    setLoading(true);
    try {
      // Llamar nuevamente a la función IA para nueva versión completa
      const race = races.find(r => r.id === parseInt(selectedRace,10));
      if (!race) throw new Error('Carrera no encontrada');
      const { data: functionResponse, error: functionError } = await supabase.functions.invoke('generate-plan', { body: { race, goal } });
      if (functionError || !functionResponse?.plan) throw new Error(functionError?.message || 'Respuesta IA inválida');
      const meta = functionResponse.meta || {};
      // Guardar snapshot previo en versions
      await supabase.from('training_plan_versions').insert({
        plan_id: plan.id,
        user_id: user.id,
        race_id: race.id,
        goal: plan.goal,
        model: plan.model,
        used_fallback: plan.used_fallback,
        attempts: plan.attempts,
        openai_error: plan.openai_error,
        plan_json: { workouts: plan.workouts }
      });
      // Actualizar metadatos del plan
      await supabase.from('training_plans').update({
        model: meta.model || null,
        used_fallback: meta.fallback ?? null,
        attempts: meta.attempts ?? null,
        openai_error: meta.openAiError || meta.openaiError || null,
      }).eq('id', plan.id);
      // Eliminar ONLY los workouts >= hoy
      const todayISO = new Date().toISOString().substring(0,10);
      await supabase.from('workouts').delete().eq('plan_id', plan.id).gte('workout_date', todayISO);
      // Insertar nuevos (filtrando solo >= hoy)
      const distRegex = /(\d+(?:[.,]\d+)?)\s?(?:km|k)\b/i;
      const durRegex = /(\d{1,3})\s?(?:min|mins|m)\b/i;
      const toInsert = functionResponse.plan
        .filter((w: any) => w.date >= todayISO)
        .map((w: any) => {
          const desc: string = w.description || '';
          const dMatch = desc.match(distRegex);
          const distance_km = dMatch ? parseFloat(dMatch[1].replace(',', '.')) : null;
          const tMatch = desc.match(durRegex);
          const duration_min = tMatch ? parseInt(tMatch[1], 10) : null;
          return {
            user_id: user.id,
            plan_id: plan.id,
            workout_date: w.date,
            description: desc,
            distance_km,
            duration_min,
            explanation_json: w.explanation || null,
          };
        });
      if (toInsert.length) {
        await supabase.from('workouts').insert(toInsert);
      }
      await fetchPlanForRace(selectedRace);
      window.dispatchEvent(new Event('workouts-changed'));
      alert('Plan regenerado desde hoy preservando histórico.');
    } catch (err:any) {
      alert(`Error regenerando: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadVersion = async (versionId: number) => {
    if (!plan) return;
    setLoadingVersions(true);
    try {
      const { data, error } = await supabase
        .from('training_plan_versions')
        .select('*')
        .eq('id', versionId)
        .single();
      if (error) throw error;
      setVersionPreview(data);
    } catch (e) {
      console.error('Error cargando versión:', e);
      alert('No se pudo cargar la versión');
    } finally {
      setLoadingVersions(false);
    }
  };

  const handleDeletePlan = async () => {
    if (!plan) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('training_plans')
        .delete()
        .eq('id', plan.id);
      
      if (error) throw error;
      
      setPlan(null);
      setGoal('');
    } catch (error) {
      console.error('Error deleting plan:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectedRaceDetails = races.find(r => r.id === parseInt(selectedRace, 10));

  return (
    <main className="container mx-auto p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-8">Mi Plan de Entrenamiento</h1>
      
      <div className="bg-white p-8 rounded-xl shadow-lg mb-12">
        <div className="mb-6">
          <label htmlFor="race" className="block text-lg font-medium text-gray-700 mb-2">
            Selecciona una carrera para ver o crear un plan
          </label>
          <select
            id="race"
            value={selectedRace}
            onChange={(e) => setSelectedRace(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
          >
            <option value="">-- Elige una carrera --</option>
            {races.map(race => (
              <option key={race.id} value={race.id}>
                {race.name} ({new Date(race.date).toLocaleDateString()})
              </option>
            ))}
          </select>
        </div>

        {loadingPlan && <p>Cargando plan...</p>}

        {!loadingPlan && selectedRace && plan && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">Plan para {selectedRaceDetails?.name}</h2>
                <p className="text-gray-600">Objetivo: {plan.goal}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {plan.model && <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded">Modelo: {plan.model}</span>}
                  {plan.attempts != null && <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded">Intentos: {plan.attempts}</span>}
                  {plan.used_fallback && <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded">Fallback</span>}
                  {plan.openai_error && <span className="bg-red-100 text-red-600 px-2 py-1 rounded" title={plan.openai_error}>Error IA</span>}
                </div>
              </div>
              <div className="flex gap-3">
                <button
                onClick={handleDeletePlan}
                disabled={loading}
                className="bg-red-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-600 transition-colors disabled:bg-gray-400"
              >
                {loading ? 'Eliminando...' : 'Eliminar Plan'}
                </button>
                <button
                  onClick={handleRegenerateFromToday}
                  disabled={loading}
                  className="bg-blue-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-600 transition-colors disabled:bg-gray-400"
                >
                  {loading ? 'Procesando...' : 'Regenerar desde hoy'}
                </button>
              </div>
            </div>
            <ul className="space-y-4">
              {plan.workouts.map((day) => (
                <li key={day.id} className="p-4 border border-gray-200 rounded-lg flex justify-between items-start cursor-pointer hover:bg-gray-50"
                  onClick={() => { setModalWorkout(day); setShowModal(true); }}
                >
                  <span className="font-semibold text-gray-600">{new Date(day.workout_date).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                  <span className="text-gray-800">
                    {day.description}
                    {(day.distance_km || day.duration_min) && (
                      <span className="ml-2 text-xs text-gray-500">[
                        {day.distance_km && <>{day.distance_km}km</>}
                        {day.distance_km && day.duration_min && ' / '}
                        {day.duration_min && <>{day.duration_min}min</>}
                      ]</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {showModal && modalWorkout && (
              <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 relative">
                  <button onClick={()=>setShowModal(false)} className="absolute top-2 right-2 text-gray-400 hover:text-gray-600">✕</button>
                  <h3 className="text-xl font-bold text-gray-800 mb-2">Detalle del Entrenamiento</h3>
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
                  <div className="mt-6 text-right">
                    <button onClick={()=>setShowModal(false)} className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 text-sm font-semibold">Cerrar</button>
                  </div>
                </div>
              </div>
            )}
            <div className="mt-10">
              <h3 className="text-lg font-semibold mb-2">Versiones Anteriores</h3>
              {loadingVersions && <p className="text-sm text-gray-500">Cargando versiones...</p>}
              {!loadingVersions && versions.length === 0 && <p className="text-sm text-gray-500">Sin versiones aún.</p>}
              {!loadingVersions && versions.length > 0 && (
                <ul className="space-y-2 text-sm">
                  {versions.map(v => (
                    <li
                      key={v.id}
                      className="flex items-center justify-between border rounded px-3 py-2 bg-gray-50 cursor-pointer hover:bg-gray-100"
                      onClick={() => handleLoadVersion(v.id)}
                      title="Ver detalle de la versión"
                    >
                      <span>{new Date(v.generated_at).toLocaleString()} • {v.model || '—'} {v.used_fallback ? '(fallback)' : ''}</span>
                      <span className="text-gray-500">Intentos: {v.attempts ?? '—'}</span>
                    </li>
                  ))}
                </ul>
              )}
              {versionPreview && (
                <div className="mt-4 border rounded p-4 bg-white shadow-sm">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="font-semibold">Versión del {new Date(versionPreview.generated_at).toLocaleString()}</h4>
                    <button
                      onClick={() => setVersionPreview(null)}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >Cerrar</button>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">Modelo: {versionPreview.model || '—'} {versionPreview.used_fallback ? '(fallback)' : ''} • Intentos: {versionPreview.attempts ?? '—'}</p>
                  <ul className="space-y-2 max-h-60 overflow-auto pr-2 text-sm">
                    {(versionPreview.plan_json?.workouts || []).map((w:any, idx:number) => (
                      <li key={idx} className="border rounded px-2 py-1">
                        <span className="font-medium">{w.date || w.workout_date}</span>: {w.description}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {!loadingPlan && selectedRace && !plan && (
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Crea tu plan personalizado</h2>
            <form onSubmit={handleGeneratePlan}>
              <div className="mb-6">
                <label htmlFor="goal" className="block text-lg font-medium text-gray-700 mb-2">
                  ¿Cuál es tu objetivo?
                </label>
                <input
                  type="text"
                  id="goal"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  placeholder="Ej: Terminar la carrera, hacerla en menos de 4 horas..."
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-orange-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-orange-600 transition-colors disabled:bg-gray-400"
              >
                {loading ? 'Generando...' : 'Generar Plan con IA'}
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
};

export default TrainingPlanPage;
