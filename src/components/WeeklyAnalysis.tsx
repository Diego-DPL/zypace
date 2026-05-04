import { useState } from 'react'
import { doc, updateDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../lib/firebaseClient'
import { useAuth } from '../context/AuthContext'

interface AnalysisData {
  week: string
  planned_run_workouts: number
  completed_run_workouts: number
  adherence_pct: number
  planned_km: number
  actual_km: number
  load_pct: number | null
  continuous_pace_deviation_pct: number | null  // solo umbral/tempo — NO series de pista
  planned_series: number
  completed_series: number
  has_strava_data: boolean
  avg_rpe: number | null
  fatigue_index: number | null
  feelings_summary: { feeling: string; count: number }[]
  avg_sleep_quality: number | null
  freshness_summary: { freshness: string; count: number }[]
  total_suffer_score: number | null
  pace_note?: string
}

interface Adjustment {
  workout_id: string
  date: string
  original: string
  suggested: string
  reason: string
  type: string
}

interface AnalysisResult {
  analysis: AnalysisData
  verdict: 'underload' | 'slow_paces' | 'on_track' | 'great_week' | 'excellent' | 'no_data'
  message: string
  adjustments: Adjustment[]
  meta: { plan_id: string; analyzed_at: string }
}

interface Props {
  planId: string
  onWorkoutsChanged: () => void
}

const VERDICT_CONFIG = {
  underload:   { label: 'Semana incompleta',     bg: 'bg-red-950/50',    text: 'text-red-400',    border: 'border-red-800'    },
  slow_paces:  { label: 'Ritmos lentos',          bg: 'bg-yellow-950/50', text: 'text-yellow-400', border: 'border-yellow-800' },
  on_track:    { label: 'En camino',              bg: 'bg-blue-950/50',   text: 'text-blue-400',   border: 'border-blue-800'   },
  great_week:  { label: 'Buena semana',           bg: 'bg-green-950/50',  text: 'text-green-400',  border: 'border-green-800'  },
  excellent:   { label: 'Semana sobresaliente',   bg: 'bg-purple-950/50', text: 'text-purple-400', border: 'border-purple-800' },
  no_data:     { label: 'Sin datos suficientes',  bg: 'bg-zinc-800',      text: 'text-zinc-200',   border: 'border-zinc-700'   },
}

const TYPE_LABEL: Record<string, string> = {
  series: 'Intervalos', umbral: 'Umbral', tempo: 'Tempo',
  largo: 'Largo', suave: 'Fácil', descanso: 'Descanso', fuerza: 'Fuerza',
}

const FEELING_LABEL: Record<string, string> = {
  great: '😄 Genial', good: '🙂 Bien', average: '😐 Normal',
  tired: '😓 Cansado', very_tired: '😩 Muy cansado',
}

const FRESHNESS_LABEL: Record<string, string> = {
  fresh: '🚀 Fresco', normal: '👌 Normal', heavy: '😓 Pesado', very_heavy: '🦵 Muy pesado',
}

const READINESS_OPTIONS = [
  { value: 'ready',   label: 'Listo para atacar', emoji: '🚀', active: 'bg-green-900/50 border-green-500 text-green-400'    },
  { value: 'normal',  label: 'Normal, bien',       emoji: '👌', active: 'bg-teal-900/50 border-teal-500 text-teal-400'       },
  { value: 'lighter', label: 'Semana más suave',   emoji: '😓', active: 'bg-yellow-900/50 border-yellow-500 text-yellow-400' },
  { value: 'rest',    label: 'Necesito descansar', emoji: '😴', active: 'bg-red-900/50 border-red-500 text-red-400'           },
] as const

const LIFE_CONTEXT_OPTIONS = [
  { value: 'normal',   label: 'Semana normal',        emoji: '📅' },
  { value: 'stress',   label: 'Semana estresante',     emoji: '😤' },
  { value: 'travel',   label: 'Viajes / compromisos',  emoji: '✈️' },
  { value: 'illness',  label: 'No me encuentro bien',  emoji: '🤒' },
  { value: 'great',    label: 'Con mucha energía',     emoji: '⚡' },
] as const

function formatDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

export default function WeeklyAnalysis({ planId, onWorkoutsChanged }: Props) {
  const { user }                               = useAuth()
  const [loading, setLoading]                  = useState(false)
  const [result, setResult]                    = useState<AnalysisResult | null>(null)
  const [error, setError]                      = useState<string | null>(null)
  const [applied, setApplied]                  = useState<Set<string>>(new Set())
  const [applyingId, setApplyingId]            = useState<string | null>(null)
  const [readiness, setReadiness]              = useState<string>('')
  const [lifeContext, setLifeContext]          = useState<string>('')
  const [weekNotes, setWeekNotes]              = useState<string>('')
  const [confirmingWeek, setConfirmingWeek]    = useState(false)
  const [weekConfirmed, setWeekConfirmed]      = useState(false)

  async function runAnalysis() {
    setLoading(true)
    setError(null)
    setResult(null)
    setApplied(new Set())
    setReadiness('')
    setLifeContext('')
    setWeekNotes('')
    setWeekConfirmed(false)
    try {
      const analyzeWeek = httpsCallable(functions, 'analyzeWeek')
      const res = await analyzeWeek({ plan_id: planId })
      const data = res.data as any
      if (data?.error) throw new Error(data.error)
      setResult(data as AnalysisResult)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  async function applyAdjustment(adj: Adjustment) {
    if (!user) return
    setApplyingId(adj.workout_id)
    try {
      await updateDoc(doc(db, 'users', user.uid, 'workouts', adj.workout_id), {
        description: adj.suggested,
      })
      setApplied(prev => new Set([...prev, adj.workout_id]))
      onWorkoutsChanged()
    } catch (e: unknown) {
      alert('Error aplicando sugerencia: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setApplyingId(null)
    }
  }

  async function handleConfirmWeek() {
    if (!user || !result) return
    setConfirmingWeek(true)
    try {
      await addDoc(
        collection(db, 'users', user.uid, 'weekly_reviews'),
        {
          plan_id:      planId,
          week:         result.analysis.week,
          readiness:    readiness || null,
          life_context: lifeContext || null,
          notes:        weekNotes.trim() || null,
          fatigue_index: result.analysis.fatigue_index,
          adherence_pct: result.analysis.adherence_pct,
          created_at:   serverTimestamp(),
        }
      )
      setWeekConfirmed(true)
    } catch (e: unknown) {
      alert('Error guardando check-in: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setConfirmingWeek(false)
    }
  }

  async function applyAll() {
    if (!result) return
    const pending = result.adjustments.filter(a => !applied.has(a.workout_id))
    for (const adj of pending) {
      await applyAdjustment(adj)
    }
  }

  const cfg = result ? VERDICT_CONFIG[result.verdict] : null

  return (
    <div className="mt-10 border border-zinc-800 rounded-xl p-6 bg-zinc-900">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-zinc-100">Análisis semanal</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Revisa cómo fue tu semana y aplica ajustes inteligentes a los próximos entrenamientos.
          </p>
        </div>
        <button
          onClick={runAnalysis}
          disabled={loading}
          className="px-4 py-2 bg-lime-400 hover:bg-lime-500 text-black text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          {loading ? 'Analizando…' : result ? 'Re-analizar' : 'Analizar mi semana'}
        </button>
      </div>

      {error && (
        <div className="bg-red-950/50 border border-red-800 text-red-400 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {result && cfg && (
        <div className="space-y-5">
          {/* Veredicto + mensaje */}
          <div className={`rounded-lg border px-4 py-3 ${cfg.bg} ${cfg.border}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
                {cfg.label}
              </span>
              <span className="text-xs text-zinc-500">
                Semana: {result.analysis.week}
              </span>
            </div>
            <p className={`text-sm font-medium ${cfg.text}`}>{result.message}</p>
          </div>

          {/* Métricas */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Metric
              label="Adherencia"
              value={`${result.analysis.adherence_pct}%`}
              sub={`${result.analysis.completed_run_workouts}/${result.analysis.planned_run_workouts} entrenos`}
              color={result.analysis.adherence_pct >= 80 ? 'green' : result.analysis.adherence_pct >= 60 ? 'yellow' : 'red'}
            />
            <Metric
              label="Km realizados"
              value={`${result.analysis.actual_km} km`}
              sub={result.analysis.planned_km > 0 ? `de ${result.analysis.planned_km} km planificados` : 'sin objetivo de km'}
              color="blue"
            />
            <Metric
              label="Ritmo umbral/tempo"
              value={
                result.analysis.continuous_pace_deviation_pct !== null
                  ? `${result.analysis.continuous_pace_deviation_pct > 0 ? '+' : ''}${result.analysis.continuous_pace_deviation_pct}%`
                  : '—'
              }
              sub={
                result.analysis.continuous_pace_deviation_pct !== null
                  ? result.analysis.continuous_pace_deviation_pct > 0 ? 'más lento que objetivo' : 'en objetivo'
                  : result.analysis.has_strava_data ? 'sin datos de esfuerzo continuo' : 'conecta Strava'
              }
              color={
                result.analysis.continuous_pace_deviation_pct === null ? 'gray'
                  : result.analysis.continuous_pace_deviation_pct > 10 ? 'red'
                  : result.analysis.continuous_pace_deviation_pct > 5  ? 'yellow'
                  : 'green'
              }
            />
            <Metric
              label="Carga semanal"
              value={result.analysis.load_pct !== null ? `${result.analysis.load_pct}%` : '—'}
              sub="vs. carga planificada"
              color={
                result.analysis.load_pct === null ? 'gray'
                  : result.analysis.load_pct < 60 ? 'red'
                  : result.analysis.load_pct > 110 ? 'yellow'
                  : 'green'
              }
            />
          </div>

          {/* Series de pista: solo adherencia, nunca ritmo medio */}
          {result.analysis.planned_series > 0 && (
            <div className="bg-indigo-950/50 border border-indigo-800 rounded-lg px-4 py-2.5 text-sm flex items-start gap-2">
              <span className="text-indigo-400 mt-0.5 flex-shrink-0">ℹ</span>
              <div>
                <span className="font-medium text-indigo-300">
                  Series de pista: {result.analysis.completed_series}/{result.analysis.planned_series} completadas.
                </span>
                <span className="text-indigo-400 ml-1">
                  El ritmo medio de Strava incluye calentamiento y recuperaciones entre repeticiones, por lo que no se compara con el objetivo de las series. Solo se evalúa si las hiciste o no.
                </span>
              </div>
            </div>
          )}

          {/* Fatiga & RPE */}
          {(result.analysis.fatigue_index !== null || result.analysis.avg_rpe !== null || result.analysis.avg_sleep_quality !== null) && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {result.analysis.fatigue_index !== null && (
                <Metric
                  label="Índice de fatiga"
                  value={`${result.analysis.fatigue_index}/100`}
                  sub={
                    result.analysis.fatigue_index >= 75 ? 'Fatiga alta — recupera' :
                    result.analysis.fatigue_index >= 55 ? 'Fatiga moderada' :
                    'Recuperación buena'
                  }
                  color={
                    result.analysis.fatigue_index >= 75 ? 'red' :
                    result.analysis.fatigue_index >= 55 ? 'yellow' : 'green'
                  }
                />
              )}
              {result.analysis.avg_rpe !== null && (
                <Metric
                  label="RPE medio"
                  value={String(result.analysis.avg_rpe)}
                  sub="Esfuerzo percibido (1–10)"
                  color={
                    result.analysis.avg_rpe >= 8 ? 'red' :
                    result.analysis.avg_rpe >= 6 ? 'yellow' : 'green'
                  }
                />
              )}
              {result.analysis.avg_sleep_quality !== null && (
                <Metric
                  label="Sueño medio"
                  value={`${result.analysis.avg_sleep_quality}/5`}
                  sub={
                    result.analysis.avg_sleep_quality >= 4.5 ? 'Excelente' :
                    result.analysis.avg_sleep_quality >= 3.5 ? 'Bueno' :
                    result.analysis.avg_sleep_quality >= 2.5 ? 'Regular' : 'Malo'
                  }
                  color={
                    result.analysis.avg_sleep_quality >= 4 ? 'green' :
                    result.analysis.avg_sleep_quality >= 3 ? 'yellow' : 'red'
                  }
                />
              )}
              {result.analysis.total_suffer_score !== null && (
                <Metric
                  label="Suffer Score"
                  value={String(result.analysis.total_suffer_score)}
                  sub="Carga cardíaca semanal"
                  color={
                    result.analysis.total_suffer_score > 300 ? 'red' :
                    result.analysis.total_suffer_score > 150 ? 'yellow' : 'blue'
                  }
                />
              )}
            </div>
          )}

          {/* Sensaciones */}
          {result.analysis.feelings_summary.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-zinc-500 font-medium">Sensaciones:</span>
              {result.analysis.feelings_summary
                .sort((a, b) => b.count - a.count)
                .map(({ feeling, count }) => (
                  <span
                    key={feeling}
                    className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                      feeling === 'great'     ? 'bg-green-950/50 border-green-800 text-green-400' :
                      feeling === 'good'      ? 'bg-emerald-950/50 border-emerald-800 text-emerald-400' :
                      feeling === 'average'   ? 'bg-zinc-800 border-zinc-700 text-zinc-300' :
                      feeling === 'tired'     ? 'bg-yellow-950/50 border-yellow-800 text-yellow-400' :
                      'bg-red-950/50 border-red-800 text-red-400'
                    }`}
                  >
                    {FEELING_LABEL[feeling] ?? feeling} ×{count}
                  </span>
                ))
              }
            </div>
          )}

          {/* Frescura al inicio */}
          {result.analysis.freshness_summary && result.analysis.freshness_summary.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-zinc-500 font-medium">Frescura al inicio:</span>
              {result.analysis.freshness_summary
                .sort((a, b) => b.count - a.count)
                .map(({ freshness, count }) => (
                  <span
                    key={freshness}
                    className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                      freshness === 'fresh'      ? 'bg-green-950/50 border-green-800 text-green-400' :
                      freshness === 'normal'     ? 'bg-teal-950/50 border-teal-800 text-teal-400' :
                      freshness === 'heavy'      ? 'bg-yellow-950/50 border-yellow-800 text-yellow-400' :
                      'bg-red-950/50 border-red-800 text-red-400'
                    }`}
                  >
                    {FRESHNESS_LABEL[freshness] ?? freshness} ×{count}
                  </span>
                ))
              }
            </div>
          )}

          {!result.analysis.has_strava_data && (
            <p className="text-xs text-zinc-600 italic">
              Strava no conectado o sin actividades esta semana — el análisis de ritmos no está disponible.
              Conecta Strava en Ajustes y sincroniza para obtener análisis completo.
            </p>
          )}

          {/* Sugerencias */}
          {result.adjustments.length > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-zinc-100 text-sm">
                  Ajustes sugeridos para la próxima semana
                </h4>
                {result.adjustments.some(a => !applied.has(a.workout_id)) && (
                  <button
                    onClick={applyAll}
                    disabled={!!applyingId}
                    className="text-xs font-medium text-lime-400 hover:text-lime-300 underline disabled:opacity-50"
                  >
                    Aplicar todos
                  </button>
                )}
              </div>
              <ul className="space-y-3">
                {result.adjustments.map(adj => {
                  const isApplied  = applied.has(adj.workout_id)
                  const isApplying = applyingId === adj.workout_id
                  return (
                    <li key={adj.workout_id} className={`rounded-lg border p-3 text-sm transition-colors ${isApplied ? 'bg-green-950/40 border-green-800' : 'bg-zinc-800 border-zinc-700'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-xs font-medium text-zinc-500">
                              {formatDate(adj.date)}
                            </span>
                            <span className="text-xs bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">
                              {TYPE_LABEL[adj.type] || adj.type}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="line-through text-zinc-600 text-xs">{adj.original}</span>
                            <span className="text-zinc-600">→</span>
                            <span className="font-semibold text-zinc-100">{adj.suggested}</span>
                          </div>
                          <p className="text-xs text-zinc-500 mt-1">{adj.reason}</p>
                        </div>
                        <div className="flex-shrink-0">
                          {isApplied ? (
                            <span className="text-xs font-semibold text-green-400 bg-green-950/50 border border-green-800 px-2 py-1 rounded-lg">
                              Aplicado
                            </span>
                          ) : (
                            <button
                              onClick={() => applyAdjustment(adj)}
                              disabled={isApplying || !!applyingId}
                              className="text-xs font-semibold text-black bg-lime-400 hover:bg-lime-500 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                            >
                              {isApplying ? '…' : 'Aplicar'}
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : (
            result.verdict !== 'no_data' && (
              <p className="text-sm text-zinc-500 italic">
                No se requieren ajustes para la próxima semana. Continúa con el plan previsto.
              </p>
            )
          )}

          {/* ── Weekly check-in ─────────────────────────────── */}
          {result.verdict !== 'no_data' && (
            <div className="border-t border-zinc-800 pt-5 space-y-4">
              <div>
                <h4 className="font-semibold text-zinc-100 text-sm mb-0.5">Check-in semanal</h4>
                <p className="text-xs text-zinc-500">¿Cómo llegas a la próxima semana? Esto ayuda a ajustar el siguiente bloque.</p>
              </div>

              {weekConfirmed ? (
                <div className="bg-green-950/50 border border-green-800 text-green-400 rounded-lg px-4 py-3 text-sm font-medium">
                  ✓ Check-in guardado. El entrenador lo tendrá en cuenta para la próxima semana.
                </div>
              ) : (
                <>
                  {/* Readiness */}
                  <div>
                    <label className="text-xs text-zinc-500 mb-2 block">¿Cómo te sientes para la próxima semana?</label>
                    <div className="flex gap-2 flex-wrap">
                      {READINESS_OPTIONS.map(opt => (
                        <button key={opt.value} type="button"
                          onClick={() => setReadiness(readiness === opt.value ? '' : opt.value)}
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border-2 transition-colors ${
                            readiness === opt.value ? opt.active : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                          }`}>
                          <span>{opt.emoji}</span> {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Life context */}
                  <div>
                    <label className="text-xs text-zinc-500 mb-2 block">Contexto de la semana que viene</label>
                    <div className="flex gap-2 flex-wrap">
                      {LIFE_CONTEXT_OPTIONS.map(opt => (
                        <button key={opt.value} type="button"
                          onClick={() => setLifeContext(lifeContext === opt.value ? '' : opt.value)}
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border-2 transition-colors ${
                            lifeContext === opt.value
                              ? 'bg-blue-900/50 border-blue-500 text-blue-400'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                          }`}>
                          <span>{opt.emoji}</span> {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="text-xs text-zinc-500 mb-1 block">Algo más que quieras añadir</label>
                    <textarea
                      value={weekNotes}
                      onChange={e => setWeekNotes(e.target.value)}
                      rows={2}
                      placeholder="Lesiones, molestias, compromisos importantes…"
                      className="w-full text-sm p-2.5 border border-zinc-700 rounded-lg bg-zinc-900 text-zinc-100 placeholder-gray-400 focus:ring-1 focus:ring-lime-400 focus:outline-none resize-none"
                    />
                  </div>

                  <button
                    onClick={handleConfirmWeek}
                    disabled={confirmingWeek || (!readiness && !lifeContext && !weekNotes.trim())}
                    className="px-4 py-2 bg-lime-400 text-black rounded-lg hover:bg-lime-500 text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    {confirmingWeek ? 'Guardando…' : 'Confirmar semana'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Sub-componente métrica ───────────────────────────────────

type MetricColor = 'green' | 'yellow' | 'red' | 'blue' | 'gray'

function Metric({ label, value, sub, color }: {
  label: string; value: string; sub: string; color: MetricColor
}) {
  const colors: Record<MetricColor, string> = {
    green:  'bg-green-950/50  border-green-800  text-green-400',
    yellow: 'bg-yellow-950/50 border-yellow-800 text-yellow-400',
    red:    'bg-red-950/50    border-red-800    text-red-400',
    blue:   'bg-blue-950/50   border-blue-800   text-blue-400',
    gray:   'bg-zinc-800      border-zinc-700   text-zinc-400',
  }
  return (
    <div className={`rounded-lg border p-3 text-center ${colors[color]}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70 mb-0.5">{label}</div>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-[11px] opacity-60 mt-0.5">{sub}</div>
    </div>
  )
}
