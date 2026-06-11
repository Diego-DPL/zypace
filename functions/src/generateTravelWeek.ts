import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

interface TravelWeekRequest {
  plan_id: string;
  mode: 'travel' | 'illness'; // travel = 1-2 easy runs; illness = full rest
}

function isoDate(d: Date): string {
  return d.toISOString().substring(0, 10);
}

// Replaces all incomplete workouts in the current week with minimal-load sessions.
// Travel: keeps 1-2 easy 30-min runs. Illness: full rest.
// Past workouts (completed or already done) are never touched.
export const generateTravelWeek = onCall(
  { region: 'europe-west1', cors: true, invoker: 'public' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'No autenticado');

    const { plan_id: planId, mode = 'travel' } = (request.data ?? {}) as TravelWeekRequest;
    if (!planId) throw new HttpsError('invalid-argument', 'Falta plan_id');

    const db = getFirestore();

    // Verify plan belongs to user
    const planSnap = await db.collection('users').doc(uid).collection('training_plans').doc(planId).get();
    if (!planSnap.exists) throw new HttpsError('not-found', 'Plan no encontrado');

    // Current week boundaries (Mon–Sun)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayOfWeek = today.getDay(); // 0=Sun
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const monISO = isoDate(monday);
    const sunISO = isoDate(sunday);
    const todayISO = isoDate(today);

    // Load this week's workouts
    const weekSnap = await db.collection('users').doc(uid).collection('workouts')
      .where('plan_id', '==', planId)
      .where('workout_date', '>=', monISO)
      .where('workout_date', '<=', sunISO)
      .get();

    if (weekSnap.empty) throw new HttpsError('not-found', 'No hay entrenamientos esta semana');

    // Decide which days get a light run (travel: Wed + Sat if available, else 2 spread-out days)
    const futureDates = weekSnap.docs
      .filter(d => d.data().workout_date >= todayISO && !d.data().is_completed)
      .map(d => d.data().workout_date as string)
      .sort();

    let lightRunDates: Set<string> = new Set();
    if (mode === 'travel' && futureDates.length >= 2) {
      // Pick 1st and last uncompleted day for easy runs, rest is rest
      lightRunDates.add(futureDates[0]);
      lightRunDates.add(futureDates[futureDates.length - 1]);
    }

    const batch = db.batch();
    let replaced = 0;

    for (const wDoc of weekSnap.docs) {
      const w = wDoc.data();
      if (w.is_completed || w.workout_date < todayISO) continue;

      const date = w.workout_date as string;
      const isLightRun = lightRunDates.has(date);

      const description = isLightRun
        ? 'Rodaje suave de recuperación 30 min Z1. Pace muy cómodo, conversación fluida. Mantener el hábito durante el viaje.'
        : 'Descanso activo. Estiramientos suaves 10-15 min o caminar. Prioriza el sueño y la recuperación.';

      const explanationType = isLightRun ? 'suave' : 'descanso';

      batch.update(wDoc.ref, {
        description,
        distance_km:   isLightRun ? 5 : null,
        duration_min:  isLightRun ? 30 : null,
        explanation_json: {
          type:    explanationType,
          purpose: isLightRun ? 'Mantenimiento del hábito aeróbico en modo viaje' : 'Descanso completo',
          details: description,
        },
        travel_mode_original: w.description, // backup for restore
        travel_mode_applied: mode,
        updated_at: FieldValue.serverTimestamp(),
      });
      replaced++;
    }

    await batch.commit();

    return {
      success:      true,
      mode,
      replaced,
      week_start:   monISO,
      week_end:     sunISO,
      light_runs:   lightRunDates.size,
    };
  }
);
