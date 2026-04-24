// Edge Function: analyze-week
// Analiza los últimos 7 días de entrenamiento y propone ajustes para la semana siguiente.
// Basado en: adherencia al plan, desviación de ritmos (Strava), carga acumulada.

import { createClient } from '@supabase/supabase-js'
// @ts-ignore
declare const Deno: any;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function jsonResponse(status: number, body: any) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS })
}

// ── Pace utilities ───────────────────────────────────────────

/** Parsea "4:30/km" → 270 sec/km. También acepta "(Z4 — 4:30/km)" */
function parseTargetPace(intensity: string | null | undefined): number | null {
  if (!intensity) return null
  const m = intensity.match(/(\d+):(\d{2})\/km/)
  if (!m) return null
  return parseInt(m[1]) * 60 + parseInt(m[2])
}

/** Ritmo real en sec/km desde datos de Strava */
function calcPace(distance_m: number, moving_time: number): number | null {
  if (!distance_m || !moving_time || distance_m < 500) return null
  return moving_time / (distance_m / 1000)
}

/** Extrae km desde descripción: "Largo 14km", "Rodaje suave 8km", "Series 6×4min" */
function extractKm(description: string): number | null {
  const m = description.match(/(\d+(?:[.,]\d+)?)\s?(?:km|k)\b/i)
  if (!m) return null
  return parseFloat(m[1].replace(',', '.'))
}

/**
 * Aplica un factor de ajuste a la descripción de un entrenamiento.
 * factor < 1 = reducir carga, factor > 1 = aumentar carga.
 * Devuelve null si no sabe cómo ajustar (ej: Descanso, Fuerza).
 */
function adjustDescription(description: string, factor: number): string | null {
  const desc = description.trim()

  // Series N×Xmin  /  N×Xm  /  N×Xkm
  const seriesM = desc.match(/^(Series)\s+(\d+)(×\S+.*)$/i)
  if (seriesM) {
    const newReps = Math.max(3, Math.round(parseInt(seriesM[2]) * factor))
    return `${seriesM[1]} ${newReps}${seriesM[3]}`
  }

  // Umbral N×Xm  /  N×Xkm
  const umbralM = desc.match(/^(Umbral)\s+(\d+)(×\S+.*)$/i)
  if (umbralM) {
    const newReps = Math.max(3, Math.round(parseInt(umbralM[2]) * factor))
    return `${umbralM[1]} ${newReps}${umbralM[3]}`
  }

  // Km-based: "Tempo 8km", "Largo 18km", "Rodaje suave 10km"
  const kmM = desc.match(/^(.+?\s)(\d+(?:\.\d+)?)(km\b.*)$/i)
  if (kmM) {
    const newKm = Math.max(3, Math.round(parseFloat(kmM[2]) * factor))
    return `${kmM[1]}${newKm}${kmM[3]}`
  }

  return null
}

// ── Main handler ─────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: CORS_HEADERS })
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any = {}
    try { body = await req.json() } catch { /* sin cuerpo */ }

    const authHeader = req.headers.get('Authorization') || ''
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) return jsonResponse(401, { error: 'No autenticado' })

    const planId: string | null = body.plan_id || null

    // ── 1. Obtener plan activo ───────────────────────────────
    const today = new Date()
    const todayISO = today.toISOString().substring(0, 10)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let activePlan: any = null

    if (planId) {
      const { data, error } = await supabase
        .from('training_plans')
        .select('id, goal, run_days_per_week, target_race_time_sec, race_id')
        .eq('user_id', user.id)
        .eq('id', planId)
        .maybeSingle()
      if (error) return jsonResponse(500, { error: 'Error leyendo plan', details: error })
      activePlan = data
    } else {
      // Buscar el plan cuya carrera sea la más próxima en el futuro
      const { data: plans, error } = await supabase
        .from('training_plans')
        .select('id, goal, run_days_per_week, target_race_time_sec, race_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10)
      if (error) return jsonResponse(500, { error: 'Error leyendo planes', details: error })

      if (plans && plans.length > 0) {
        // Para cada plan, verificar si su carrera es futura
        for (const p of plans) {
          if (!p.race_id) continue
          const { data: race } = await supabase
            .from('races')
            .select('date, distance')
            .eq('id', p.race_id)
            .maybeSingle()
          if (race && race.date >= todayISO) {
            activePlan = { ...p, raceDate: race.date, raceDistanceKm: Number(race.distance) || 0 }
            break
          }
        }
      }
    }

    if (!activePlan) {
      return jsonResponse(404, { error: 'No hay plan activo con carrera futura. Crea un plan de entrenamiento primero.' })
    }

    // Si necesitamos la info de carrera y no la tenemos aún
    if (!activePlan.raceDate && activePlan.race_id) {
      const { data: race } = await supabase
        .from('races')
        .select('date, distance')
        .eq('id', activePlan.race_id)
        .maybeSingle()
      if (race) {
        activePlan.raceDate = race.date
        activePlan.raceDistanceKm = Number(race.distance) || 0
      }
    }

    // ── 2. Ventana de análisis: últimos 7 días (excluyendo hoy) ─
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    const sevenDaysAgoISO = sevenDaysAgo.toISOString().substring(0, 10)
    const yesterdayISO = new Date(today.getTime() - 86400000).toISOString().substring(0, 10)

    // ── 3. Workouts planificados en la ventana ───────────────
    const { data: pastWorkouts, error: pwErr } = await supabase
      .from('workouts')
      .select('id, workout_date, description, is_completed, distance_km, explanation_json')
      .eq('plan_id', activePlan.id)
      .gte('workout_date', sevenDaysAgoISO)
      .lte('workout_date', yesterdayISO)
      .order('workout_date', { ascending: true })
    if (pwErr) return jsonResponse(500, { error: 'Error leyendo workouts', details: pwErr })

    // ── 4. Actividades Strava en la ventana ──────────────────
    const { data: activities, error: actErr } = await supabase
      .from('strava_activities')
      .select('distance_m, moving_time, start_date, sport_type')
      .eq('user_id', user.id)
      .gte('start_date', sevenDaysAgoISO)
      .lte('start_date', yesterdayISO)
    if (actErr) return jsonResponse(500, { error: 'Error leyendo Strava', details: actErr })

    const hasStravaData = (activities || []).length > 0

    // Index actividades por fecha
    const actsByDate: Record<string, Array<{ distance_m: number; moving_time: number }>> = {}
    for (const a of (activities || [])) {
      if (!actsByDate[a.start_date]) actsByDate[a.start_date] = []
      actsByDate[a.start_date].push({ distance_m: a.distance_m || 0, moving_time: a.moving_time || 0 })
    }

    // ── 5. Calcular métricas ─────────────────────────────────
    const allWorkouts = pastWorkouts || []

    const runWorkouts = allWorkouts.filter(w =>
      !/(descanso|rest|fuerza)\b/i.test(w.description || '')
    )
    const plannedRunCount = runWorkouts.length
    const completedRunCount = runWorkouts.filter(w => w.is_completed).length
    const adherence = plannedRunCount > 0 ? completedRunCount / plannedRunCount : 1.0

    // Km planificados
    let plannedKm = 0
    for (const w of runWorkouts) {
      plannedKm += w.distance_km || extractKm(w.description || '') || 0
    }

    // Km reales de Strava
    let actualKm = 0
    for (const acts of Object.values(actsByDate)) {
      for (const a of acts) actualKm += (a.distance_m || 0) / 1000
    }
    actualKm = Math.round(actualKm * 10) / 10

    // ── Análisis de ritmos — SOLO esfuerzos continuos ────────
    //
    // LIMITACIÓN IMPORTANTE: el ritmo medio de Strava incluye el tiempo de
    // calentamiento, enfriamiento y recuperación entre series. Para sesiones de
    // intervalos (type='series'), esto hace que el ritmo medio sea siempre mucho
    // más lento que el ritmo real de esfuerzo (ej: 6×400m a 3:50/km puede
    // promediar 5:10/km con los trotes de recuperación). Comparar ese ritmo
    // medio con el objetivo de 3:50/km siempre daría una desviación enorme y
    // falsa.
    //
    // SOLUCIÓN: Solo hacemos análisis de ritmo en esfuerzos CONTINUOS:
    //   - umbral: series largas continuas o repeticiones largas (LT2)
    //   - tempo: rodaje a ritmo umbral sin paradas
    // Para 'series' (400m, 200m, pista) → solo analizamos adherencia (hecho/no hecho).

    const qualityTypes     = new Set(['series', 'umbral', 'tempo'])
    const continuousTypes  = new Set(['umbral', 'tempo'])  // ritmo medio válido para análisis de pace

    const completedContinuous = runWorkouts.filter(w =>
      continuousTypes.has(w.explanation_json?.type || '') && w.is_completed
    )

    const paceDeviations: number[] = []
    for (const w of completedContinuous) {
      const targetSec = parseTargetPace(w.explanation_json?.intensity)
      if (!targetSec) continue

      const dayActs = actsByDate[w.workout_date] || []
      if (!dayActs.length) continue

      // Actividad más relevante: la de distancia más cercana al workout planificado
      const planKm = w.distance_km || extractKm(w.description || '') || 0
      const bestAct = [...dayActs].sort((a, b) =>
        planKm
          ? Math.abs(a.distance_m / 1000 - planKm) - Math.abs(b.distance_m / 1000 - planKm)
          : (b.distance_m - a.distance_m)
      )[0]

      const actualSec = calcPace(bestAct.distance_m, bestAct.moving_time)
      if (!actualSec) continue

      // Desviación: positiva = más lento que objetivo, negativa = más rápido
      paceDeviations.push((actualSec - targetSec) / targetSec)
    }

    const avgPaceDev = paceDeviations.length > 0
      ? paceDeviations.reduce((a, b) => a + b, 0) / paceDeviations.length
      : null

    // Contar sesiones de series completadas (para adherencia específica)
    const completedSeries = runWorkouts.filter(w =>
      w.explanation_json?.type === 'series' && w.is_completed
    ).length
    const plannedSeries = runWorkouts.filter(w =>
      w.explanation_json?.type === 'series'
    ).length

    // Carga simplificada (pseudo-TSS)
    // Z1: factor 1.0, Z4/umbral/tempo: factor 2.5, Z5/series: factor 3.5
    const intensityFactor = (type: string) => {
      if (type === 'series') return 3.5
      if (type === 'umbral' || type === 'tempo') return 2.5
      if (type === 'largo') return 1.2
      return 1.0
    }

    let plannedLoad = 0
    let actualLoad  = 0

    for (const w of runWorkouts) {
      const km = w.distance_km || extractKm(w.description || '') || 0
      const factor = intensityFactor(w.explanation_json?.type || 'suave')
      plannedLoad += km * factor
      if (w.is_completed) {
        const dayActs = actsByDate[w.workout_date] || []
        const totalKm = dayActs.reduce((s, a) => s + (a.distance_m / 1000), km)
        actualLoad += totalKm * factor
      }
    }

    const loadPct = plannedLoad > 0 ? Math.round((actualLoad / plannedLoad) * 100) : null

    // ── 6. Veredicto ────────────────────────────────────────
    type Verdict = 'underload' | 'slow_paces' | 'on_track' | 'great_week' | 'excellent' | 'no_data'
    let verdict: Verdict
    let message: string

    // Nota sobre series: el ritmo medio de Strava NO es representativo del
    // esfuerzo real en series de pista porque incluye recuperaciones y calentamiento.
    // Por eso se excluyen del análisis de ritmo y solo se evalúa su adherencia.
    const seriesNote = plannedSeries > 0
      ? ` Series de pista: ${completedSeries}/${plannedSeries} completadas (el ritmo de series no se analiza — el GPS registra el promedio incluido el trote de recuperación).`
      : ''

    if (plannedRunCount === 0) {
      verdict = 'no_data'
      message = 'No hay entrenamientos de running planificados en los últimos 7 días para este plan.'
    } else if (adherence < 0.60) {
      verdict = 'underload'
      message = `Completaste ${completedRunCount} de ${plannedRunCount} entrenamientos (${Math.round(adherence * 100)}%). La próxima semana será más suave para que puedas retomar el ritmo.${seriesNote}`
    } else if (avgPaceDev !== null && avgPaceDev > 0.10) {
      verdict = 'slow_paces'
      message = `Tus esfuerzos continuos (umbral/tempo) fueron un ${Math.round(avgPaceDev * 100)}% más lentos de lo planificado — señal de fatiga acumulada. Voy a reducir ligeramente la intensidad la próxima semana.${seriesNote}`
    } else if (adherence >= 0.95 && (avgPaceDev === null || avgPaceDev <= 0.02)) {
      verdict = 'excellent'
      message = `¡Semana sobresaliente! ${completedRunCount}/${plannedRunCount} entrenamientos completados${avgPaceDev !== null ? ` y esfuerzos continuos en objetivo (${(avgPaceDev * 100).toFixed(1)}% desviación)` : ''}.${seriesNote}`
    } else if (adherence >= 0.80 && (avgPaceDev === null || avgPaceDev <= 0.06)) {
      verdict = 'great_week'
      message = `Buena semana: ${completedRunCount}/${plannedRunCount} entrenamientos con ritmos continuos sólidos. Continúa con el plan.${seriesNote}`
    } else {
      verdict = 'on_track'
      message = `Semana correcta: ${completedRunCount}/${plannedRunCount} entrenamientos. ${avgPaceDev !== null ? `Desviación media (umbral/tempo): ${(avgPaceDev * 100).toFixed(1)}%.` : ''}${seriesNote}`
    }

    // ── 7. Próximos workouts (14 días) ───────────────────────
    const in14ISO = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10)
    const { data: upcoming, error: upErr } = await supabase
      .from('workouts')
      .select('id, workout_date, description, is_completed, distance_km, explanation_json')
      .eq('plan_id', activePlan.id)
      .gte('workout_date', todayISO)
      .lte('workout_date', in14ISO)
      .eq('is_completed', false)
      .order('workout_date', { ascending: true })
    if (upErr) return jsonResponse(500, { error: 'Error leyendo próximos workouts', details: upErr })

    // ── 8. Generar sugerencias de ajuste ─────────────────────
    interface Adjustment {
      workout_id: string
      date: string
      original: string
      suggested: string
      reason: string
      type: string
    }

    const adjustments: Adjustment[] = []
    const needsReduction = verdict === 'underload' || verdict === 'slow_paces'
    const canIncrease    = verdict === 'excellent'

    // Factores de ajuste
    const REDUCE_QUALITY = 0.75  // −25% en sesiones de calidad
    const REDUCE_EASY    = 0.85  // −15% en rodajes
    const INCREASE       = 1.15  // +15% en sesiones de calidad (semana excelente)

    let qualityAdjusted = 0
    let easyAdjusted    = 0

    for (const w of (upcoming || [])) {
      const wType = w.explanation_json?.type || ''
      const isQuality = qualityTypes.has(wType)
      const isEasy = wType === 'suave' || wType === 'largo'

      if (!isQuality && !isEasy) continue

      if (needsReduction) {
        if (isQuality && qualityAdjusted < 2) {
          const suggested = adjustDescription(w.description, REDUCE_QUALITY)
          if (suggested && suggested !== w.description) {
            adjustments.push({
              workout_id: w.id,
              date: w.workout_date,
              original: w.description,
              suggested,
              reason: verdict === 'underload'
                ? `Baja adherencia (${Math.round(adherence * 100)}%) — reducir carga para facilitar la recuperación.`
                : `Ritmos de calidad un ${Math.round((avgPaceDev || 0) * 100)}% más lentos — ajustar intensidad a tu forma actual.`,
              type: wType,
            })
            qualityAdjusted++
          }
        }

        if (isEasy && easyAdjusted < 3) {
          const suggested = adjustDescription(w.description, REDUCE_EASY)
          if (suggested && suggested !== w.description) {
            adjustments.push({
              workout_id: w.id,
              date: w.workout_date,
              original: w.description,
              suggested,
              reason: 'Reducir volumen general para favorecer recuperación.',
              type: wType,
            })
            easyAdjusted++
          }
        }
      }

      if (canIncrease && isQuality && qualityAdjusted < 1) {
        const suggested = adjustDescription(w.description, INCREASE)
        if (suggested && suggested !== w.description) {
          adjustments.push({
            workout_id: w.id,
            date: w.workout_date,
            original: w.description,
            suggested,
            reason: 'Semana excelente — pequeño aumento de carga de calidad.',
            type: wType,
          })
          qualityAdjusted++
        }
      }
    }

    // ── Respuesta ────────────────────────────────────────────
    return jsonResponse(200, {
      analysis: {
        week: `${sevenDaysAgoISO} → ${yesterdayISO}`,
        planned_run_workouts: plannedRunCount,
        completed_run_workouts: completedRunCount,
        adherence_pct: Math.round(adherence * 100),
        planned_km: Math.round(plannedKm * 10) / 10,
        actual_km: actualKm,
        load_pct: loadPct,
        continuous_pace_deviation_pct: avgPaceDev !== null ? Math.round(avgPaceDev * 100) : null,
        planned_series: plannedSeries,
        completed_series: completedSeries,
        has_strava_data: hasStravaData,
        pace_note: 'El análisis de ritmo solo aplica a esfuerzos continuos (umbral/tempo). Las series de pista se evalúan solo por adherencia.',
      },
      verdict,
      message,
      adjustments,
      meta: {
        plan_id: activePlan.id,
        analyzed_at: new Date().toISOString(),
      }
    })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse(500, { error: 'Error inesperado', details: msg })
  }
})
