// analyzeWeek — Analiza los últimos 7 días de entrenamiento y propone ajustes.
// Basado en: adherencia al plan, desviación de ritmos (Strava), carga acumulada.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

// ── Pace utilities ───────────────────────────────────────────

function parseTargetPace(intensity: string | null | undefined): number | null {
  if (!intensity) return null;
  const m = intensity.match(/(\d+):(\d{2})\/km/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

function calcPace(distance_m: number, moving_time: number): number | null {
  if (!distance_m || !moving_time || distance_m < 500) return null;
  return moving_time / (distance_m / 1000);
}

function extractKm(description: string): number | null {
  const m = description.match(/(\d+(?:[.,]\d+)?)\s?(?:km|k)\b/i);
  if (!m) return null;
  return parseFloat(m[1].replace(',', '.'));
}

function adjustDescription(description: string, factor: number): string | null {
  const desc = description.trim();

  const seriesM = desc.match(/^(Series)\s+(\d+)(×\S+.*)$/i);
  if (seriesM) {
    const newReps = Math.max(3, Math.round(parseInt(seriesM[2]) * factor));
    return `${seriesM[1]} ${newReps}${seriesM[3]}`;
  }

  const umbralM = desc.match(/^(Umbral)\s+(\d+)(×\S+.*)$/i);
  if (umbralM) {
    const newReps = Math.max(3, Math.round(parseInt(umbralM[2]) * factor));
    return `${umbralM[1]} ${newReps}${umbralM[3]}`;
  }

  const kmM = desc.match(/^(.+?\s)(\d+(?:\.\d+)?)(km\b.*)$/i);
  if (kmM) {
    const newKm = Math.max(3, Math.round(parseFloat(kmM[2]) * factor));
    return `${kmM[1]}${newKm}${kmM[3]}`;
  }

  return null;
}

// ── Function ─────────────────────────────────────────────────

export const analyzeWeek = onCall(
  { region: 'europe-west1', cors: true, invoker: 'public' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'No autenticado');

    const db = getFirestore();
    const { plan_id: planId } = (request.data ?? {}) as { plan_id?: string };

    const today = new Date();
    const todayISO = today.toISOString().substring(0, 10);

    // ── 1. Obtener plan activo ───────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let activePlan: any = null;

    if (planId) {
      const planDoc = await db
        .collection('users').doc(uid)
        .collection('training_plans').doc(planId)
        .get();
      if (planDoc.exists) {
        activePlan = { id: planDoc.id, ...planDoc.data() };
      }
    } else {
      // Find the plan whose race is next in the future
      const plansSnap = await db
        .collection('users').doc(uid)
        .collection('training_plans')
        .orderBy('created_at', 'desc')
        .limit(10)
        .get();

      for (const pDoc of plansSnap.docs) {
        const p = pDoc.data();
        if (!p.race_id) continue;
        const raceDoc = await db
          .collection('users').doc(uid)
          .collection('races').doc(p.race_id)
          .get();
        if (raceDoc.exists && (raceDoc.data()!.date as string) >= todayISO) {
          activePlan = { id: pDoc.id, ...p, raceDate: raceDoc.data()!.date, raceDistanceKm: Number(raceDoc.data()!.distance) || 0 };
          break;
        }
      }
    }

    if (!activePlan) {
      throw new HttpsError('not-found', 'No hay plan activo con carrera futura. Crea un plan de entrenamiento primero.');
    }

    // Load race info if needed
    if (!activePlan.raceDate && activePlan.race_id) {
      const raceDoc = await db
        .collection('users').doc(uid)
        .collection('races').doc(activePlan.race_id)
        .get();
      if (raceDoc.exists) {
        activePlan.raceDate = raceDoc.data()!.date;
        activePlan.raceDistanceKm = Number(raceDoc.data()!.distance) || 0;
      }
    }

    // ── 2. Analysis window: last 7 days ──────────────────────
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysAgoISO = sevenDaysAgo.toISOString().substring(0, 10);
    const yesterdayISO = new Date(today.getTime() - 86400000).toISOString().substring(0, 10);

    // ── 3. Planned workouts in window ────────────────────────
    const workoutsSnap = await db
      .collection('users').doc(uid)
      .collection('workouts')
      .where('plan_id', '==', activePlan.id)
      .where('workout_date', '>=', sevenDaysAgoISO)
      .where('workout_date', '<=', yesterdayISO)
      .orderBy('workout_date', 'asc')
      .get();

    // ── 4. Strava activities in window ───────────────────────
    const actsSnap = await db
      .collection('users').doc(uid)
      .collection('strava_activities')
      .where('start_date', '>=', sevenDaysAgoISO)
      .where('start_date', '<=', yesterdayISO)
      .get();

    const hasStravaData = !actsSnap.empty;

    const actsByDate: Record<string, Array<{ distance_m: number; moving_time: number; average_heartrate?: number; max_heartrate?: number; suffer_score?: number; average_cadence?: number }>> = {};
    for (const d of actsSnap.docs) {
      const a = d.data();
      const date = a.start_date as string;
      (actsByDate[date] ||= []).push({
        distance_m:        a.distance_m || 0,
        moving_time:       a.moving_time || 0,
        average_heartrate: a.average_heartrate ?? null,
        max_heartrate:     a.max_heartrate ?? null,
        suffer_score:      a.suffer_score ?? null,
        average_cadence:   a.average_cadence ?? null,
      });
    }

    // ── 5. Compute metrics ───────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allWorkouts = workoutsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    const runWorkouts = allWorkouts.filter((w: any) =>
      !/(descanso|rest|fuerza)\b/i.test(w.description || '')
    );
    const plannedRunCount   = runWorkouts.length;
    const completedRunCount = runWorkouts.filter((w: any) => w.is_completed).length;
    const adherence         = plannedRunCount > 0 ? completedRunCount / plannedRunCount : 1.0;

    let plannedKm = 0;
    for (const w of runWorkouts) {
      plannedKm += w.distance_km || extractKm(w.description || '') || 0;
    }

    let actualKm = 0;
    for (const acts of Object.values(actsByDate)) {
      for (const a of acts) actualKm += (a.distance_m || 0) / 1000;
    }
    actualKm = Math.round(actualKm * 10) / 10;

    // Pace analysis — ONLY continuous efforts (umbral/tempo), NOT series
    const continuousTypes = new Set(['umbral', 'tempo']);
    const qualityTypes    = new Set(['series', 'umbral', 'tempo']);

    const completedContinuous = runWorkouts.filter((w: any) =>
      continuousTypes.has(w.explanation_json?.type || '') && w.is_completed
    );

    const paceDeviations: number[] = [];
    for (const w of completedContinuous) {
      const targetSec = parseTargetPace(w.explanation_json?.intensity);
      if (!targetSec) continue;

      const dayActs = actsByDate[w.workout_date] || [];
      if (!dayActs.length) continue;

      const planKm = w.distance_km || extractKm(w.description || '') || 0;
      const bestAct = [...dayActs].sort((a, b) =>
        planKm
          ? Math.abs(a.distance_m / 1000 - planKm) - Math.abs(b.distance_m / 1000 - planKm)
          : b.distance_m - a.distance_m
      )[0];

      const actualSec = calcPace(bestAct.distance_m, bestAct.moving_time);
      if (!actualSec) continue;
      paceDeviations.push((actualSec - targetSec) / targetSec);
    }

    const avgPaceDev = paceDeviations.length > 0
      ? paceDeviations.reduce((a, b) => a + b, 0) / paceDeviations.length
      : null;

    // ── 5b. RPE & sensaciones from workout logs ───────────────
    const completedRunWorkouts = runWorkouts.filter((w: any) => w.is_completed);
    const rpeValues: number[] = completedRunWorkouts
      .map((w: any) => w.rpe)
      .filter((r: any): r is number => typeof r === 'number' && r > 0);

    const feelingCounts: Record<string, number> = {};
    for (const w of completedRunWorkouts) {
      if (w.feeling) { feelingCounts[w.feeling] = (feelingCounts[w.feeling] || 0) + 1; }
    }

    const avgRpe = rpeValues.length > 0
      ? Math.round((rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length) * 10) / 10
      : null;

    // ── 5c. Fatigue index (0–100, higher = more fatigued) ─────
    // Signals: high RPE on easy workouts, tired/very_tired feelings, high suffer scores, slow paces
    let fatigueScore = 40; // neutral baseline

    // RPE signal — easy workouts should be RPE 4–6; if higher, flags fatigue
    const easyWorkoutsWithRpe = completedRunWorkouts.filter((w: any) =>
      (w.explanation_json?.type === 'suave' || w.explanation_json?.type === 'largo') && w.rpe > 0
    );
    if (easyWorkoutsWithRpe.length > 0) {
      const avgEasyRpe = easyWorkoutsWithRpe.reduce((s: number, w: any) => s + w.rpe, 0) / easyWorkoutsWithRpe.length;
      if (avgEasyRpe >= 8)      fatigueScore += 25;
      else if (avgEasyRpe >= 7) fatigueScore += 15;
      else if (avgEasyRpe >= 6) fatigueScore += 8;
      else if (avgEasyRpe <= 4) fatigueScore -= 10; // very easy = good recovery
    }

    // Feeling signal
    const tiredCount = (feelingCounts['tired'] || 0) + (feelingCounts['very_tired'] || 0) * 2;
    const greatCount = feelingCounts['great'] || 0;
    fatigueScore += Math.min(tiredCount * 12, 30);
    fatigueScore -= Math.min(greatCount * 8, 20);

    // Suffer score signal — sum across the week
    let totalSufferScore = 0;
    for (const acts of Object.values(actsByDate)) {
      for (const a of acts) {
        if (a.suffer_score != null) totalSufferScore += a.suffer_score;
      }
    }
    if (totalSufferScore > 300)      fatigueScore += 20;
    else if (totalSufferScore > 200) fatigueScore += 10;
    else if (totalSufferScore > 100) fatigueScore += 5;

    // Pace deviation signal
    if (avgPaceDev !== null && avgPaceDev > 0.08)      fatigueScore += 15;
    else if (avgPaceDev !== null && avgPaceDev > 0.04) fatigueScore += 7;

    // Low adherence = less training = less fatigue buildup
    if (adherence < 0.5) fatigueScore -= 15;

    const fatigueIndex = Math.min(100, Math.max(0, Math.round(fatigueScore)));

    const completedSeries = runWorkouts.filter((w: any) => w.explanation_json?.type === 'series' && w.is_completed).length;
    const plannedSeries   = runWorkouts.filter((w: any) => w.explanation_json?.type === 'series').length;

    // Load (pseudo-TSS)
    const intensityFactor = (type: string) => {
      if (type === 'series') return 3.5;
      if (type === 'umbral' || type === 'tempo') return 2.5;
      if (type === 'largo') return 1.2;
      return 1.0;
    };

    let plannedLoad = 0, actualLoad = 0;
    for (const w of runWorkouts) {
      const km = w.distance_km || extractKm(w.description || '') || 0;
      const factor = intensityFactor(w.explanation_json?.type || 'suave');
      plannedLoad += km * factor;
      if (w.is_completed) {
        const dayActs = actsByDate[w.workout_date] || [];
        const totalKm = dayActs.reduce((s: number, a: any) => s + (a.distance_m / 1000), km);
        actualLoad += totalKm * factor;
      }
    }
    const loadPct = plannedLoad > 0 ? Math.round((actualLoad / plannedLoad) * 100) : null;

    // ── 6. Verdict ───────────────────────────────────────────
    type Verdict = 'underload' | 'slow_paces' | 'on_track' | 'great_week' | 'excellent' | 'no_data';
    let verdict: Verdict;
    let message: string;

    const seriesNote = plannedSeries > 0
      ? ` Series de pista: ${completedSeries}/${plannedSeries} completadas (el ritmo de series no se analiza — el GPS registra el promedio incluido el trote de recuperación).`
      : '';

    // Fatigue note for messages
    const fatigueNote = fatigueIndex >= 75
      ? ' Las sensaciones y métricas indican fatiga acumulada alta — necesitas más recuperación.'
      : fatigueIndex >= 55
      ? ' Señales de fatiga moderada — mantén los rodajes fáciles en Z1 estricto.'
      : '';

    if (plannedRunCount === 0) {
      verdict = 'no_data';
      message = 'No hay entrenamientos de running planificados en los últimos 7 días para este plan.';
    } else if (adherence < 0.60) {
      verdict = 'underload';
      message = `Completaste ${completedRunCount} de ${plannedRunCount} entrenamientos (${Math.round(adherence * 100)}%). La próxima semana será más suave para que puedas retomar el ritmo.${seriesNote}`;
    } else if (fatigueIndex >= 75 || (avgPaceDev !== null && avgPaceDev > 0.10)) {
      verdict = 'slow_paces';
      const trigger = fatigueIndex >= 75 && avgPaceDev !== null && avgPaceDev > 0.10
        ? `Ritmos un ${Math.round(avgPaceDev * 100)}% más lentos y fatiga elevada (índice ${fatigueIndex}/100)`
        : fatigueIndex >= 75
        ? `Índice de fatiga elevado (${fatigueIndex}/100)`
        : `Esfuerzos continuos un ${Math.round((avgPaceDev || 0) * 100)}% más lentos`;
      message = `${trigger} — señal de carga acumulada. Reduciendo ligeramente la intensidad próxima semana.${seriesNote}`;
    } else if (adherence >= 0.95 && (avgPaceDev === null || avgPaceDev <= 0.02) && fatigueIndex < 55) {
      verdict = 'excellent';
      message = `¡Semana sobresaliente! ${completedRunCount}/${plannedRunCount} entrenamientos${avgRpe !== null ? `, RPE medio ${avgRpe}` : ''}${avgPaceDev !== null ? `, ritmos en objetivo` : ''}.${seriesNote}`;
    } else if (adherence >= 0.80 && (avgPaceDev === null || avgPaceDev <= 0.06) && fatigueIndex < 65) {
      verdict = 'great_week';
      message = `Buena semana: ${completedRunCount}/${plannedRunCount} entrenamientos con ritmos sólidos.${fatigueNote}${seriesNote}`;
    } else {
      verdict = 'on_track';
      message = `Semana correcta: ${completedRunCount}/${plannedRunCount} entrenamientos. ${avgPaceDev !== null ? `Desviación ritmo (umbral/tempo): ${(avgPaceDev * 100).toFixed(1)}%.` : ''}${fatigueNote}${seriesNote}`;
    }

    // ── 7. Upcoming workouts (14 days) ───────────────────────
    const in14ISO = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
    const upcomingSnap = await db
      .collection('users').doc(uid)
      .collection('workouts')
      .where('plan_id', '==', activePlan.id)
      .where('workout_date', '>=', todayISO)
      .where('workout_date', '<=', in14ISO)
      .where('is_completed', '==', false)
      .orderBy('workout_date', 'asc')
      .get();

    // ── 8. Generate adjustment suggestions ───────────────────
    interface Adjustment {
      workout_id: string;
      date: string;
      original: string;
      suggested: string;
      reason: string;
      type: string;
    }

    const adjustments: Adjustment[] = [];
    const needsReduction = verdict === 'underload' || verdict === 'slow_paces' || fatigueIndex >= 70;
    const canIncrease    = verdict === 'excellent' && fatigueIndex < 45;

    const REDUCE_QUALITY = 0.75;
    const REDUCE_EASY    = 0.85;
    const INCREASE       = 1.15;

    let qualityAdjusted = 0;
    let easyAdjusted    = 0;

    for (const wDoc of upcomingSnap.docs) {
      const w = wDoc.data();
      const wType = w.explanation_json?.type || '';
      const isQuality = qualityTypes.has(wType);
      const isEasy    = wType === 'suave' || wType === 'largo';

      if (!isQuality && !isEasy) continue;

      if (needsReduction) {
        if (isQuality && qualityAdjusted < 2) {
          const suggested = adjustDescription(w.description, REDUCE_QUALITY);
          if (suggested && suggested !== w.description) {
            adjustments.push({
              workout_id: wDoc.id,
              date:       w.workout_date,
              original:   w.description,
              suggested,
              reason: verdict === 'underload'
                ? `Baja adherencia (${Math.round(adherence * 100)}%) — reducir carga para facilitar la recuperación.`
                : `Ritmos de calidad un ${Math.round((avgPaceDev || 0) * 100)}% más lentos — ajustar intensidad a tu forma actual.`,
              type: wType,
            });
            qualityAdjusted++;
          }
        }
        if (isEasy && easyAdjusted < 3) {
          const suggested = adjustDescription(w.description, REDUCE_EASY);
          if (suggested && suggested !== w.description) {
            adjustments.push({
              workout_id: wDoc.id,
              date:       w.workout_date,
              original:   w.description,
              suggested,
              reason: 'Reducir volumen general para favorecer recuperación.',
              type: wType,
            });
            easyAdjusted++;
          }
        }
      }

      if (canIncrease && isQuality && qualityAdjusted < 1) {
        const suggested = adjustDescription(w.description, INCREASE);
        if (suggested && suggested !== w.description) {
          adjustments.push({
            workout_id: wDoc.id,
            date:       w.workout_date,
            original:   w.description,
            suggested,
            reason: 'Semana excelente — pequeño aumento de carga de calidad.',
            type: wType,
          });
          qualityAdjusted++;
        }
      }
    }

    return {
      analysis: {
        week: `${sevenDaysAgoISO} → ${yesterdayISO}`,
        planned_run_workouts:   plannedRunCount,
        completed_run_workouts: completedRunCount,
        adherence_pct:          Math.round(adherence * 100),
        planned_km:             Math.round(plannedKm * 10) / 10,
        actual_km:              actualKm,
        load_pct:               loadPct,
        continuous_pace_deviation_pct: avgPaceDev !== null ? Math.round(avgPaceDev * 100) : null,
        planned_series:         plannedSeries,
        completed_series:       completedSeries,
        has_strava_data:        hasStravaData,
        avg_rpe:                avgRpe,
        fatigue_index:          fatigueIndex,
        feelings_summary:       Object.entries(feelingCounts).map(([feeling, count]) => ({ feeling, count })),
        total_suffer_score:     totalSufferScore > 0 ? totalSufferScore : null,
        pace_note: 'El análisis de ritmo solo aplica a esfuerzos continuos (umbral/tempo). Las series de pista se evalúan solo por adherencia.',
      },
      verdict,
      message,
      adjustments,
      meta: {
        plan_id:     activePlan.id,
        analyzed_at: new Date().toISOString(),
      },
    };
  }
);
