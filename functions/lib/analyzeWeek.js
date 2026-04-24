"use strict";
// analyzeWeek — Analiza los últimos 7 días de entrenamiento y propone ajustes.
// Basado en: adherencia al plan, desviación de ritmos (Strava), carga acumulada.
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeWeek = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
// ── Pace utilities ───────────────────────────────────────────
function parseTargetPace(intensity) {
    if (!intensity)
        return null;
    const m = intensity.match(/(\d+):(\d{2})\/km/);
    if (!m)
        return null;
    return parseInt(m[1]) * 60 + parseInt(m[2]);
}
function calcPace(distance_m, moving_time) {
    if (!distance_m || !moving_time || distance_m < 500)
        return null;
    return moving_time / (distance_m / 1000);
}
function extractKm(description) {
    const m = description.match(/(\d+(?:[.,]\d+)?)\s?(?:km|k)\b/i);
    if (!m)
        return null;
    return parseFloat(m[1].replace(',', '.'));
}
function adjustDescription(description, factor) {
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
exports.analyzeWeek = (0, https_1.onCall)({ region: 'europe-west1', cors: true, invoker: 'public' }, async (request) => {
    var _a, _b, _c, _d, _e;
    const uid = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'No autenticado');
    const db = (0, firestore_1.getFirestore)();
    const { plan_id: planId } = ((_b = request.data) !== null && _b !== void 0 ? _b : {});
    const today = new Date();
    const todayISO = today.toISOString().substring(0, 10);
    // ── 1. Obtener plan activo ───────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let activePlan = null;
    if (planId) {
        const planDoc = await db
            .collection('users').doc(uid)
            .collection('training_plans').doc(planId)
            .get();
        if (planDoc.exists) {
            activePlan = Object.assign({ id: planDoc.id }, planDoc.data());
        }
    }
    else {
        // Find the plan whose race is next in the future
        const plansSnap = await db
            .collection('users').doc(uid)
            .collection('training_plans')
            .orderBy('created_at', 'desc')
            .limit(10)
            .get();
        for (const pDoc of plansSnap.docs) {
            const p = pDoc.data();
            if (!p.race_id)
                continue;
            const raceDoc = await db
                .collection('users').doc(uid)
                .collection('races').doc(p.race_id)
                .get();
            if (raceDoc.exists && raceDoc.data().date >= todayISO) {
                activePlan = Object.assign(Object.assign({ id: pDoc.id }, p), { raceDate: raceDoc.data().date, raceDistanceKm: Number(raceDoc.data().distance) || 0 });
                break;
            }
        }
    }
    if (!activePlan) {
        throw new https_1.HttpsError('not-found', 'No hay plan activo con carrera futura. Crea un plan de entrenamiento primero.');
    }
    // Load race info if needed
    if (!activePlan.raceDate && activePlan.race_id) {
        const raceDoc = await db
            .collection('users').doc(uid)
            .collection('races').doc(activePlan.race_id)
            .get();
        if (raceDoc.exists) {
            activePlan.raceDate = raceDoc.data().date;
            activePlan.raceDistanceKm = Number(raceDoc.data().distance) || 0;
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
    const actsByDate = {};
    for (const d of actsSnap.docs) {
        const a = d.data();
        const date = a.start_date;
        (actsByDate[date] || (actsByDate[date] = [])).push({ distance_m: a.distance_m || 0, moving_time: a.moving_time || 0 });
    }
    // ── 5. Compute metrics ───────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allWorkouts = workoutsSnap.docs.map(d => (Object.assign({ id: d.id }, d.data())));
    const runWorkouts = allWorkouts.filter((w) => !/(descanso|rest|fuerza)\b/i.test(w.description || ''));
    const plannedRunCount = runWorkouts.length;
    const completedRunCount = runWorkouts.filter((w) => w.is_completed).length;
    const adherence = plannedRunCount > 0 ? completedRunCount / plannedRunCount : 1.0;
    let plannedKm = 0;
    for (const w of runWorkouts) {
        plannedKm += w.distance_km || extractKm(w.description || '') || 0;
    }
    let actualKm = 0;
    for (const acts of Object.values(actsByDate)) {
        for (const a of acts)
            actualKm += (a.distance_m || 0) / 1000;
    }
    actualKm = Math.round(actualKm * 10) / 10;
    // Pace analysis — ONLY continuous efforts (umbral/tempo), NOT series
    const continuousTypes = new Set(['umbral', 'tempo']);
    const qualityTypes = new Set(['series', 'umbral', 'tempo']);
    const completedContinuous = runWorkouts.filter((w) => { var _a; return continuousTypes.has(((_a = w.explanation_json) === null || _a === void 0 ? void 0 : _a.type) || '') && w.is_completed; });
    const paceDeviations = [];
    for (const w of completedContinuous) {
        const targetSec = parseTargetPace((_c = w.explanation_json) === null || _c === void 0 ? void 0 : _c.intensity);
        if (!targetSec)
            continue;
        const dayActs = actsByDate[w.workout_date] || [];
        if (!dayActs.length)
            continue;
        const planKm = w.distance_km || extractKm(w.description || '') || 0;
        const bestAct = [...dayActs].sort((a, b) => planKm
            ? Math.abs(a.distance_m / 1000 - planKm) - Math.abs(b.distance_m / 1000 - planKm)
            : b.distance_m - a.distance_m)[0];
        const actualSec = calcPace(bestAct.distance_m, bestAct.moving_time);
        if (!actualSec)
            continue;
        paceDeviations.push((actualSec - targetSec) / targetSec);
    }
    const avgPaceDev = paceDeviations.length > 0
        ? paceDeviations.reduce((a, b) => a + b, 0) / paceDeviations.length
        : null;
    const completedSeries = runWorkouts.filter((w) => { var _a; return ((_a = w.explanation_json) === null || _a === void 0 ? void 0 : _a.type) === 'series' && w.is_completed; }).length;
    const plannedSeries = runWorkouts.filter((w) => { var _a; return ((_a = w.explanation_json) === null || _a === void 0 ? void 0 : _a.type) === 'series'; }).length;
    // Load (pseudo-TSS)
    const intensityFactor = (type) => {
        if (type === 'series')
            return 3.5;
        if (type === 'umbral' || type === 'tempo')
            return 2.5;
        if (type === 'largo')
            return 1.2;
        return 1.0;
    };
    let plannedLoad = 0, actualLoad = 0;
    for (const w of runWorkouts) {
        const km = w.distance_km || extractKm(w.description || '') || 0;
        const factor = intensityFactor(((_d = w.explanation_json) === null || _d === void 0 ? void 0 : _d.type) || 'suave');
        plannedLoad += km * factor;
        if (w.is_completed) {
            const dayActs = actsByDate[w.workout_date] || [];
            const totalKm = dayActs.reduce((s, a) => s + (a.distance_m / 1000), km);
            actualLoad += totalKm * factor;
        }
    }
    const loadPct = plannedLoad > 0 ? Math.round((actualLoad / plannedLoad) * 100) : null;
    let verdict;
    let message;
    const seriesNote = plannedSeries > 0
        ? ` Series de pista: ${completedSeries}/${plannedSeries} completadas (el ritmo de series no se analiza — el GPS registra el promedio incluido el trote de recuperación).`
        : '';
    if (plannedRunCount === 0) {
        verdict = 'no_data';
        message = 'No hay entrenamientos de running planificados en los últimos 7 días para este plan.';
    }
    else if (adherence < 0.60) {
        verdict = 'underload';
        message = `Completaste ${completedRunCount} de ${plannedRunCount} entrenamientos (${Math.round(adherence * 100)}%). La próxima semana será más suave para que puedas retomar el ritmo.${seriesNote}`;
    }
    else if (avgPaceDev !== null && avgPaceDev > 0.10) {
        verdict = 'slow_paces';
        message = `Tus esfuerzos continuos (umbral/tempo) fueron un ${Math.round(avgPaceDev * 100)}% más lentos de lo planificado — señal de fatiga acumulada. Voy a reducir ligeramente la intensidad la próxima semana.${seriesNote}`;
    }
    else if (adherence >= 0.95 && (avgPaceDev === null || avgPaceDev <= 0.02)) {
        verdict = 'excellent';
        message = `¡Semana sobresaliente! ${completedRunCount}/${plannedRunCount} entrenamientos completados${avgPaceDev !== null ? ` y esfuerzos continuos en objetivo (${(avgPaceDev * 100).toFixed(1)}% desviación)` : ''}.${seriesNote}`;
    }
    else if (adherence >= 0.80 && (avgPaceDev === null || avgPaceDev <= 0.06)) {
        verdict = 'great_week';
        message = `Buena semana: ${completedRunCount}/${plannedRunCount} entrenamientos con ritmos continuos sólidos. Continúa con el plan.${seriesNote}`;
    }
    else {
        verdict = 'on_track';
        message = `Semana correcta: ${completedRunCount}/${plannedRunCount} entrenamientos. ${avgPaceDev !== null ? `Desviación media (umbral/tempo): ${(avgPaceDev * 100).toFixed(1)}%.` : ''}${seriesNote}`;
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
    const adjustments = [];
    const needsReduction = verdict === 'underload' || verdict === 'slow_paces';
    const canIncrease = verdict === 'excellent';
    const REDUCE_QUALITY = 0.75;
    const REDUCE_EASY = 0.85;
    const INCREASE = 1.15;
    let qualityAdjusted = 0;
    let easyAdjusted = 0;
    for (const wDoc of upcomingSnap.docs) {
        const w = wDoc.data();
        const wType = ((_e = w.explanation_json) === null || _e === void 0 ? void 0 : _e.type) || '';
        const isQuality = qualityTypes.has(wType);
        const isEasy = wType === 'suave' || wType === 'largo';
        if (!isQuality && !isEasy)
            continue;
        if (needsReduction) {
            if (isQuality && qualityAdjusted < 2) {
                const suggested = adjustDescription(w.description, REDUCE_QUALITY);
                if (suggested && suggested !== w.description) {
                    adjustments.push({
                        workout_id: wDoc.id,
                        date: w.workout_date,
                        original: w.description,
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
                        date: w.workout_date,
                        original: w.description,
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
                    date: w.workout_date,
                    original: w.description,
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
        },
    };
});
//# sourceMappingURL=analyzeWeek.js.map