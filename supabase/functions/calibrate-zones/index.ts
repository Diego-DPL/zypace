// Edge Function: calibrate-zones
// Estima zonas de entrenamiento personalizadas analizando actividades históricas de Strava.
//
// Algoritmo:
//   1. Filtra carreras válidas de los últimos 90 días
//   2. Agrupa por tramo de distancia: corto (4-7km), medio (8-14km), largo (>14km)
//   3. Estima ritmo de 5k y 10k con fórmula de Riegel desde los mejores esfuerzos
//   4. Valida Z1 contra ritmo de rodajes largos (cuando hay datos suficientes)
//   5. Guarda zonas en profiles y las devuelve
//
// Referencias: Seiler & Tønnessen (2009), Jack Daniels Running Formula

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

// ── Helpers ──────────────────────────────────────────────────

function secToMinStr(s: number): string {
  const mm = Math.floor(s / 60)
  const ss = Math.round(s % 60).toString().padStart(2, '0')
  return `${mm}:${ss}/km`
}

/** Riegel projection: scale pace from known distance to target distance.
 *  pace_target = pace_known * (dist_target / dist_known)^0.06
 */
function riegel(paceSec: number, fromKm: number, toKm: number): number {
  return paceSec * Math.pow(toKm / fromKm, 0.06)
}

/** Median of a numeric array */
function median(arr: number[]): number {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// ── Main handler ─────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: CORS_HEADERS })
  }

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) return jsonResponse(401, { error: 'No autenticado' })

    // ── 1. Fetch running activities (last 90 days) ───────────
    const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10)

    const { data: activities, error: actErr } = await supabase
      .from('strava_activities')
      .select('distance_m, moving_time, start_date, sport_type, name')
      .eq('user_id', user.id)
      .gte('start_date', since90)
      .order('start_date', { ascending: false })

    if (actErr) return jsonResponse(500, { error: 'Error leyendo actividades Strava', details: actErr })
    if (!activities || activities.length === 0) {
      return jsonResponse(200, {
        success: false,
        reason: 'no_activities',
        message: 'No hay actividades de Strava en los últimos 90 días. Sincroniza tu cuenta desde Ajustes.'
      })
    }

    // ── 2. Filter valid running activities ───────────────────
    //
    // CRITERIO CLAVE — esfuerzo continuo vs. sesión de intervalos:
    //
    // El ritmo medio de Strava para sesiones de pista (200m/400m) incluye
    // el tiempo de calentamiento, recuperación y enfriamiento. Esto hace que
    // el ritmo medio sea siempre MUCHO más lento que el ritmo real de esfuerzo.
    // Ejemplo: 8×400m a 3:50/km puede promediar 5:20/km con las recuperaciones.
    //
    // SOLUCIÓN: solo usamos actividades que tengan buena "densidad de esfuerzo",
    // es decir, actividades donde la mayor parte del tiempo es esfuerzo continuo.
    // Detectamos sesiones de pista por:
    //   1. Distancia total < 3km sin calentamiento (probablemente solo las series)
    //   2. Ritmo medio > 4:00/km pero distancia < 5km (ritmo rápido en poca distancia
    //      sugiere sesión de pista con poca/ninguna carrera continua)
    //
    // Las actividades excluidas se cuentan en el total pero NO en los brackets
    // para no sesgar las estimaciones de zona.

    const MIN_PACE = 140, MAX_PACE = 570  // 2:20/km to 9:30/km
    const MIN_DIST = 1000  // 1km mínimo para contar (incluye sesiones de pista)

    interface RunActivity {
      distKm: number
      paceSec: number
      likelyContinuous: boolean  // apto para estimación de zonas
    }

    const runs: RunActivity[] = []
    let intervalSessionsDetected = 0

    for (const a of activities) {
      const st = (a.sport_type || '').toLowerCase()
      // Saltar deportes que claramente no son running
      if (st && !['run', 'trail', 'walk', ''].some(r => st.includes(r))) {
        if (['ride', 'virtualride', 'swim', 'rowing', 'kayaking', 'ski'].some(s => st.includes(s))) continue
      }

      const dm = Number(a.distance_m) || 0
      const mt = Number(a.moving_time) || 0
      if (dm < MIN_DIST || mt < 60) continue

      const distKm = dm / 1000
      const paceSec = mt / distKm

      if (paceSec < MIN_PACE || paceSec > MAX_PACE) continue

      // Detectar sesiones de pista/intervalos (ritmo medio no representativo):
      //   - Distancia < 3km: muy probable que sea solo los intervalos sin calentamiento
      //   - Distancia 3-5km con ritmo < 4:30/km: posible sesión de pista con poco calentamiento
      //     (un runner que hace 5km seguidos a 4:20/km es un dato válido de forma;
      //      pero 5km en pista a ese ritmo medio puede ser 8×400m + poco calentamiento)
      // Heurística conservadora: excluir de brackets si dist < 3km (incluir en total)
      const likelyContinuous = distKm >= 3.0

      if (!likelyContinuous) intervalSessionsDetected++

      runs.push({ distKm, paceSec, likelyContinuous })
    }

    if (runs.length < 3) {
      return jsonResponse(200, {
        success: false,
        reason: 'insufficient_data',
        message: `Solo ${runs.length} actividades de running válidas en los últimos 90 días. Necesitas al menos 3 para calibrar zonas con confianza.`
      })
    }

    // ── 3. Group by distance bracket ────────────────────────
    // short (4-7km): proxy for 5k effort
    // medium (8-14km): proxy for 10k effort / threshold
    // long (>14km): proxy for Z1 / easy pace
    const short  = runs.filter(r => r.distKm >= 4  && r.distKm <= 7)
    const medium = runs.filter(r => r.distKm >= 8  && r.distKm <= 14)
    const long_  = runs.filter(r => r.distKm > 14)

    // Sort each bracket fastest → slowest
    const byPace = (a: RunActivity, b: RunActivity) => a.paceSec - b.paceSec

    short.sort(byPace)
    medium.sort(byPace)
    long_.sort(byPace)

    // ── 4. Estimate 5k pace ──────────────────────────────────
    // Best 3 efforts in "short" bracket, project to 5k with Riegel
    let p5kSec: number | null = null

    if (short.length >= 1) {
      const top3 = short.slice(0, Math.min(3, short.length))
      const projected5k = top3.map(r => riegel(r.paceSec, r.distKm, 5))
      p5kSec = median(projected5k)
    }

    // ── 5. Estimate 10k pace ─────────────────────────────────
    // Best 3 efforts in "medium" bracket, project to 10k with Riegel
    let p10kSec: number | null = null

    if (medium.length >= 1) {
      const top3 = medium.slice(0, Math.min(3, medium.length))
      const projected10k = top3.map(r => riegel(r.paceSec, r.distKm, 10))
      p10kSec = median(projected10k)
    }

    // ── 6. Cross-project missing brackets ───────────────────
    // Riegel race prediction between distances: ~4.2% per doubling of distance
    if (!p10kSec && p5kSec) {
      p10kSec = riegel(p5kSec, 5, 10)  // 5k → 10k
    }
    if (!p5kSec && p10kSec) {
      p5kSec = riegel(p10kSec, 10, 5)  // 10k → 5k
    }

    // If we still have nothing, try to estimate from all valid runs
    if (!p10kSec && runs.length >= 3) {
      // Use best overall pace as a rough proxy
      const allPaces = runs.map(r => r.paceSec).sort((a, b) => a - b)
      const bestPace = allPaces[0]
      const bestDist = runs.find(r => r.paceSec === bestPace)!.distKm
      p10kSec = riegel(bestPace, bestDist, 10)
      p5kSec  = riegel(bestPace, bestDist, 5)
    }

    if (!p10kSec || !p5kSec) {
      return jsonResponse(200, {
        success: false,
        reason: 'projection_failed',
        message: 'No se pudo estimar el ritmo de referencia. Intenta con más actividades.'
      })
    }

    // ── 7. Estimate Z1 from long runs ────────────────────────
    // Long runs are typically done in Z1 → use median (not best!) pace
    let z1Sec: number

    if (long_.length >= 2) {
      const longPaces = long_.map(r => r.paceSec)
      const z1FromLong = median(longPaces)

      // Sanity check: Z1 should be 1.20-1.45x slower than 10k pace
      const ratio = z1FromLong / p10kSec
      if (ratio >= 1.15 && ratio <= 1.50) {
        z1Sec = z1FromLong  // trust the real data
      } else {
        // Data looks off (maybe races mixed in, or exceptionally slow days)
        // Use Riegel-based formula as fallback
        z1Sec = p10kSec * 1.28
      }
    } else {
      // Not enough long run data → use formula
      z1Sec = p10kSec * 1.28
    }

    // ── 8. Final zone values ─────────────────────────────────
    // Z1: easy aerobic (VT1, conversational) — validated against long runs
    // Z4: threshold LT2 — slightly slower than 10k race pace
    // Z5: VO2max — slightly faster than 5k race pace

    const z1Final = Math.round(z1Sec)
    const z4Final = Math.round(p10kSec * 1.02)   // ~10k pace
    const z5Final = Math.round(p5kSec  * 0.95)   // slightly faster than 5k pace

    const estimated5kSec  = Math.round(p5kSec  * 5)   // total 5k time (sec)
    const estimated10kSec = Math.round(p10kSec * 10)  // total 10k time (sec)

    // ── 9. Confidence level ──────────────────────────────────
    const bracketsWithData = [short, medium, long_].filter(b => b.length >= 2).length
    let confidence: 'alta' | 'media' | 'baja'

    if (runs.length >= 15 && bracketsWithData >= 2) {
      confidence = 'alta'
    } else if (runs.length >= 5 || bracketsWithData >= 1) {
      confidence = 'media'
    } else {
      confidence = 'baja'
    }

    // ── 10. Store in profile ─────────────────────────────────
    const { error: upErr } = await supabase
      .from('profiles')
      .update({
        z1_pace_sec_km:    z1Final,
        z4_pace_sec_km:    z4Final,
        z5_pace_sec_km:    z5Final,
        estimated_5k_sec:  estimated5kSec,
        estimated_10k_sec: estimated10kSec,
        zones_confidence:  confidence,
        zones_activities:  runs.length,
        zones_calibrated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)

    if (upErr) {
      console.error('Error guardando zonas en profile:', upErr)
      // Don't fail — still return the computed zones
    }

    // Format for display
    function formatTime(totalSec: number): string {
      const m = Math.floor(totalSec / 60)
      const s = Math.round(totalSec % 60).toString().padStart(2, '0')
      return `${m}:${s}`
    }

    return jsonResponse(200, {
      success: true,
      zones: {
        z1: { sec_km: z1Final, display: secToMinStr(z1Final), label: 'Fácil / Aeróbico Z1' },
        z4: { sec_km: z4Final, display: secToMinStr(z4Final), label: 'Umbral / LT2 Z4' },
        z5: { sec_km: z5Final, display: secToMinStr(z5Final), label: 'VO2max Z5' },
      },
      estimates: {
        time_5k:  { sec: estimated5kSec,  display: formatTime(estimated5kSec)  },
        time_10k: { sec: estimated10kSec, display: formatTime(estimated10kSec) },
      },
      confidence,
      activities_analyzed: runs.length,
      brackets: {
        short_runs:  short.length,
        medium_runs: medium.length,
        long_runs:   long_.length,
      },
      calibrated_at: new Date().toISOString(),
      note: confidence === 'baja'
        ? 'Pocos datos — sigue entrenando y recalibra en unas semanas para mayor precisión.'
        : confidence === 'media'
        ? 'Calibración moderada — mejorará con más actividades de distintos tipos y distancias.'
        : 'Calibración robusta — basada en suficientes actividades y distancias variadas.',
    })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse(500, { error: 'Error inesperado', details: msg })
  }
})
