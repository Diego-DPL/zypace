import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

interface RescheduleRequest {
  workout_id: string;
}

// Finds the next free day (no existing workout) up to 7 days ahead and moves the missed workout there.
export const rescheduleMissedWorkout = onCall(
  { region: 'europe-west1', cors: true, invoker: 'public' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'No autenticado');

    const { workout_id: workoutId } = (request.data ?? {}) as RescheduleRequest;
    if (!workoutId) throw new HttpsError('invalid-argument', 'Falta workout_id');

    const db = getFirestore();
    const workoutRef = db.collection('users').doc(uid).collection('workouts').doc(workoutId);
    const workoutSnap = await workoutRef.get();

    if (!workoutSnap.exists) throw new HttpsError('not-found', 'Entrenamiento no encontrado');

    const workout = workoutSnap.data()!;
    if (workout.is_completed) throw new HttpsError('failed-precondition', 'El entrenamiento ya está completado');

    const originalDate = workout.workout_date as string;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString().substring(0, 10);

    if (originalDate >= todayISO) throw new HttpsError('failed-precondition', 'Solo se pueden reprogramar entrenamientos pasados');

    // Find next free day from tomorrow up to 7 days ahead
    let newDateISO: string | null = null;
    for (let offset = 1; offset <= 7; offset++) {
      const candidate = new Date(today.getTime() + offset * 86400000);
      const candidateISO = candidate.toISOString().substring(0, 10);

      const existingSnap = await db.collection('users').doc(uid).collection('workouts')
        .where('workout_date', '==', candidateISO)
        .where('workout_type', '!=', 'descanso')
        .limit(1)
        .get();

      if (existingSnap.empty) {
        newDateISO = candidateISO;
        break;
      }
    }

    if (!newDateISO) {
      throw new HttpsError('resource-exhausted', 'No hay días libres en los próximos 7 días para reprogramar el entrenamiento');
    }

    await workoutRef.update({
      workout_date:     newDateISO,
      rescheduled_from: originalDate,
      updated_at:       FieldValue.serverTimestamp(),
    });

    return { success: true, new_date: newDateISO, original_date: originalDate };
  }
);
