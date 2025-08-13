// Supabase Edge Function: sync-strava
// Objetivo: Traer actividades recientes de Strava y marcarlas como completadas en workouts cuando corresponda.
// Entrada: auth via Authorization: Bearer <anon|service> + cabecera x-user-id (si se usa service role) o JWT de usuario (preferido).
// Salida: { imported: number, matchedWorkouts: number, activities: number, range: { from, to } }

import { createClient } from '@supabase/supabase-js'

interface StravaActivity {
  id: number
  name: string
  distance: number // metros
  moving_time: number
  start_date: string // ISO
  sport_type?: string
}

const STRAVA_API_BASE = 'https://www.strava.com/api/v3'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Content-Type': 'application/json',
  'Vary': 'Origin'
}

function jsonResponse(status: number, body: any) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS })
}

// Declaración para el tipado de Deno en el linter de TypeScript fuera del entorno de ejecución
// @ts-ignore
declare const Deno: any;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: CORS_HEADERS })
  }
  try {
  // Leer cuerpo opcional para opciones de sincronización
  let body: any = {}
  try { body = await req.json(); } catch { /* sin cuerpo */ }

    const authHeader = req.headers.get('Authorization') || ''
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')! // funciona con JWT de usuario

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) return jsonResponse(401, { error: 'No autenticado' })

    // Obtener tokens Strava
    const { data: tokenRow, error: tokenErr } = await supabase
      .from('strava_tokens')
      .select('*')
      .eq('user_id', user.id)
      .single()
    if (tokenErr || !tokenRow) return jsonResponse(400, { error: 'Sin tokens Strava' })
    const savedScope: string | undefined = tokenRow.scope

    // Refrescar token si expiro
    let accessToken = tokenRow.access_token as string
    const now = Math.floor(Date.now() / 1000)
    if (tokenRow.expires_at && now >= tokenRow.expires_at) {
      const refresh = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: Deno.env.get('STRAVA_CLIENT_ID'),
          client_secret: Deno.env.get('STRAVA_CLIENT_SECRET'),
          grant_type: 'refresh_token',
          refresh_token: tokenRow.refresh_token,
        }),
      })
      if (!refresh.ok) return jsonResponse(400, { error: 'No se pudo refrescar token Strava' })
      const refreshJson = await refresh.json()
      accessToken = refreshJson.access_token
      await supabase
        .from('strava_tokens')
        .update({
          access_token: refreshJson.access_token,
          refresh_token: refreshJson.refresh_token ?? tokenRow.refresh_token,
          expires_at: refreshJson.expires_at,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
    }

    // Configuración de ventana de búsqueda
  const full = !!body.full
  const reset = !!body.reset
  const debug = !!body.debug
  const noAfter = !!body.noAfter // fuerza traer sin filtro after (solo páginas recientes)
  const daysParam = typeof body.days === 'number' && body.days > 0 ? Math.min(body.days, 365) : undefined
  const lookbackDays = full ? 180 : (daysParam ?? 30)

    const { data: lastActivity } = await supabase
      .from('strava_activities')
      .select('start_date')
      .eq('user_id', user.id)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    let sinceDate: Date
    if (noAfter) {
      sinceDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000) // informativo
    } else if (reset || !lastActivity) {
      sinceDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)
    } else {
      const requestedDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)
      const lastDate = new Date(lastActivity.start_date)
      sinceDate = requestedDate < lastDate ? requestedDate : lastDate
    }

    const after = noAfter ? undefined : (Math.floor(sinceDate.getTime() / 1000) - 60)

    const perPage = 100
    let page = 1
    let fetched: StravaActivity[] = []
    // Strava activities endpoint soporta ?after y ?page&per_page
    let firstPageRaw: any = undefined
    let firstPageStatus: number | undefined
    while (true) {
      const url = noAfter
        ? `${STRAVA_API_BASE}/athlete/activities?page=${page}&per_page=${perPage}`
        : `${STRAVA_API_BASE}/athlete/activities?after=${after}&page=${page}&per_page=${perPage}`
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
      if (!resp.ok) return jsonResponse(400, { error: 'Error Strava activities', status: resp.status })
      const batch: StravaActivity[] = await resp.json()
      if (page === 1 && debug) {
        firstPageRaw = batch
        firstPageStatus = resp.status
      }
      if (batch.length === 0) break
      fetched = fetched.concat(batch)
      if (batch.length < perPage) break
      page++
      if (fetched.length > 1000) break // límite de seguridad
    }

    // Insertar solo nuevas actividades (evitar contar duplicados como importados)
    let imported = 0
    if (fetched.length) {
      const existingIdsRes = await supabase
        .from('strava_activities')
        .select('activity_id')
        .eq('user_id', user.id)
        .in('activity_id', fetched.map(f => f.id))
      if (existingIdsRes.error) return jsonResponse(500, { error: 'Error comprobando existentes', details: existingIdsRes.error })
      const existingSet = new Set(existingIdsRes.data.map(r => r.activity_id))
      const newRows = fetched.filter(a => !existingSet.has(a.id)).map(a => ({
        user_id: user.id,
        activity_id: a.id,
        name: a.name,
        distance_m: a.distance,
        moving_time: a.moving_time,
        start_date: a.start_date.substring(0, 10),
        sport_type: a.sport_type ?? null,
        raw: a,
      }))
      if (newRows.length) {
        const { error: insErr } = await supabase.from('strava_activities').insert(newRows)
        if (insErr) return jsonResponse(500, { error: 'Error insertando actividades', details: insErr })
      }
      imported = newRows.length
    }

  // Matching con workouts: marcar completado si hay actividad ese día con distancia similar (si podemos inferir distancia)
  // Traer workouts pendientes futuros y pasados recientes (últimos 30 días, próximos 7) para performance
    const today = new Date()
    const pastWindow = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
    const futureWindow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)

    const { data: workouts, error: wErr } = await supabase
      .from('workouts')
      .select('id, workout_date, description, is_completed')
      .eq('user_id', user.id)
      .gte('workout_date', pastWindow.toISOString().substring(0, 10))
      .lte('workout_date', futureWindow.toISOString().substring(0, 10))
    if (wErr) return jsonResponse(500, { error: 'Error leyendo workouts', details: wErr })

    // Agrupar actividades por fecha
    const { data: actsData, error: actsErr } = await supabase
      .from('strava_activities')
      .select('activity_id, distance_m, start_date')
      .eq('user_id', user.id)
      .gte('start_date', pastWindow.toISOString().substring(0, 10))
    if (actsErr) return jsonResponse(500, { error: 'Error leyendo actividades', details: actsErr })

  const actsByDate: Record<string, { distance_m: number }[]> = {}
    for (const a of actsData) {
      (actsByDate[a.start_date] ||= []).push({ distance_m: a.distance_m })
    }

  const updates: { id: string; is_completed: boolean }[] = []
    let matchedWorkouts = 0
  const matchedRules: Record<string,string> = {}
    // Función para inferir distancia (km) desde la descripción: busca patrones "10 km", "10k", "10.5 km" etc.
    const extractDistanceKm = (description: string | null | undefined): number | undefined => {
      if (!description) return undefined
      const regex = /(\d+(?:[.,]\d+)?)\s?(?:km|k)\b/i
      const m = description.match(regex)
      if (!m) return undefined
      const val = parseFloat(m[1].replace(',', '.'))
      if (isNaN(val) || val <= 0) return undefined
      return val
    }
    for (const w of workouts) {
      if (w.is_completed) continue
      const dayActs = actsByDate[w.workout_date]
      if (!dayActs || !dayActs.length) continue
      let matched = false
      const inferredKm = extractDistanceKm(w.description)
      const targetM = inferredKm ? inferredKm * 1000 : undefined
      // Extraer minutos
      const timeMatch = w.description?.match(/(\d{1,3})\s?(?:min|mins|m)\b/i)
      const targetSecs = timeMatch ? parseInt(timeMatch[1], 10) * 60 : undefined
      const isRest = /\b(rest|descanso)\b/i.test(w.description || '')
      if (isRest) continue
      for (const act of dayActs) {
        // Filtrar sólo actividades con distancia > 200m (evita registros erróneos) y opcionalmente sport_type RUN (lo podríamos almacenar y filtrar en consulta)
        if (targetM) {
          const diff = Math.abs(act.distance_m - targetM)
          if (diff / targetM <= 0.25) { matched = true; matchedRules[w.id] = 'distance'; break }
        }
        if (!matched && targetSecs && act.distance_m > 200) {
          // Aproximar ritmo medio si existiera moving_time (no lo cargamos aquí, pero podríamos agregarlo). Usamos distancia para una heurística simple.
          // Si no tenemos moving_time compararemos sólo existencia de actividad si targetSecs existe.
          matched = true; matchedRules[w.id] = 'time'; break
        }
      }
      if (!matched && !targetM && !targetSecs) {
        // Fallback: cualquier actividad con >= 1km cuenta para workouts sin especificaciones
        if (dayActs.some(a => a.distance_m >= 1000)) { matched = true; matchedRules[w.id] = 'fallback_any'; }
      }
      if (matched) { updates.push({ id: w.id, is_completed: true }); matchedWorkouts++; }
    }

    if (updates.length) {
      for (const u of updates) {
        const { error: upWErr } = await supabase.from('workouts').update({ is_completed: true }).eq('id', u.id)
        if (upWErr) {
          // no abortar todo por un fallo puntual, pero registrar
          console.log('Workout update error', u.id, upWErr)
        }
      }
    }

    // Si debug, obtener info atleta y actividad reciente sin filtros para diagnosticar
    let athlete: any = undefined
    if (debug) {
      const aResp = await fetch(`${STRAVA_API_BASE}/athlete`, { headers: { Authorization: `Bearer ${accessToken}` } })
      if (aResp.ok) athlete = await aResp.json()
    }

    const responsePayload: any = {
      importedNew: imported,
      fetchedTotal: fetched.length,
      matchedWorkouts,
      lookbackDays,
      usedFull: full,
      reset,
      noAfter,
      range: { from: sinceDate.toISOString().substring(0, 10), to: new Date().toISOString().substring(0, 10) },
      sampleActivityIds: fetched.slice(0, 5).map(a => a.id),
      debugAthleteId: athlete?.id,
      storedScope: savedScope,
      hint: imported === 0 && fetched.length === 0 ? '0 actividades. Verifica: 1) Scope incluye activity:read (y activity:read_all si privadas). 2) Usuario realmente tiene actividades recientes. 3) Token vigente.' : undefined,
  note: 'matching distancia ±25%, luego tiempo (min), luego fallback actividad >=1km si sin métricas y no es descanso',
  matchedRules,
    }
    if (debug) {
      responsePayload.firstPageStatus = firstPageStatus
      responsePayload.firstPageRaw = firstPageRaw
      responsePayload.afterParam = after
    }
    return jsonResponse(200, responsePayload)
  } catch (e: any) {
    const msg = e?.message || String(e)
    // Intentar incluir stack parcial si existe
    const stack = e?.stack?.split('\n').slice(0,3).join('\n')
    return jsonResponse(500, { error: 'Unexpected', details: msg, stack })
  }
})
