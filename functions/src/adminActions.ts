import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const REGION = 'europe-west1';

async function assertAdmin(uid: string | undefined): Promise<void> {
  if (!uid) throw new HttpsError('unauthenticated', 'No autenticado');
  const doc = await getFirestore().collection('users').doc(uid).get();
  if (doc.data()?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Solo administradores');
  }
}

async function assertNotSelf(callerUid: string, targetUid: string): Promise<void> {
  if (callerUid === targetUid) {
    throw new HttpsError('invalid-argument', 'No puedes realizar esta acción sobre tu propia cuenta');
  }
}

async function assertNotAdmin(targetUid: string): Promise<void> {
  const doc = await getFirestore().collection('users').doc(targetUid).get();
  if (doc.data()?.role === 'admin') {
    throw new HttpsError('permission-denied', 'No puedes realizar esta acción sobre otro administrador');
  }
}

/**
 * Ban or unban a user (disables/enables their Firebase Auth account).
 */
export const adminBanUser = onCall(
  { region: REGION, cors: true, invoker: 'public' },
  async (request) => {
    const callerUid = request.auth?.uid;
    await assertAdmin(callerUid);

    const { targetUid, banned } = request.data as { targetUid: string; banned: boolean };
    if (!targetUid) throw new HttpsError('invalid-argument', 'Falta targetUid');

    await assertNotSelf(callerUid!, targetUid);
    await assertNotAdmin(targetUid);

    // Disable/enable Firebase Auth account
    await getAuth().updateUser(targetUid, { disabled: banned });

    // Persist banned flag in Firestore for UI display
    await getFirestore().collection('users').doc(targetUid).update({ banned });

    return { success: true, banned };
  }
);

/**
 * Permanently deletes a user: Firestore data, Storage index, and Firebase Auth account.
 */
export const adminDeleteUser = onCall(
  { region: REGION, cors: true, invoker: 'public' },
  async (request) => {
    const callerUid = request.auth?.uid;
    await assertAdmin(callerUid);

    const { targetUid } = request.data as { targetUid: string };
    if (!targetUid) throw new HttpsError('invalid-argument', 'Falta targetUid');

    await assertNotSelf(callerUid!, targetUid);
    await assertNotAdmin(targetUid);

    const db = getFirestore();

    // Grab athlete_id before deleting tokens subcollection
    const tokenDoc = await db.collection('users').doc(targetUid).collection('strava_tokens').doc('default').get();
    const athleteId = tokenDoc.exists ? tokenDoc.data()?.athlete_id : null;

    // Delete all subcollections
    const subcollections = [
      'strava_tokens',
      'strava_activities',
      'training_plans',
      'training_plan_versions',
      'workouts',
      'races',
    ];
    for (const col of subcollections) {
      const snap = await db.collection('users').doc(targetUid).collection(col).get();
      if (snap.empty) continue;
      const batch = db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    // Delete user Firestore document
    await db.collection('users').doc(targetUid).delete();

    // Remove from Strava athlete index
    if (athleteId) {
      await db.collection('strava_athlete_index').doc(String(athleteId)).delete();
    }

    // Delete all incidents created by this user
    const incidentsSnap = await db.collection('incidents').where('user_uid', '==', targetUid).get();
    if (!incidentsSnap.empty) {
      const batch = db.batch();
      incidentsSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    // Delete Firebase Auth account last
    await getAuth().deleteUser(targetUid);

    return { success: true };
  }
);

/**
 * Deletes a specific training plan and all its associated workouts.
 */
export const adminDeletePlan = onCall(
  { region: REGION, cors: true, invoker: 'public' },
  async (request) => {
    await assertAdmin(request.auth?.uid);

    const { targetUid, planId } = request.data as { targetUid: string; planId: string };
    if (!targetUid || !planId) throw new HttpsError('invalid-argument', 'Faltan parámetros');

    const db = getFirestore();

    // Delete workouts linked to this plan
    const workoutsSnap = await db
      .collection('users').doc(targetUid)
      .collection('workouts')
      .where('plan_id', '==', planId)
      .get();
    if (!workoutsSnap.empty) {
      const batch = db.batch();
      workoutsSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    // Delete plan versions
    const versionsSnap = await db
      .collection('users').doc(targetUid)
      .collection('training_plan_versions')
      .where('plan_id', '==', planId)
      .get();
    if (!versionsSnap.empty) {
      const batch = db.batch();
      versionsSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    // Delete the plan document
    await db.collection('users').doc(targetUid).collection('training_plans').doc(planId).delete();

    return { success: true };
  }
);
