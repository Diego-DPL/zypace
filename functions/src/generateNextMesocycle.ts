// generateNextMesocycle — Generates the next mesocycle for an existing training plan.
// Reads plan config from Firestore, analyses previous performance, and generates
// the next 4-6 week block. Appends workouts and updates plan metadata.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  TrainingZones, PlanDay,
  secToMinStr, estimateZones,
  computePhases, phaseForWeek,
  buildFallbackMesocycle,
  buildDayScheduleHint,
  validateDayCompliance,
  buildStrengthInstructions,
  buildTrailBlock,
} from './planHelpers';

const openAiApiKey = defineSecret('OPENAI_API_KEY');
const openAiModel  = defineSecret('OPENAI_MODEL');

export const generateNextMesocycle = onCall(
  { region: 'europe-west1', cors: true, invoker: 'public', secrets: [openAiApiKey, openAiModel], timeoutSeconds: 300, memory: '512MiB' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'No autenticado');

    const { plan_id: planId } = (request.data ?? {}) as { plan_id?: string };
    if (!planId) throw new HttpsError('invalid-argument', 'Falta plan_id');

    const db = getFirestore();

    // ── 1. Load plan ────────────────────────────────────────────
    const planDoc = await db.collection('users').doc(uid).collection('training_plans').doc(planId).get();
    if (!planDoc.exists) throw new HttpsError('not-found', 'Plan no encontrado');
    const plan = planDoc.data()!;

    // ── 2. Load race ────────────────────────────────────────────
    const primaryRaceId = plan.primary_race_id || plan.race_id;
    const raceDoc = await db.collection('users').doc(uid).collection('races').doc(primaryRaceId).get();
    if (!raceDoc.exists) throw new HttpsError('not-found', 'Carrera no encontrada');
    const race = raceDoc.data()!;

    const raceDate = new Date(race.date);
    const today    = new Date();
    const todayISO = today.toISOString().split('T')[0];

    if (raceDate < today) throw new HttpsError('failed-precondition', 'La carrera ya pasó');

    // ── 3. Current mesocycle state ──────────────────────────────
    const prevMesoNumber   = (plan.mesocycle_number   as number) || 1;
    const prevMesoEnd      = (plan.mesocycle_end_date  as string) || todayISO;
    const mesoLenWeeks     = (plan.mesocycle_length_weeks as number) || 5;
    const totalWeeks       = (plan.total_weeks         as number) || 1;
    const planStartISO     = (plan.mesocycle_start_date as string) || todayISO; // start of plan

    // Next mesocycle starts the day after current one ends
    const nextStart = new Date(prevMesoEnd + 'T00:00:00Z');
    nextStart.setUTCDate(nextStart.getUTCDate() + 1);

    if (nextStart > raceDate) {
      throw new HttpsError('failed-precondition', 'El plan ya cubre hasta la fecha de la carrera');
    }

    const nextStartISO = nextStart.toISOString().split('T')[0];

    // End of next mesocycle
    const nextEndMs  = Math.min(
      nextStart.getTime() + mesoLenWeeks * 7 * 86400000 - 86400000,
      raceDate.getTime()
    );
    const nextEndDate = new Date(nextEndMs);
    const nextEndISO  = nextEndDate.toISOString().split('T')[0];
    const nextMesoNumber = prevMesoNumber + 1;

    // Which week of the full plan does the next mesocycle start on?
    const planStartDate = new Date(planStartISO + 'T00:00:00Z');
    const weeksElapsed  = Math.floor((nextStart.getTime() - planStartDate.getTime()) / (7 * 86400000));
    const mesoStartWeek = weeksElapsed + 1;

    // ── 4. Plan config ──────────────────────────────────────────
    const goal             = (plan.goal as string) || '';
    const runDays          = Math.min(Math.max(Number(plan.run_days_per_week) || 4, 2), 7);
    const runDaysOfWeek    = Array.isArray(plan.run_days_of_week)
      ? (plan.run_days_of_week as number[])
      : null;
    const includeStrength  = !!plan.include_strength;
    const strengthDaysOfWeek = Array.isArray(plan.strength_days_of_week)
      ? (plan.strength_days_of_week as number[])
      : null;
    const strengthDaysCount = includeStrength
      ? Math.min(Math.max(Number(plan.strength_days_per_week) || 1, 1), 3)
      : 0;
    const targetTimeSec  = Number(plan.target_race_time_sec) || null;
    const methodology    = ((plan.methodology || 'polarized') as string) as 'polarized' | 'norwegian' | 'classic';
    const distKm         = Number(race.distance) || 0;

    const phases     = computePhases(totalWeeks);
    const taperWeeks = totalWeeks >= 8 ? 2 : 1;
    const totalMesocycles = Math.ceil(totalWeeks / mesoLenWeeks);

    // ── 4b. Runner profile (from user doc + plan fallback) ─────
    const userDoc = await db.collection('users').doc(uid).get();
    const ud = userDoc.exists ? userDoc.data()! : {};

    const rp_experience   = (ud.runner_experience_level  as string) || (plan.experience_level  as string) || 'intermediate';
    const rp_ageRange     = (ud.runner_age_range          as string) || (plan.age_range          as string) || '30-39';
    const rp_weeklyKm     = Number(ud.runner_current_weekly_km)     || Number(plan.current_weekly_km)     || 40;
    const rp_longRun      = Number(ud.runner_longest_recent_run_km) || Number(plan.longest_recent_run_km) || 15;
    const rp_maxMin       = Number(ud.runner_max_session_minutes)   || Number(plan.max_session_minutes)   || 90;
    const rp_prefTime     = (ud.runner_preferred_training_time as string) || (plan.preferred_training_time as string) || 'any';
    const rp_hasInjury    = !!(ud.runner_has_recent_injury   ?? plan.has_recent_injury);
    const rp_injuryDetail = (ud.runner_recent_injury_detail as string) || (plan.recent_injury_detail as string) || null;
    const rp_injuryAreas  = Array.isArray(ud.runner_injury_areas)
      ? (ud.runner_injury_areas as string[])
      : Array.isArray(plan.injury_areas) ? (plan.injury_areas as string[]) : [];
    const rp_terrain        = (plan.race_terrain as string) || 'road';
    const rp_priority       = (plan.race_priority as string) || 'A';
    const rp_elevationGainM = Number(plan.elevation_gain_m) || Number(race.elevation_gain_m) || 0;

    // ── 4c. Latest weekly review for this plan ────────────────────
    let latestReview: Record<string, any> | null = null;
    try {
      const reviewsSnap = await db
        .collection('users').doc(uid)
        .collection('weekly_reviews')
        .where('plan_id', '==', planId)
        .orderBy('created_at', 'desc')
        .limit(1)
        .get();
      if (!reviewsSnap.empty) latestReview = reviewsSnap.docs[0].data();
    } catch { /* non-critical */ }

    // ── 5. Zones ────────────────────────────────────────────────
    let zones: TrainingZones | null = null;
    let targetPace: string | null = null;

    if (targetTimeSec && distKm > 0) {
      zones = estimateZones(targetTimeSec, distKm);
      const pSec = targetTimeSec / distKm;
      targetPace = `${Math.floor(pSec / 60)}:${Math.round(pSec % 60).toString().padStart(2, '0')}/km`;
    } else if (plan.z1_sec_km && plan.z4_sec_km && plan.z5_sec_km) {
      zones = {
        z1:   secToMinStr(plan.z1_sec_km),
        z4:   secToMinStr(plan.z4_sec_km),
        z5:   secToMinStr(plan.z5_sec_km),
        race: secToMinStr(plan.z4_sec_km),
      };
    }

    // ── 6. Previous mesocycle performance summary ───────────────
    const since14 = new Date(today.getTime() - 14 * 86400000).toISOString().split('T')[0];
    const recentWorkoutsSnap = await db
      .collection('users').doc(uid)
      .collection('workouts')
      .where('plan_id', '==', planId)
      .where('workout_date', '>=', since14)
      .where('workout_date', '<', todayISO)
      .get();

    const recentWorkouts = recentWorkoutsSnap.docs.map(d => d.data());
    const runWorkouts    = recentWorkouts.filter(w => !/descanso|rest|fuerza/i.test(w.description || ''));
    const adherence      = runWorkouts.length > 0
      ? runWorkouts.filter(w => w.is_completed).length / runWorkouts.length
      : 1;

    // ── 6b. Fatigue signals from RPE + feelings ─────────────────
    const completedRunW = recentWorkouts.filter(w => w.is_completed && !/descanso|rest|fuerza/i.test(w.description || ''));
    const rpeVals = completedRunW
      .map((w: any) => w.rpe)
      .filter((r: any): r is number => typeof r === 'number' && r > 0);
    const feelingMap: Record<string, number> = {};
    for (const w of completedRunW) {
      if (w.feeling) feelingMap[w.feeling] = (feelingMap[w.feeling] || 0) + 1;
    }
    const avgRpe = rpeVals.length > 0
      ? Math.round(rpeVals.reduce((a: number, b: number) => a + b, 0) / rpeVals.length * 10) / 10
      : null;
    const easyRpeVals = completedRunW
      .filter((w: any) => (w.explanation_json?.type === 'suave' || w.explanation_json?.type === 'largo') && w.rpe > 0)
      .map((w: any) => w.rpe as number);
    const avgEasyRpe = easyRpeVals.length > 0
      ? easyRpeVals.reduce((a: number, b: number) => a + b, 0) / easyRpeVals.length
      : null;

    let fatigueScore = 40;
    if (avgEasyRpe !== null) {
      if (avgEasyRpe >= 8)      fatigueScore += 25;
      else if (avgEasyRpe >= 7) fatigueScore += 15;
      else if (avgEasyRpe >= 6) fatigueScore += 8;
      else if (avgEasyRpe <= 4) fatigueScore -= 10;
    }
    fatigueScore += Math.min(((feelingMap['tired'] || 0) + (feelingMap['very_tired'] || 0) * 2) * 12, 30);
    fatigueScore -= Math.min((feelingMap['great'] || 0) * 8, 20);
    if (adherence < 0.5) fatigueScore -= 15;
    const fatigueIndex = Math.min(100, Math.max(0, Math.round(fatigueScore)));
    const fatigueLabel = fatigueIndex >= 75 ? 'ALTA — reducir carga del mesociclo' :
                         fatigueIndex >= 55 ? 'moderada — mantener Z1 estricto' : 'baja — OK para progresar';

    const feelingSummary = Object.entries(feelingMap).length > 0
      ? Object.entries(feelingMap).map(([f, n]) => `${f}×${n}`).join(', ')
      : 'sin datos';

    // ── 6c. Save previous mesocycle history snapshot ─────────────
    if (prevMesoNumber >= 1 && plan.mesocycle_start_date) {
      try {
        const mesoWorkoutsSnap = await db
          .collection('users').doc(uid)
          .collection('workouts')
          .where('plan_id', '==', planId)
          .where('workout_date', '>=', plan.mesocycle_start_date as string)
          .where('workout_date', '<=', prevMesoEnd)
          .get();
        const mesoWorkouts = mesoWorkoutsSnap.docs.map(d => d.data());
        const mesoCompleted = mesoWorkouts.filter((w: any) => w.is_completed).length;
        const mesoAdherence = mesoWorkouts.length > 0
          ? Math.round((mesoCompleted / mesoWorkouts.length) * 100)
          : null;
        const mesoKm = mesoWorkouts
          .filter((w: any) => w.is_completed)
          .reduce((s: number, w: any) => s + (w.distance_km || 0), 0);
        await db.collection('users').doc(uid).collection('mesocycle_history').add({
          plan_id:             planId,
          race_id:             primaryRaceId,
          mesocycle_number:    prevMesoNumber,
          start_date:          plan.mesocycle_start_date,
          end_date:            prevMesoEnd,
          total_workouts:      mesoWorkouts.length,
          completed_workouts:  mesoCompleted,
          adherence_pct:       mesoAdherence,
          total_km:            Math.round(mesoKm * 10) / 10,
          avg_rpe:             avgRpe,
          fatigue_index:       fatigueIndex,
          feelings_summary:    Object.entries(feelingMap).map(([f, n]) => ({ feeling: f, count: n })),
          created_at:          FieldValue.serverTimestamp(),
        });
      } catch { /* non-critical — don't fail mesocycle generation */ }
    }

    const performanceNote = adherence < 0.60
      ? `ATENCIÓN: adherencia baja (${Math.round(adherence * 100)}%) — reducir ligeramente la carga del próximo mesociclo.`
      : adherence >= 0.90
      ? `Excelente adherencia (${Math.round(adherence * 100)}%) — se puede mantener o aumentar levemente la carga.`
      : `Adherencia normal (${Math.round(adherence * 100)}%) — mantener carga planificada.`;

    // ── 7. OpenAI call ──────────────────────────────────────────
    const apiKey = openAiApiKey.value();
    if (!apiKey) throw new HttpsError('internal', 'OPENAI_API_KEY no configurada');
    const model = openAiModel.value() || 'gpt-4o-mini';

    const phasesBlock = phases.map(p =>
      `  • ${p.name.toUpperCase()} (sem ${p.startWeek}→${p.endWeek}): ${p.rule}`
    ).join('\n');

    const zonesBlock = zones
      ? `ZONAS: Z1=${zones.z1} · Z4=${zones.z4} · Z5=${zones.z5} · Objetivo=${zones.race}`
      : 'Sin zonas calibradas. Usar RPE: Z1=5/10, Z4=8/10, Z5=9-10/10.';

    const DAY_NAMES_ES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    const strengthNote = includeStrength
      ? strengthDaysOfWeek && strengthDaysOfWeek.length > 0
        ? `Fuerza FIJA los: ${strengthDaysOfWeek.map(d => DAY_NAMES_ES[d]).join(', ')} — NO poner fuerza en otros días.`
        : `Fuerza: ${strengthDaysCount} sesión/es semana (días libres).`
      : 'Sin fuerza.';

    const scheduleHint = buildDayScheduleHint(
      nextStartISO, nextEndISO,
      runDaysOfWeek && runDaysOfWeek.length > 0 ? runDaysOfWeek : null,
      strengthDaysOfWeek && strengthDaysOfWeek.length > 0 ? strengthDaysOfWeek : null,
    );

    const strengthBlock = includeStrength ? buildStrengthInstructions({
      strengthDaysCount,
      distKm,
      experienceLevel:  rp_experience,
      terrain:          rp_terrain,
      hasRecentInjury:  rp_hasInjury,
      injuryDetail:     rp_injuryDetail,
      injuryAreas:      rp_injuryAreas,
    }) : '';

    // ── 7b. Build profile + fatigue blocks for prompt ──────────
    const expLabel = rp_experience === 'beginner'     ? 'Principiante (<1 año)' :
                     rp_experience === 'intermediate' ? 'Intermedio (1-3 años)' :
                     rp_experience === 'advanced'     ? 'Avanzado (3+ años)' : 'Élite/Sub-élite';
    const isTrailRace  = rp_terrain === 'trail' || rp_terrain === 'mixed';
    const terrainLabel = rp_terrain === 'trail'  ? `trail/montaña${rp_elevationGainM > 0 ? ` · ${rp_elevationGainM}D+` : ''}` :
                         rp_terrain === 'mixed'  ? `mixto asfalto+trail${rp_elevationGainM > 0 ? ` · ${rp_elevationGainM}D+` : ''}` :
                         rp_terrain === 'track'  ? 'pista atletismo' : 'asfalto/ciudad';
    const priorityLabel = rp_priority === 'A' ? 'Carrera A — taper completo' :
                          rp_priority === 'B' ? 'Carrera B — taper parcial 3-4 días' : 'Carrera C — sin taper';
    const injuryBlock = (() => {
      const parts: string[] = [];
      if (rp_hasInjury) parts.push(`LESIÓN RECIENTE: "${rp_injuryDetail || 'sí, sin detalles'}" — evitar series hasta semana 2`);
      const areas = rp_injuryAreas.filter((a: string) => a !== 'Sin lesiones conocidas');
      if (areas.length > 0) parts.push(`Zonas crónicas: ${areas.join(', ')} — preventivos específicos`);
      return parts.length > 0 ? parts.join(' · ') : 'Sin lesiones ni limitaciones';
    })();

    const runnerProfileBlock = `PERFIL DEL CORREDOR (persistente — usar como guía de carga):
  • Nivel: ${expLabel}
  • Edad: ${rp_ageRange} años
  • Volumen actual: ~${rp_weeklyKm} km/semana
  • Rodaje largo reciente: ~${rp_longRun} km
  • Tiempo máximo/sesión: ${rp_maxMin} min — NO superar
  • Momento preferido: ${rp_prefTime === 'morning' ? 'mañana' : rp_prefTime === 'afternoon' ? 'tarde' : rp_prefTime === 'evening' ? 'noche' : 'flexible'}
  • Terreno objetivo: ${terrainLabel}
  • Prioridad carrera: ${priorityLabel}
  • Lesiones: ${injuryBlock}`;

    const fatigueBlock = `ESTADO DE FATIGA ACTUAL (últimos 14 días):
  • Índice de fatiga: ${fatigueIndex}/100 — ${fatigueLabel}
  • RPE medio: ${avgRpe !== null ? `${avgRpe}/10` : 'sin datos'}
  • Sensaciones reportadas: ${feelingSummary}
  ${fatigueIndex >= 75 ? '→ OBLIGATORIO: reducir volumen e intensidad este mesociclo. Máx 1 sesión de calidad/semana las primeras 2 semanas.' :
    fatigueIndex >= 55 ? '→ Mantener volumen pero cuidar intensidades. Z1 estricto en rodajes fáciles.' :
    '→ El atleta está fresco. Se puede progresar según plan.'}`;

    const READINESS_LABELS: Record<string, string> = {
      ready:   'Listo para atacar — puede subir carga',
      normal:  'Normal — mantener carga planificada',
      lighter: 'Necesita semana más suave — reducir volumen 20-25%',
      rest:    'Necesita descansar — reducir drásticamente (≤50% volumen normal)',
    };
    const LIFE_CONTEXT_LABELS: Record<string, string> = {
      normal:  'Semana normal',
      stress:  'Semana estresante — reducir sesiones de calidad',
      travel:  'Viajes/compromisos — priorizar sesiones cortas',
      illness: 'No se encuentra bien — solo rodajes suaves si se entrena',
      great:   'Con mucha energía — puede tolerar más carga',
    };
    const weeklyReviewBlock = latestReview
      ? `CHECK-IN DEL ATLETA (última revisión semanal):
  • Estado para próxima semana: ${READINESS_LABELS[latestReview.readiness] || latestReview.readiness || 'sin datos'}
  • Contexto vital: ${LIFE_CONTEXT_LABELS[latestReview.life_context] || latestReview.life_context || 'sin datos'}
  • Notas del atleta: ${latestReview.notes || 'ninguna'}
  ${latestReview.readiness === 'rest' ? '→ OBLIGATORIO: reducir carga al mínimo (solo rodajes suaves Z1 ≤30min los primeros 4 días).' :
    latestReview.readiness === 'lighter' ? '→ Reducir volumen semanal 20-25% respecto a lo planificado.' :
    latestReview.readiness === 'ready' || latestReview.life_context === 'great' ? '→ Atleta fresco y motivado — se puede progresar.' :
    ''}`
      : 'CHECK-IN DEL ATLETA: sin datos de revisión semanal.';

    const developerInstructions = `Eres un entrenador de running científico y personalizado. Devuelve SOLO JSON válido.

FORMATO (running/descanso):
{"plan":[{"date":"YYYY-MM-DD","description":"descripción ejecutable","explanation":{"type":"series|umbral|tempo|largo|suave|subida|descanso","purpose":"objetivo fisiológico","details":"instrucciones paso a paso","intensity":"zona/ritmo/RPE o null","elevation_gain_m":null,"phase":"base|desarrollo|especifico|taper"}}]}
TRAIL — cuando type==="subida": pon elevation_gain_m con los metros de desnivel de la sesión. Exprésalo en description como "Xmin/YD+" o "Xkm/YD+".

FORMATO (fuerza — usa SIEMPRE este cuando type==="fuerza"):
{"plan":[{"date":"YYYY-MM-DD","description":"descripción breve","explanation":{"type":"fuerza","purpose":"objetivo fisiológico","exercises":[{"sets":3,"reps":"10","name":"Nombre ejercicio","notes":"ritmo excéntrico, descanso u obs. breve — opcional"}],"details":"instrucciones generales de la sesión (calentamiento, orden, descansos entre series)","intensity":null,"elevation_gain_m":null,"phase":"base|desarrollo|especifico|taper"}}]}
REGLA: el campo exercises debe listar TODOS los ejercicios, uno por objeto. Mínimo 4 ejercicios por sesión de fuerza. "reps" puede ser "10", "10-12", "30s" o "1 min".

PLAN: ${race.name} · ${distKm || '?'}km · ${race.date} · ${totalWeeks} semanas totales
MESOCICLO A GENERAR: ${nextMesoNumber} de ${totalMesocycles} — SOLO desde ${nextStartISO} hasta ${nextEndISO} (semanas ${mesoStartWeek}-${mesoStartWeek + mesoLenWeeks - 1} del plan completo)
${runDaysOfWeek && runDaysOfWeek.length > 0
  ? `Running FIJO los: ${runDaysOfWeek.map(d => DAY_NAMES_ES[d]).join(', ')}`
  : `Días running/sem: ${runDays}`} · ${strengthNote}
Objetivo: ${goal} · Ritmo objetivo: ${targetPace || 'no definido'}

${runnerProfileBlock}

${fatigueBlock}

${weeklyReviewBlock}

${zonesBlock}

FASES DEL PLAN COMPLETO:
${phasesBlock}

RENDIMIENTO MESOCICLO ANTERIOR: ${performanceNote}

METODOLOGÍA: ${ methodology === 'norwegian' ? 'Noruego (doble umbral)' : methodology === 'classic' ? 'Clásica' : 'Polarizado (Seiler)' }
${isTrailRace ? buildTrailBlock(rp_elevationGainM, distKm) : ''}${strengthBlock ? `\n${strengthBlock}\n` : ''}${scheduleHint ? `
CALENDARIO OBLIGATORIO — sigue EXACTAMENTE esta estructura por fecha:
${scheduleHint}
Los días marcados RUNNING deben tener workout de carrera (suave, calidad o largo).
Los días marcados FUERZA deben tener sesión de fuerza running-specific.
Los días marcados Descanso deben ser descanso. NO cambies ningún día.` : ''}
REGLAS:
1. Descarga cada 4ª semana del plan (semana ${mesoStartWeek + 3} si aplica)
2. Sin calidad en días consecutivos
3. Fase BASE: cero calidad, solo Z1
4. Adaptar carga al estado de fatiga y perfil del corredor
5. Adaptar complejidad al nivel ${expLabel}
6. Ninguna sesión supere ${rp_maxMin} minutos

Genera EXACTAMENTE las fechas de ${nextStartISO} a ${nextEndISO}. Nada más.`;

    async function callResponsesAPI(activeModel: string): Promise<string> {
      const res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: activeModel,
          input: [
            { role: 'developer', content: developerInstructions },
            { role: 'user',      content: `Genera el mesociclo ${nextMesoNumber} (${nextStartISO} → ${nextEndISO}) del plan para ${race.name}.` },
          ],
        }),
        signal: AbortSignal.timeout(90_000),
      });
      const raw = await res.text();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any = null;
      try { data = JSON.parse(raw); } catch { /* keep raw */ }
      if (!res.ok) throw new Error(data?.error?.message || `OpenAI error ${res.status}`);

      const outputs: string[] = [];
      if (Array.isArray(data?.output)) {
        for (const item of data.output) {
          if (item?.content && Array.isArray(item.content)) {
            for (const c of item.content) {
              if (c.type === 'output_text' && typeof c.text === 'string') outputs.push(c.text);
            }
          }
        }
      }
      const combined = outputs.join('\n').trim();
      if (!combined) throw new Error('Respuesta OpenAI vacía');
      return combined;
    }

    let rawContent: string | null = null;
    let openAiError: string | null = null;
    let usedModel: string | null = null;

    for (const m of [model, 'gpt-4o-mini']) {
      try {
        rawContent = await callResponsesAPI(m);
        usedModel  = m;
        break;
      } catch (err) {
        openAiError = (err as Error).message;
      }
    }

    let parsedPlan: { plan: PlanDay[] } | null = null;
    if (rawContent) {
      const first = rawContent.indexOf('{');
      const last  = rawContent.lastIndexOf('}');
      if (first !== -1 && last !== -1 && last > first) {
        try { parsedPlan = JSON.parse(rawContent.slice(first, last + 1).trim()); }
        catch { /* ignore */ }
      }
    }

    // Validate AI respected specific day constraints; force fallback if not
    if (parsedPlan?.plan && Array.isArray(parsedPlan.plan)) {
      const aiOk = validateDayCompliance(
        parsedPlan.plan,
        runDaysOfWeek && runDaysOfWeek.length > 0 ? runDaysOfWeek : null,
        strengthDaysOfWeek && strengthDaysOfWeek.length > 0 ? strengthDaysOfWeek : null,
      );
      if (!aiOk) { parsedPlan = null; usedModel = null; }
    }

    if (!parsedPlan || !parsedPlan.plan || !Array.isArray(parsedPlan.plan)) {
      parsedPlan = buildFallbackMesocycle({
        startISO:           nextStartISO,
        endISO:             nextEndISO,
        totalWeeks,
        mesocycleStartWeek: mesoStartWeek,
        phases,
        taperWeeks,
        runDays,
        runDaysOfWeek:      runDaysOfWeek && runDaysOfWeek.length > 0 ? runDaysOfWeek : null,
        includeStrength,
        strengthDaysOfWeek: strengthDaysOfWeek ?? null,
        strengthDaysCount,
        distKm,
        methodology,
        zones,
      });
      if (!usedModel) usedModel = `fallback-${methodology}`;
    }

    // ── 8. Save workouts ────────────────────────────────────────
    const distRegex = /(\d+(?:[.,]\d+)?)\s?(?:km|k)\b/i;
    const durRegex  = /(\d{1,3})\s?(?:min|mins|m)\b/i;
    const batch = db.batch();

    for (const w of parsedPlan.plan) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(w.date)) continue;
      const desc: string = w.description || '';
      const dMatch = desc.match(distRegex);
      const tMatch = desc.match(durRegex);
      const wRef = db.collection('users').doc(uid).collection('workouts').doc();
      batch.set(wRef, {
        plan_id:          planId,
        workout_date:     w.date,
        description:      desc,
        distance_km:      dMatch ? parseFloat(dMatch[1].replace(',', '.')) : null,
        duration_min:     tMatch ? parseInt(tMatch[1], 10) : null,
        elevation_gain_m: (w.explanation as any)?.elevation_gain_m ?? null,
        explanation_json: w.explanation || null,
        is_completed:     false,
        created_at:       FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();

    // ── 9. Update plan metadata ─────────────────────────────────
    await planDoc.ref.update({
      mesocycle_number:       nextMesoNumber,
      mesocycle_start_date:   nextStartISO,
      mesocycle_end_date:     nextEndISO,
      updated_at:             FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      mesocycle_number:   nextMesoNumber,
      mesocycle_start:    nextStartISO,
      mesocycle_end:      nextEndISO,
      workouts_added:     parsedPlan.plan.length,
      model:              usedModel,
      fallback:           !rawContent || usedModel?.startsWith('fallback'),
      openAiError,
      performance_note:   performanceNote,
    };
  }
);
