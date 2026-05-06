import { useState, useEffect } from 'react';
import { doc, updateDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebaseClient';
import { useAuth } from '../context/AuthContext';
import poweredByStrava from '../assets/1.2-Strava-API-Logos/Powered by Strava/pwrdBy_strava_white/api_logo_pwrdBy_strava_horiz_white.svg';

interface StravaActivityData {
  activity_id?: number;
  name?: string;
  distance_m?: number;
  moving_time?: number;
  start_date?: string;
  sport_type?: string | null;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
  total_elevation_gain?: number | null;
  suffer_score?: number | null;
  average_cadence?: number | null;
  pr_count?: number | null;
}

interface WorkoutModalProps {
  open: boolean;
  onClose: () => void;
  workout: any | null;
  onCompleteToggle?: (workoutId: string, currentlyCompleted: boolean) => void;
  onSaved?: () => void;
}

const RPE_LABELS = ['', 'Muy fácil', 'Fácil', 'Moderado', 'Algo duro', 'Duro', 'Duro+', 'Muy duro', 'Muy duro+', 'Casi máximo', 'Máximo'];
const RPE_COLORS = ['', 'bg-green-400', 'bg-green-500', 'bg-lime-500', 'bg-yellow-400', 'bg-lime-300', 'bg-lime-400', 'bg-red-400', 'bg-red-500', 'bg-red-600', 'bg-red-700'];

const FEELING_OPTIONS = [
  { value: 'great',     label: '¡Genial!', emoji: '🚀', active: 'bg-green-900/50 border-green-500 text-green-400'  },
  { value: 'good',      label: 'Bien',     emoji: '😊', active: 'bg-teal-900/50 border-teal-500 text-teal-400'    },
  { value: 'average',   label: 'Normal',   emoji: '😐', active: 'bg-yellow-900/50 border-yellow-500 text-yellow-400' },
  { value: 'tired',     label: 'Cansado',  emoji: '😓', active: 'bg-lime-900/50 border-lime-500 text-lime-400' },
  { value: 'very_tired',label: 'Agotado',  emoji: '😩', active: 'bg-red-900/50 border-red-500 text-red-400'       },
] as const;

const SLEEP_OPTIONS = [
  { value: 1, label: 'Pésimo',    emoji: '😴', active: 'bg-red-900/50 border-red-500 text-red-400'        },
  { value: 2, label: 'Malo',      emoji: '😪', active: 'bg-lime-900/50 border-lime-500 text-lime-400' },
  { value: 3, label: 'Regular',   emoji: '😐', active: 'bg-yellow-900/50 border-yellow-500 text-yellow-400' },
  { value: 4, label: 'Bueno',     emoji: '😊', active: 'bg-teal-900/50 border-teal-500 text-teal-400'      },
  { value: 5, label: 'Excelente', emoji: '🌟', active: 'bg-green-900/50 border-green-500 text-green-400'   },
] as const;

const FRESHNESS_OPTIONS = [
  { value: 'fresh',      label: 'Fresco',      emoji: '🚀', active: 'bg-green-900/50 border-green-500 text-green-400'    },
  { value: 'normal',     label: 'Normal',      emoji: '👌', active: 'bg-teal-900/50 border-teal-500 text-teal-400'       },
  { value: 'heavy',      label: 'Pesado',      emoji: '😓', active: 'bg-lime-900/50 border-lime-500 text-lime-400' },
  { value: 'very_heavy', label: 'Muy pesado',  emoji: '🦵', active: 'bg-red-900/50 border-red-500 text-red-400'          },
] as const;

const PHASE_COLORS: Record<string, string> = {
  base: 'bg-teal-900/50 text-teal-400', desarrollo: 'bg-blue-900/50 text-blue-400',
  especifico: 'bg-lime-900/50 text-lime-400', taper: 'bg-purple-900/50 text-purple-400',
};
const PHASE_LABELS: Record<string, string> = {
  base: 'Fase Base', desarrollo: 'Fase Desarrollo', especifico: 'Fase Específica', taper: 'Taper',
};

function formatPace(movingTime: number, distanceM: number): string {
  if (!distanceM || distanceM < 100 || !movingTime) return '—';
  const secPerKm = movingTime / (distanceM / 1000);
  const mins = Math.floor(secPerKm / 60);
  const secs = Math.round(secPerKm % 60).toString().padStart(2, '0');
  return `${mins}:${secs}/km`;
}

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

// ── Strength exercise parser ───────────────────────────────────────────────
interface Exercise { sets?: string; reps?: string; rest?: string; name: string }

function parseExercises(raw: string): Exercise[] {
  return raw
    .split('\n')
    .map(l => l.trim().replace(/^[-*•·]\s*/, ''))
    .filter(Boolean)
    .map(line => {
      // "3x12 Sentadillas" or "3×12 Peso muerto"
      const m1 = line.match(/^(\d+)\s*[x×]\s*(\d+(?:[–\-]\d+)?)\s+(.+?)(?:\s*[(\[](.+?)[)\]])?$/i);
      if (m1) return { sets: m1[1], reps: m1[2], name: m1[3].trim(), rest: m1[4] };
      // "3 series de 12 Sentadillas" / "3 series 12 reps Flexiones"
      const m2 = line.match(/^(\d+)\s+series?\s+(?:de\s+)?(\d+(?:[–\-]\d+)?)\s*(?:reps?|repeticiones?)?\s*(?:[-–:de]\s+)?(.+)/i);
      if (m2) return { sets: m2[1], reps: m2[2], name: m2[3].trim() };
      return { name: line };
    });
}

interface StructuredExercise { sets?: number | string; reps?: string; name: string; notes?: string }

function ExerciseList({ exercises }: { exercises: StructuredExercise[] }) {
  return (
    <div className="space-y-2">
      {exercises.map((ex, i) => (
        <div key={i} className="flex items-center gap-3 bg-zinc-800/80 border border-zinc-700 rounded-lg px-3 py-2.5">
          {ex.sets && ex.reps ? (
            <div className="flex-shrink-0 min-w-[54px] text-center bg-purple-900/60 border border-purple-700 rounded-lg px-2 py-1.5">
              <div className="text-sm font-black text-purple-200 leading-none">{ex.sets}×{ex.reps}</div>
              <div className="text-[9px] text-purple-500 mt-0.5 uppercase tracking-wide">series</div>
            </div>
          ) : (
            <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-purple-500 ml-1.5" />
          )}
          <div className="flex-1 min-w-0">
            <span className="text-sm text-zinc-100 font-medium leading-snug">{ex.name}</span>
            {ex.notes && <p className="text-[11px] text-zinc-500 mt-0.5 leading-snug">{ex.notes}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

function StrengthBlock({ exp }: { exp: any }) {
  // Prefer structured exercises array (new plans); fall back to parsing details text (old plans)
  const exercises: StructuredExercise[] = Array.isArray(exp.exercises) && exp.exercises.length > 0
    ? exp.exercises
    : parseExercises(exp.details || '');

  return (
    <div>
      <span className="text-xs font-bold uppercase tracking-wide text-purple-400 block mb-2.5">Ejercicios</span>
      <ExerciseList exercises={exercises} />
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center bg-zinc-800 rounded-lg px-2 py-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-lime-500 opacity-80">{label}</div>
      <div className="font-bold text-zinc-100 text-sm mt-0.5">{value}</div>
    </div>
  );
}

const WorkoutModal: React.FC<WorkoutModalProps> = ({ open, onClose, workout, onCompleteToggle, onSaved }) => {
  const { user } = useAuth();
  const [rpe, setRpe] = useState<number>(0);
  const [feeling, setFeeling] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [sleepQuality, setSleepQuality] = useState<number | null>(null);
  const [freshnessStart, setFreshnessStart] = useState<string>('');
  const [stravaActivities, setStravaActivities] = useState<StravaActivityData[]>([]);
  const [loadingStrava, setLoadingStrava] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open || !workout) return;
    setRpe(workout.rpe ?? 0);
    setFeeling(workout.feeling ?? '');
    setNotes(workout.notes ?? '');
    setSleepQuality(typeof workout.sleep_quality === 'number' ? workout.sleep_quality : null);
    setFreshnessStart(workout.freshness_start ?? '');
    setSaved(false);

    if (!user || !workout.workout_date) return;
    setLoadingStrava(true);
    setStravaActivities([]);
    getDocs(query(
      collection(db, 'users', user.uid, 'strava_activities'),
      where('start_date', '==', workout.workout_date),
    ))
      .then(snap => setStravaActivities(snap.docs.map(d => d.data() as StravaActivityData)))
      .catch(console.warn)
      .finally(() => setLoadingStrava(false));
  }, [open, workout?.id, user]);

  const handleSave = async () => {
    if (!user || !workout) return;
    setSaving(true);
    try {
      const updates: Record<string, unknown> = {
        rpe: rpe || null,
        feeling: feeling || null,
        notes: notes.trim() || null,
        sleep_quality: sleepQuality ?? null,
        freshness_start: freshnessStart || null,
      };
      // Auto-mark completed when logging past workout (sleep-only doesn't count)
      const todayISO = new Date().toISOString().substring(0, 10);
      if (!workout.is_completed && workout.workout_date <= todayISO && (rpe > 0 || feeling || notes.trim() || freshnessStart)) {
        updates.is_completed = true;
      }
      await updateDoc(doc(db, 'users', user.uid, 'workouts', workout.id), updates);
      setSaved(true);
      onSaved?.();
    } catch (e) {
      console.error('Error saving sensaciones:', e);
    } finally {
      setSaving(false);
    }
  };

  if (!open || !workout) return null;

  const exp = workout.explanation_json || {};
  const isRest     = /descanso|rest/i.test(workout.description || '');
  const isStrength = exp.type === 'fuerza' || /fuerza/i.test(workout.description || '');
  const todayISO = new Date().toISOString().substring(0, 10);
  const isPast = workout.workout_date <= todayISO;
  const showLog = isPast && !isRest;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className={`bg-zinc-900 rounded-xl shadow-xl max-w-lg w-full relative flex flex-col max-h-[90vh] ${workout.is_completed ? 'ring-2 ring-green-400' : ''}`}>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 pb-3 flex-shrink-0">
          <div>
            <h3 className="text-xl font-bold text-zinc-100">
              {isRest ? 'Día de descanso' : 'Entrenamiento'}
            </h3>
            <p className="text-sm text-zinc-500 mt-0.5">
              {new Date(workout.workout_date + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!isRest && onCompleteToggle && (
              <button
                onClick={() => onCompleteToggle(workout.id, workout.is_completed)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  workout.is_completed
                    ? 'bg-green-500 border-green-500 text-white hover:bg-green-600'
                    : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-green-400 hover:text-green-600'
                }`}
              >
                <span>{workout.is_completed ? '✓' : '○'}</span>
                <span>{workout.is_completed ? 'Completado' : 'Marcar completado'}</span>
              </button>
            )}
            <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 text-xl leading-none p-1">✕</button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="px-5 pb-5 space-y-4 overflow-y-auto flex-1">

          {/* Description */}
          <p className={`font-medium ${workout.is_completed ? 'text-zinc-600 line-through' : 'text-zinc-100'}`}>
            {workout.description}
          </p>

          {/* Plan explanation */}
          {(exp.type || exp.purpose || exp.details || exp.intensity) && (
            <div className="space-y-2 text-sm">
              <div className="flex flex-wrap gap-2">
                {exp.phase && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PHASE_COLORS[exp.phase] || 'bg-zinc-800 text-zinc-400'}`}>
                    {PHASE_LABELS[exp.phase] || exp.phase}
                  </span>
                )}
                {exp.type && <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full capitalize">{exp.type}</span>}
              </div>
              {exp.purpose && (
                <p className="text-zinc-200">
                  <span className="font-semibold text-white">Objetivo:</span> {exp.purpose}
                </p>
              )}
              {isStrength && (
                <div className="bg-purple-400/5 border border-purple-400/20 rounded-lg p-3">
                  <StrengthBlock exp={exp} />
                </div>
              )}
              {exp.details && (
                <div className={`rounded-lg p-3 ${isStrength ? 'bg-zinc-800/50 border border-zinc-700' : 'bg-lime-400/10 border border-lime-400/30'}`}>
                  <span className={`text-xs font-bold uppercase tracking-wide block mb-1.5 ${isStrength ? 'text-zinc-400' : 'text-lime-400'}`}>
                    {isStrength ? 'Instrucciones de sesión' : 'Cómo ejecutarlo'}
                  </span>
                  <p className="text-zinc-300 text-sm whitespace-pre-line leading-relaxed">{exp.details}</p>
                </div>
              )}
              {exp.intensity && (
                <p className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2">
                  <span className="font-semibold text-lime-400">Zona / Ritmo: </span>
                  <span className="text-zinc-200 font-mono">{exp.intensity}</span>
                </p>
              )}
            </div>
          )}

          {isRest && (
            <p className="text-sm text-zinc-600 italic text-center py-2 bg-zinc-900 rounded-lg">
              Día de descanso activo — prioriza el sueño y la nutrición.
            </p>
          )}

          {/* Sleep quality — shown for all past days */}
          {isPast && (
            <div className="border-t border-zinc-800 pt-4 space-y-2">
              <label className="text-xs text-zinc-500 block font-semibold">
                Calidad del sueño{sleepQuality != null ? ` — ${SLEEP_OPTIONS.find(o => o.value === sleepQuality)?.emoji} ${SLEEP_OPTIONS.find(o => o.value === sleepQuality)?.label}` : ''}
              </label>
              <div className="flex gap-2 flex-wrap">
                {SLEEP_OPTIONS.map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => setSleepQuality(sleepQuality === opt.value ? null : opt.value)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border-2 transition-colors ${
                      sleepQuality === opt.value ? opt.active : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}>
                    <span>{opt.emoji}</span> {opt.label}
                  </button>
                ))}
              </div>
              {/* Save button shown only for rest days (showLog handles saving for run days) */}
              {isRest && (
                <div className="flex items-center gap-3 pt-1">
                  <button onClick={handleSave} disabled={saving}
                    className="px-4 py-2 bg-lime-400 text-black rounded-lg hover:bg-lime-500 text-sm font-semibold transition-colors disabled:opacity-50">
                    {saving ? 'Guardando…' : 'Guardar sueño'}
                  </button>
                  {saved && <span className="text-xs text-green-600 font-semibold">✓ Guardado</span>}
                </div>
              )}
            </div>
          )}

          {/* Strava data */}
          {isPast && (
            <div className="border-t border-zinc-800 pt-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-zinc-200">Datos de Strava</h4>
                <div className="flex items-center gap-2">
                  {loadingStrava && <div className="w-3 h-3 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" />}
                  <img src={poweredByStrava} alt="Powered by Strava" className="h-4 w-auto" />
                </div>
              </div>
              {stravaActivities.length > 0 ? (
                <div className="space-y-2">
                  {stravaActivities.map((a, i) => (
                    <div key={i} className="bg-zinc-800 border border-zinc-700 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-zinc-200">
                          {a.name || 'Actividad'}{a.sport_type ? ` · ${a.sport_type}` : ''}
                        </p>
                        {a.activity_id && (
                          <a
                            href={`https://www.strava.com/activities/${a.activity_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] font-semibold underline flex-shrink-0 ml-2"
                            style={{ color: '#FC5200' }}
                          >
                            Ver en Strava →
                          </a>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 text-xs">
                        <StatCell label="Distancia" value={`${Math.round((a.distance_m || 0) / 100) / 10} km`} />
                        <StatCell label="Duración" value={formatDuration(a.moving_time || 0)} />
                        <StatCell label="Ritmo" value={formatPace(a.moving_time || 0, a.distance_m || 0)} />
                        {a.average_heartrate != null && (
                          <StatCell label="FC media" value={`${Math.round(a.average_heartrate)} ppm`} />
                        )}
                        {a.max_heartrate != null && (
                          <StatCell label="FC máx" value={`${Math.round(a.max_heartrate)} ppm`} />
                        )}
                        {(a.total_elevation_gain ?? 0) > 1 && (
                          <StatCell label="Desnivel+" value={`${Math.round(a.total_elevation_gain!)} m`} />
                        )}
                        {a.average_cadence != null && (
                          <StatCell label="Cadencia" value={`${Math.round(a.average_cadence * 2)} spm`} />
                        )}
                        {a.suffer_score != null && (
                          <StatCell label="Esfuerzo Rel." value={String(a.suffer_score)} />
                        )}
                        {(a.pr_count ?? 0) > 0 && (
                          <StatCell label="Récords" value={`${a.pr_count} PR`} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : !loadingStrava ? (
                <p className="text-xs text-zinc-600 italic">
                  Sin actividad Strava para este día. Sincroniza en Ajustes para ver métricas.
                </p>
              ) : null}
            </div>
          )}

          {/* Sensaciones log */}
          {showLog && (
            <div className="border-t border-zinc-800 pt-4 space-y-4">
              <h4 className="text-sm font-semibold text-zinc-200">¿Cómo fue el entrenamiento?</h4>

              {/* Feeling */}
              <div>
                <label className="text-xs text-zinc-500 mb-2 block">Sensación general</label>
                <div className="flex gap-2 flex-wrap">
                  {FEELING_OPTIONS.map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => setFeeling(feeling === opt.value ? '' : opt.value)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border-2 transition-colors ${
                        feeling === opt.value ? opt.active : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                      }`}>
                      <span>{opt.emoji}</span> {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* RPE */}
              <div>
                <label className="text-xs text-zinc-500 mb-2 block">
                  Esfuerzo percibido (RPE){rpe > 0 ? ` — ${rpe}/10 · ${RPE_LABELS[rpe]}` : ' — sin registrar'}
                </label>
                <div className="flex gap-1">
                  {[1,2,3,4,5,6,7,8,9,10].map(n => (
                    <button key={n} type="button" onClick={() => setRpe(rpe === n ? 0 : n)}
                      className={`flex-1 h-8 rounded text-xs font-bold transition-colors ${
                        rpe >= n ? RPE_COLORS[n] + ' text-white' : 'bg-zinc-800 text-zinc-600 hover:bg-zinc-700'
                      }`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Freshness at start */}
              <div>
                <label className="text-xs text-zinc-500 mb-2 block">¿Cómo llegaste al entreno?</label>
                <div className="flex gap-2 flex-wrap">
                  {FRESHNESS_OPTIONS.map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => setFreshnessStart(freshnessStart === opt.value ? '' : opt.value)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border-2 transition-colors ${
                        freshnessStart === opt.value ? opt.active : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                      }`}>
                      <span>{opt.emoji}</span> {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Notas libres</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Sensaciones, observaciones, lo que quieras recordar…"
                  className="w-full text-sm p-2.5 border border-zinc-700 rounded-lg bg-zinc-900 text-zinc-100 placeholder-gray-400 focus:ring-1 focus:ring-lime-400 focus:outline-none resize-none"
                />
              </div>

              <div className="flex items-center gap-3">
                <button onClick={handleSave} disabled={saving}
                  className="px-4 py-2 bg-lime-400 text-black rounded-lg hover:bg-lime-500 text-sm font-semibold transition-colors disabled:opacity-50">
                  {saving ? 'Guardando…' : 'Guardar sensaciones'}
                </button>
                {saved && <span className="text-xs text-green-600 font-semibold">✓ Guardado</span>}
              </div>
            </div>
          )}

          {/* Show saved sensaciones if they exist */}
          {isPast && !isRest && !showLog === false && (workout.rpe || workout.feeling || workout.notes || workout.sleep_quality || workout.freshness_start) && !saved && (
            <div className="border-t border-zinc-800 pt-3 text-sm text-zinc-400 space-y-1">
              <p className="font-semibold text-xs text-zinc-500 uppercase tracking-wide">Sensaciones registradas</p>
              {workout.feeling && <p>{FEELING_OPTIONS.find(f => f.value === workout.feeling)?.emoji} {FEELING_OPTIONS.find(f => f.value === workout.feeling)?.label}</p>}
              {workout.freshness_start && <p>{FRESHNESS_OPTIONS.find(f => f.value === workout.freshness_start)?.emoji} Llegó {FRESHNESS_OPTIONS.find(f => f.value === workout.freshness_start)?.label.toLowerCase()}</p>}
              {workout.rpe > 0 && <p>RPE: {workout.rpe}/10 · {RPE_LABELS[workout.rpe]}</p>}
              {workout.sleep_quality != null && <p>{SLEEP_OPTIONS.find(s => s.value === workout.sleep_quality)?.emoji} Sueño {SLEEP_OPTIONS.find(s => s.value === workout.sleep_quality)?.label.toLowerCase()}</p>}
              {workout.notes && <p className="italic text-zinc-500">"{workout.notes}"</p>}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default WorkoutModal;

