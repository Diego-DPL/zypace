// mesocycleCore — shared logic for generating the next mesocycle.
// Used by generateNextMesocycle (HTTP callable) and the auto-generation
// scheduled function. Separated to avoid code duplication.

import { Firestore, FieldValue } from 'firebase-admin/firestore';
import {
  TrainingZones, PlanDay,
  secToMinStr, estimateZones,
  computePhases,
  buildFallbackMesocycle,
  buildDayScheduleHint,
  validateDayCompliance,
  buildStrengthInstructions,
  buildTrailBlock,
} from './planHelpers';

// Bump when prompt structure changes materially.
const PROMPT_VERSION = '2025-06-11-v3';

export interface GenerateMesocycleResult {
  success:           boolean;
  mesocycle_number:  number;
  mesocycle_start:   string;
  mesocycle_end:     string;
  workouts_added:    number;
  model:             string | null;
  fallback:          boolean;
  openAiError:       string | null;
  performance_note:  string;
}

export async function generateMesocycleCore(
  db: Firestore,
  uid: string,
  planId: string,
  apiKey: string,
  model: string,
  options?: { skipSubscriptionCheck?: boolean },
): Promise<GenerateMesocycleResult> {

  // ── 1. Load plan ────────────────────────────────────────────────
  const planDoc = await db.collection('users').doc(uid).collection('training_plans').doc(planId).get();
  if (!planDoc.exists) throw new Error('Plan no encontrado');
  const plan = planDoc.data()!;

  // ── 2. Load race ────────────────────────────────────────────────
  const primaryRaceId = plan.primary_race_id || plan.race_id;
  const raceDoc = await db.collection('users').doc(uid).collection('races').doc(primaryRaceId).get();
  if (!raceDoc.exists) throw new Error('Carrera no encontrada');
  const race = raceDoc.data()!;

  const raceDate  = new Date(race.date);
  const today     = new Date();
  const todayISO  = today.toISOString().split('T')[0];

  if (race.date < todayISO) throw new Error('La carrera ya pasó');

  // ── 3. Compute next mesocycle window ───────────────────────────
  const prevMesoNumber   = (plan.mesocycle_number   as number) || 1;
  const prevMesoEnd      = (plan.mesocycle_end_date  as string) || todayISO;
  const mesoLenWeeks     = (plan.mesocycle_length_weeks as number) || 5;
  const totalWeeks       = (plan.total_weeks         as number) || 1;

  const planStartISO = (plan.plan_start_date as string)
    || (() => {
         const derivedMs = raceDate.getTime() - (totalWeeks * 7 - 1) * 86400000;
         return new Date(derivedMs).toISOString().split('T')[0];
       })();

  const nextStart = new Date(prevMesoEnd + 'T00:00:00Z');
  nextStart.setUTCDate(nextStart.getUTCDate() + 1);

  if (nextStart > raceDate) throw new Error('El plan ya cubre hasta la fecha de la carrera');

  const nextStartISO = nextStart.toISOString().split('T')[0];

  const nextEndMs  = Math.min(
    nextStart.getTime() + mesoLenWeeks * 7 * 86400000 - 86400000,
    raceDate.getTime()
  );
  const nextEndDate    = new Date(nextEndMs);
  const nextEndISO     = nextEndDate.toISOString().split('T')[0];
  const nextMesoNumber = prevMesoNumber + 1;

  const planStartDate  = new Date(planStartISO + 'T00:00:00Z');
  const weeksElapsed   = Math.floor((nextStart.getTime() - planStartDate.getTime()) / (7 * 86400000));
  const mesoStartWeek  = weeksElapsed + 1;

  // ── 4. Load user doc + subscription check ─────────────────────
  const userDoc = await db.collection('users').doc(uid).get();
  const ud = userDoc.exists ? userDoc.data()! : {};

  if (!options?.skipSubscriptionCheck) {
    if (!ud.is_exempt && ud.subscription_status !== 'active' && ud.subscription_status !== 'trialing') {
      throw new Error('Necesitas una suscripción activa');
    }
  }

  // ── 5. Plan config ──────────────────────────────────────────────
  const goal             = (plan.goal as string) || '';
  const runDays          = Math.min(Math.max(Number(plan.run_days_per_week) || 4, 2), 7);
  const runDaysOfWeek    = Array.isArray(plan.run_days_of_week) ? (plan.run_days_of_week as number[]) : null;
  const includeStrength  = !!plan.include_strength;
  const strengthDaysOfWeek = Array.isArray(plan.strength_days_of_week) ? (plan.strength_days_of_week as number[]) : null;
  const strengthDaysCount  = includeStrength ? Math.min(Math.max(Number(plan.strength_days_per_week) || 1, 1), 3) : 0;
  const targetTimeSec      = Number(plan.target_race_time_sec) || null;
  const methodology        = ((plan.methodology || 'polarized') as string) as 'polarized' | 'norwegian' | 'classic';
  const distKm             = Number(race.distance) || 0;
  const phases             = computePhases(totalWeeks);
  const taperWeeks         = totalWeeks >= 8 ? 2 : 1;
  const totalMesocycles    = Math.ceil(totalWeeks / mesoLenWeeks);

  // ── 6. Runner profile ──────────────────────────────────────────
  const rp_experience    = (ud.runner_experience_level  as string) || (plan.experience_level  as string) || 'intermediate';
  const rp_ageRange      = (ud.runner_age_range          as string) || (plan.age_range          as string) || '30-39';
  const rp_weeklyKm      = Number(ud.runner_current_weekly_km)     || Number(plan.current_weekly_km)     || 40;
  const rp_longRun       = Number(ud.runner_longest_recent_run_km) || Number(plan.longest_recent_run_km) || 15;
  const rp_maxMin        = Number(ud.runner_max_session_minutes)   || Number(plan.max_session_minutes)   || 90;
  const rp_prefTime      = (ud.runner_preferred_training_time as string) || (plan.preferred_training_time as string) || 'any';
  const rp_hasInjury     = !!(ud.runner_has_recent_injury   ?? plan.has_recent_injury);
  const rp_injuryDetail  = (ud.runner_recent_injury_detail as string) || (plan.recent_injury_detail as string) || null;
  const rp_injuryAreas   = Array.isArray(ud.runner_injury_areas) ? (ud.runner_injury_areas as string[]) : Array.isArray(plan.injury_areas) ? (plan.injury_areas as string[]) : [];
  const rp_terrain       = (plan.race_terrain as string) || 'road';
  const rp_priority      = (plan.race_priority as string) || 'A';
  const rp_elevationGainM = Number(plan.elevation_gain_m) || Number(race.elevation_gain_m) || 0;
  const mountainDaysOfWeek = Array.isArray(plan.mountain_days_of_week) ? (plan.mountain_days_of_week as number[]) : null;
  const roadOnlyDaysOfWeek = Array.isArray(plan.road_only_days_of_week) ? (plan.road_only_days_of_week as number[]) : null;

  // ── 7. Future races with priorities ───────────────────────────
  interface RaceContext { name: string; date: string; distance?: string | null; priority: string; is_target?: boolean; }
  let racesContext: RaceContext[] | null = null;
  try {
    const racesSnap = await db.collection('users').doc(uid).collection('races').where('date', '>=', nextStartISO).get();
    if (!racesSnap.empty) {
      racesContext = racesSnap.docs.map(d => {
        const r = d.data();
        return {
          name:      (r.name as string) || '',
          date:      (r.date as string) || '',
          distance:  r.distance ? String(r.distance) : null,
          priority:  (r.priority as string) || (d.id === primaryRaceId ? 'A' : 'B'),
          is_target: d.id === primaryRaceId,
        };
      }).sort((a, b) => a.date.localeCompare(b.date));
    }
  } catch { /* non-critical */ }

  // ── 8. Latest weekly review ────────────────────────────────────
  let latestReview: Record<string, any> | null = null;
  try {
    const reviewsSnap = await db.collection('users').doc(uid).collection('weekly_reviews')
      .where('plan_id', '==', planId).orderBy('created_at', 'desc').limit(1).get();
    if (!reviewsSnap.empty) latestReview = reviewsSnap.docs[0].data();
  } catch { /* non-critical */ }

  // ── 9. Zones ────────────────────────────────────────────────────
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

  // ── 10. Previous mesocycle performance ─────────────────────────
  const since14 = new Date(today.getTime() - 14 * 86400000).toISOString().split('T')[0];
  const recentWorkoutsSnap = await db.collection('users').doc(uid).collection('workouts')
    .where('plan_id', '==', planId).where('workout_date', '>=', since14).where('workout_date', '<', todayISO).get();
  const recentWorkouts = recentWorkoutsSnap.docs.map(d => d.data());
  const runWorkouts    = recentWorkouts.filter(w => !/descanso|rest|fuerza/i.test(w.description || ''));
  const hasAdherenceData = runWorkouts.length > 0;
  const adherence        = hasAdherenceData ? runWorkouts.filter(w => w.is_completed).length / runWorkouts.length : null;

  const completedRunW = recentWorkouts.filter(w => w.is_completed && !/descanso|rest|fuerza/i.test(w.description || ''));
  const rpeVals = completedRunW.map((w: any) => w.rpe).filter((r: any): r is number => typeof r === 'number' && r > 0);
  const feelingMap: Record<string, number> = {};
  for (const w of completedRunW) { if (w.feeling) feelingMap[w.feeling] = (feelingMap[w.feeling] || 0) + 1; }
  const avgRpe = rpeVals.length > 0 ? Math.round(rpeVals.reduce((a: number, b: number) => a + b, 0) / rpeVals.length * 10) / 10 : null;
  const easyRpeVals = completedRunW.filter((w: any) => (w.explanation_json?.type === 'suave' || w.explanation_json?.type === 'largo') && w.rpe > 0).map((w: any) => w.rpe as number);
  const avgEasyRpe = easyRpeVals.length > 0 ? easyRpeVals.reduce((a: number, b: number) => a + b, 0) / easyRpeVals.length : null;

  let fatigueScore = 40;
  if (avgEasyRpe !== null) {
    if (avgEasyRpe >= 8)      fatigueScore += 25;
    else if (avgEasyRpe >= 7) fatigueScore += 15;
    else if (avgEasyRpe >= 6) fatigueScore += 8;
    else if (avgEasyRpe <= 4) fatigueScore -= 10;
  }
  fatigueScore += Math.min(((feelingMap['tired'] || 0) + (feelingMap['very_tired'] || 0) * 2) * 12, 30);
  fatigueScore -= Math.min((feelingMap['great'] || 0) * 8, 20);
  if (adherence !== null && adherence < 0.5) fatigueScore -= 15;
  const fatigueIndex = Math.min(100, Math.max(0, Math.round(fatigueScore)));
  const fatigueLabel = fatigueIndex >= 75 ? 'ALTA — reducir carga del mesociclo' : fatigueIndex >= 55 ? 'moderada — mantener Z1 estricto' : 'baja — OK para progresar';
  const feelingSummary = Object.entries(feelingMap).length > 0 ? Object.entries(feelingMap).map(([f, n]) => `${f}×${n}`).join(', ') : 'sin datos';

  // ── 10b. Previous mesocycle snapshot ────────────────────────────
  let prevMesoTotalKm = 0, prevMesoAvgWeeklyKm = 0, prevMesoLongestRun = 0;
  if (prevMesoNumber >= 1 && plan.mesocycle_start_date) {
    try {
      const mesoWorkoutsSnap = await db.collection('users').doc(uid).collection('workouts')
        .where('plan_id', '==', planId).where('workout_date', '>=', plan.mesocycle_start_date as string).where('workout_date', '<=', prevMesoEnd).get();
      const mesoWorkouts  = mesoWorkoutsSnap.docs.map(d => d.data());
      const mesoCompleted = mesoWorkouts.filter((w: any) => w.is_completed).length;
      const mesoAdherence = mesoWorkouts.length > 0 ? Math.round((mesoCompleted / mesoWorkouts.length) * 100) : null;
      const mesoKm = mesoWorkouts.filter((w: any) => w.is_completed).reduce((s: number, w: any) => s + (w.distance_km || 0), 0);
      prevMesoTotalKm       = Math.round(mesoKm * 10) / 10;
      prevMesoAvgWeeklyKm   = mesoLenWeeks > 0 ? Math.round(prevMesoTotalKm / mesoLenWeeks) : 0;
      prevMesoLongestRun    = Math.round(mesoWorkouts.filter((w: any) => w.is_completed && (w.distance_km || 0) > 0).reduce((max: number, w: any) => Math.max(max, w.distance_km || 0), 0) * 10) / 10;

      await db.collection('users').doc(uid).collection('mesocycle_history').add({
        plan_id: planId, race_id: primaryRaceId, mesocycle_number: prevMesoNumber,
        start_date: plan.mesocycle_start_date, end_date: prevMesoEnd,
        total_workouts: mesoWorkouts.length, completed_workouts: mesoCompleted,
        adherence_pct: mesoAdherence, total_km: prevMesoTotalKm,
        avg_rpe: avgRpe, fatigue_index: fatigueIndex,
        feelings_summary: Object.entries(feelingMap).map(([f, n]) => ({ feeling: f, count: n })),
        created_at: FieldValue.serverTimestamp(),
      });
    } catch { /* non-critical */ }
  }

  // ── 10c. Sprint 3: last 7-10 real workout descriptions ─────────
  let lastWorkoutsBlock = '';
  try {
    const last10Snap = await db.collection('users').doc(uid).collection('workouts')
      .where('plan_id', '==', planId).where('workout_date', '<', todayISO)
      .orderBy('workout_date', 'desc').limit(10).get();
    const last10 = last10Snap.docs.map(d => d.data());
    if (last10.length > 0) {
      const lines = last10.map((w: any) => {
        const state = w.is_completed ? '✓' : '✗';
        const rpe   = w.rpe ? ` RPE=${w.rpe}` : '';
        const feel  = w.feeling ? ` sen=${w.feeling}` : '';
        return `  ${w.workout_date} [${state}] ${w.description?.substring(0, 80) || '—'}${rpe}${feel}`;
      }).join('\n');
      lastWorkoutsBlock = `ÚLTIMOS ENTRENAMIENTOS REALES (más reciente primero):\n${lines}\n→ Usa este historial para ajustar la progresión. Si hay muchos ✗ es señal de carga excesiva.`;
    }
  } catch { /* non-critical */ }

  const performanceNote = !hasAdherenceData
    ? 'Sin datos de adherencia recientes — mantener carga planificada de forma conservadora.'
    : (adherence as number) < 0.60
    ? `ATENCIÓN: adherencia baja (${Math.round((adherence as number) * 100)}%) — reducir ligeramente la carga.`
    : (adherence as number) >= 0.90
    ? `Excelente adherencia (${Math.round((adherence as number) * 100)}%) — se puede mantener o aumentar levemente la carga.`
    : `Adherencia normal (${Math.round((adherence as number) * 100)}%) — mantener carga planificada.`;

  const volumeNote = prevMesoTotalKm > 0
    ? `VOLUMEN MESOCICLO ANTERIOR (real completado):
  • Km totales: ${prevMesoTotalKm} km en ${mesoLenWeeks} semanas (~${prevMesoAvgWeeklyKm} km/semana)
  • Rodaje largo más largo: ${prevMesoLongestRun} km
  → PROGRESIÓN OBLIGATORIA: aumentar volumen semanal 5-10% respecto al anterior (~${Math.round(prevMesoAvgWeeklyKm * 1.07)} km/semana aprox).`
    : '';

  // ── 11. Build prompt ────────────────────────────────────────────
  const DAY_NAMES_ES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const phasesBlock   = phases.map(p => `  • ${p.name.toUpperCase()} (sem ${p.startWeek}→${p.endWeek}): ${p.rule}`).join('\n');
  const zonesBlock    = zones ? `ZONAS: Z1=${zones.z1} · Z4=${zones.z4} · Z5=${zones.z5} · Objetivo=${zones.race}` : 'Sin zonas. Usar RPE: Z1=5/10, Z4=8/10, Z5=9-10/10.';
  const strengthNote  = includeStrength
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
    strengthDaysCount, distKm, experienceLevel: rp_experience, terrain: rp_terrain,
    hasRecentInjury: rp_hasInjury, injuryDetail: rp_injuryDetail, injuryAreas: rp_injuryAreas,
  }) : '';

  const expLabel      = rp_experience === 'beginner' ? 'Principiante (<1 año)' : rp_experience === 'intermediate' ? 'Intermedio (1-3 años)' : rp_experience === 'advanced' ? 'Avanzado (3+ años)' : 'Élite/Sub-élite';
  const isTrailRace   = rp_terrain === 'trail' || rp_terrain === 'mixed';
  const terrainLabel  = rp_terrain === 'trail' ? `trail/montaña${rp_elevationGainM > 0 ? ` · ${rp_elevationGainM}D+` : ''}` : rp_terrain === 'mixed' ? `mixto asfalto+trail${rp_elevationGainM > 0 ? ` · ${rp_elevationGainM}D+` : ''}` : rp_terrain === 'track' ? 'pista atletismo' : 'asfalto/ciudad';
  const priorityLabel = rp_priority === 'A' ? 'Carrera A — taper completo' : rp_priority === 'B' ? 'Carrera B — taper parcial 3-4 días' : 'Carrera C — sin taper';
  const injuryBlock   = (() => {
    const parts: string[] = [];
    if (rp_hasInjury) parts.push(`LESIÓN RECIENTE: "${rp_injuryDetail || 'sí, sin detalles'}" — evitar series hasta semana 2`);
    const areas = rp_injuryAreas.filter((a: string) => a !== 'Sin lesiones conocidas');
    if (areas.length > 0) parts.push(`Zonas crónicas: ${areas.join(', ')}`);
    return parts.length > 0 ? parts.join(' · ') : 'Sin lesiones';
  })();

  const runnerProfileBlock = `PERFIL DEL CORREDOR:
  • Nivel: ${expLabel} · Edad: ${rp_ageRange} · Vol actual: ~${rp_weeklyKm} km/sem
  • Largo reciente: ~${rp_longRun} km · Máx sesión: ${rp_maxMin} min — NO superar
  • Momento: ${rp_prefTime === 'morning' ? 'mañana' : rp_prefTime === 'afternoon' ? 'tarde' : rp_prefTime === 'evening' ? 'noche' : 'flexible'} · Terreno: ${terrainLabel} · ${priorityLabel}
  • Lesiones: ${injuryBlock}`;

  const fatigueBlock = `ESTADO DE FATIGA ACTUAL (últimos 14 días):
  • Índice: ${fatigueIndex}/100 — ${fatigueLabel}
  • RPE medio: ${avgRpe !== null ? `${avgRpe}/10` : 'sin datos'} · Sensaciones: ${feelingSummary}
  ${fatigueIndex >= 75 ? '→ OBLIGATORIO: reducir vol e intensidad. Máx 1 sesión calidad/sem primeras 2 semanas.' : fatigueIndex >= 55 ? '→ Vol estable, cuidar intensidades. Z1 estricto.' : '→ Atleta fresco. Progresar según plan.'}`;

  const READINESS_LABELS: Record<string, string> = { ready: 'Listo — subir carga', normal: 'Normal — mantener', lighter: 'Necesita suavizar — −20-25% vol', rest: 'Necesita descanso — ≤50% vol' };
  const LIFE_CONTEXT_LABELS: Record<string, string> = { normal: 'Semana normal', stress: 'Estresante — menos calidad', travel: 'Viajes — sesiones cortas', illness: 'No se encuentra bien', great: 'Con energía — más carga' };
  const weeklyReviewBlock = latestReview
    ? `CHECK-IN DEL ATLETA:\n  • Estado: ${READINESS_LABELS[latestReview.readiness] || latestReview.readiness || 'sin datos'}\n  • Contexto: ${LIFE_CONTEXT_LABELS[latestReview.life_context] || latestReview.life_context || 'sin datos'}\n  • Notas: ${latestReview.notes || 'ninguna'}${latestReview.readiness === 'rest' ? '\n  → OBLIGATORIO: mínimo (solo Z1 ≤30min primeros 4 días).' : latestReview.readiness === 'lighter' ? '\n  → Reducir 20-25% respecto a lo planificado.' : ''}`
    : 'CHECK-IN: sin datos.';

  const methodologyBlock = methodology === 'norwegian'
    ? 'MÉTODO NORUEGO: 2 umbral/sem (mar+jue), todo lo demás Z1 estricto.'
    : methodology === 'classic'
    ? 'PERIODIZACIÓN CLÁSICA: Series mar (Z5) · Tempo jue (Z4) · Largo dom (Z1).'
    : 'MÉTODO POLARIZADO (Seiler): 80% vol Z1 puro, 20% Z4-Z5. Máx 2 calidad/sem, nunca consecutivas.';

  const racesCalendarBlock = racesContext && racesContext.length > 1
    ? `CALENDARIO DE OBJETIVOS (${racesContext.length} carreras):\n${racesContext.map(r => `  • ${r.name} · ${r.date}${r.distance ? ' · ' + r.distance : ''} · ${r.priority === 'A' ? 'Prioridad A — taper completo' : r.priority === 'B' ? 'Prioridad B — taper parcial (3-4 días)' : 'Prioridad C — sin taper'}${r.is_target ? ' ← OBJETIVO' : ''}`).join('\n')}\nRespeta los tapers. B/C no interrumpen bloque de carga.`
    : '';

  const surfaceBlock = (mountainDaysOfWeek && mountainDaysOfWeek.length > 0) || (roadOnlyDaysOfWeek && roadOnlyDaysOfWeek.length > 0)
    ? `RESTRICCIÓN DE SUPERFICIE (OBLIGATORIO):\n${mountainDaysOfWeek && mountainDaysOfWeek.length > 0 ? `• MONTAÑA ÚNICAMENTE los: ${mountainDaysOfWeek.map(d => DAY_NAMES_ES[d]).join(', ')}.` : ''}\n${roadOnlyDaysOfWeek && roadOnlyDaysOfWeek.length > 0 ? `• SOLO ASFALTO ÚNICAMENTE los: ${roadOnlyDaysOfWeek.map(d => DAY_NAMES_ES[d]).join(', ')}.` : ''}`
    : '';

  const developerInstructions = `Eres un entrenador de running científico. Devuelve SOLO JSON válido. [v:${PROMPT_VERSION}]

FORMATO (running/descanso):
{"plan":[{"date":"YYYY-MM-DD","description":"descripción ejecutable","explanation":{"type":"series|umbral|tempo|largo|suave|subida|descanso","purpose":"objetivo fisiológico","details":"instrucciones paso a paso","intensity":"zona/ritmo/RPE o null","elevation_gain_m":null,"phase":"base|desarrollo|especifico|taper"}}]}
TRAIL — type==="subida": elevation_gain_m con metros desnivel. En description: "Xmin/YD+" o "Xkm/YD+".

FORMATO (fuerza):
{"plan":[{"date":"YYYY-MM-DD","description":"descripción breve","explanation":{"type":"fuerza","purpose":"...","exercises":[{"sets":3,"reps":"10","name":"Nombre","notes":"obs breve"}],"details":"instrucciones generales","intensity":null,"elevation_gain_m":null,"phase":"..."}}]}
REGLAS FUERZA: exercises lista TODOS los ejercicios individualmente. Mínimo 4/sesión.

PLAN: ${race.name} · ${distKm || '?'}km · ${race.date} · ${totalWeeks} semanas totales
MESOCICLO: ${nextMesoNumber} de ${totalMesocycles} — SOLO ${nextStartISO} → ${nextEndISO} (semanas ${mesoStartWeek}-${mesoStartWeek + mesoLenWeeks - 1})
${runDaysOfWeek && runDaysOfWeek.length > 0 ? `Running FIJO los: ${runDaysOfWeek.map(d => DAY_NAMES_ES[d]).join(', ')}` : `Días running/sem: ${runDays}`} · ${strengthNote}
Objetivo: ${goal} · Ritmo objetivo: ${targetPace || 'no definido'}

${runnerProfileBlock}

${fatigueBlock}

${weeklyReviewBlock}

${zonesBlock}

FASES:
${phasesBlock}

RENDIMIENTO ANTERIOR: ${performanceNote}
${volumeNote}

${lastWorkoutsBlock}

${methodologyBlock}
${racesCalendarBlock ? '\n' + racesCalendarBlock : ''}
${surfaceBlock ? '\n' + surfaceBlock : ''}
${isTrailRace ? '\n' + buildTrailBlock(rp_elevationGainM, distKm) : ''}${strengthBlock ? '\n' + strengthBlock + '\n' : ''}${scheduleHint ? `
CALENDARIO OBLIGATORIO:
${scheduleHint}
RUNNING=carrera · FUERZA=fuerza running-specific · Descanso=descanso. NO cambies días.` : ''}
REGLAS:
1. Descarga cada 4ª semana del plan
2. Máx ${distKm >= 42 ? '32km' : distKm >= 21 ? '20km' : distKm >= 10 ? '15km' : '12km'} largo
3. Sin calidad en días consecutivos
4. BASE: solo Z1
5. Adaptar carga al perfil y fatiga
6. Ninguna sesión supere ${rp_maxMin} min
7. EXACTAMENTE ${runDays} sesión/es running/semana.
${distKm >= 15 ? '8. Una sesión/semana DEBE ser type="largo".' : ''}
Genera EXACTAMENTE las fechas ${nextStartISO} a ${nextEndISO}. Nada más.`;

  // ── 12. OpenAI call ─────────────────────────────────────────────
  async function callResponsesAPI(activeModel: string): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: activeModel,
        max_output_tokens: 16384,
        text:  { format: { type: 'json_object' } },
        input: [
          { role: 'developer', content: developerInstructions },
          { role: 'user',      content: `Genera el mesociclo ${nextMesoNumber} (${nextStartISO} → ${nextEndISO}) del plan para ${race.name}.` },
        ],
      }),
      signal: AbortSignal.timeout(120_000),
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
    return {
      text: combined,
      inputTokens:  data?.usage?.input_tokens  || 0,
      outputTokens: data?.usage?.output_tokens || 0,
    };
  }

  let rawContent: string | null = null;
  let openAiError: string | null = null;
  let usedModel: string | null = null;
  let inputTokens = 0, outputTokens = 0;

  for (const m of [model, 'gpt-4o-mini']) {
    try {
      const r   = await callResponsesAPI(m);
      rawContent    = r.text;
      inputTokens   = r.inputTokens;
      outputTokens  = r.outputTokens;
      usedModel     = m;
      break;
    } catch (err) {
      openAiError = (err as Error).message;
    }
  }

  // ── 13. Parse + validate ────────────────────────────────────────
  let parsedPlan: { plan: PlanDay[] } | null = null;
  if (rawContent) {
    const first = rawContent.indexOf('{');
    const last  = rawContent.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      try { parsedPlan = JSON.parse(rawContent.slice(first, last + 1).trim()); } catch { /* ignore */ }
    }
  }

  if (parsedPlan?.plan && Array.isArray(parsedPlan.plan)) {
    const aiOk = validateDayCompliance(
      parsedPlan.plan,
      runDaysOfWeek && runDaysOfWeek.length > 0 ? runDaysOfWeek : null,
      strengthDaysOfWeek && strengthDaysOfWeek.length > 0 ? strengthDaysOfWeek : null,
      runDays,
    );
    if (!aiOk) { parsedPlan = null; usedModel = null; }
  }

  if (!parsedPlan || !parsedPlan.plan || !Array.isArray(parsedPlan.plan)) {
    parsedPlan = buildFallbackMesocycle({
      startISO: nextStartISO, endISO: nextEndISO, totalWeeks, mesocycleStartWeek: mesoStartWeek,
      phases, taperWeeks, runDays,
      runDaysOfWeek:      runDaysOfWeek && runDaysOfWeek.length > 0 ? runDaysOfWeek : null,
      includeStrength, strengthDaysOfWeek: strengthDaysOfWeek ?? null, strengthDaysCount, distKm, methodology, zones,
    });
    if (!usedModel) usedModel = `fallback-${methodology}`;
  }

  // ── 14. Write workouts ──────────────────────────────────────────
  const distRegex = /(\d+(?:[.,]\d+)?)\s?(?:km|k)\b/i;
  const durRegex  = /(\d{1,3})\s?(?:min|mins)\b/i;

  // Idempotency: delete existing workouts in range
  const existingSnap = await db.collection('users').doc(uid).collection('workouts')
    .where('plan_id', '==', planId).where('workout_date', '>=', nextStartISO).where('workout_date', '<=', nextEndISO).get();
  if (!existingSnap.empty) {
    const delBatch = db.batch();
    existingSnap.docs.forEach(d => delBatch.delete(d.ref));
    await delBatch.commit();
  }

  const batch = db.batch();
  for (const w of parsedPlan.plan) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(w.date)) continue;
    const desc  = w.description || '';
    const dMatch = desc.match(distRegex);
    const tMatch = desc.match(durRegex);
    const wRef   = db.collection('users').doc(uid).collection('workouts').doc();
    batch.set(wRef, {
      plan_id: planId, workout_date: w.date, description: desc,
      distance_km:      dMatch ? parseFloat(dMatch[1].replace(',', '.')) : null,
      duration_min:     tMatch ? parseInt(tMatch[1], 10) : null,
      elevation_gain_m: (w.explanation as any)?.elevation_gain_m ?? null,
      explanation_json: w.explanation || null,
      is_completed: false, created_at: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();

  // ── 15. Update plan metadata ────────────────────────────────────
  await planDoc.ref.update({
    mesocycle_number:     nextMesoNumber,
    mesocycle_start_date: nextStartISO,
    mesocycle_end_date:   nextEndISO,
    updated_at:           FieldValue.serverTimestamp(),
  });

  // ── 16. Log generation ──────────────────────────────────────────
  await db.collection('users').doc(uid).collection('generation_log').add({
    kind:          'mesocycle',
    plan_id:       planId,
    meso_num:      nextMesoNumber,
    model:         usedModel,
    prompt_version: PROMPT_VERSION,
    input_tokens:  inputTokens,
    output_tokens: outputTokens,
    created_at:    new Date(),
  });

  return {
    success:          true,
    mesocycle_number: nextMesoNumber,
    mesocycle_start:  nextStartISO,
    mesocycle_end:    nextEndISO,
    workouts_added:   parsedPlan.plan.length,
    model:            usedModel,
    fallback:         !rawContent || (usedModel?.startsWith('fallback') ?? false),
    openAiError,
    performance_note: performanceNote,
  };
}
