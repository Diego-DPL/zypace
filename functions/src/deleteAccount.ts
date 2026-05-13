import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret }       from 'firebase-functions/params';
import { getFirestore }       from 'firebase-admin/firestore';
import { getAuth }            from 'firebase-admin/auth';

/* eslint-disable @typescript-eslint/no-require-imports */
const Stripe = require('stripe');

const REGION = 'europe-west1';
export const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');

/**
 * Self-service account deletion.
 * Called by the authenticated user to permanently erase all their data.
 *
 * Steps:
 *  1. Cancel active Stripe subscription (immediate, no refund).
 *  2. Delete all Firestore subcollections.
 *  3. Delete the root user document.
 *  4. Remove from strava_athlete_index.
 *  5. Delete Firebase Auth account.
 */
export const deleteAccount = onCall(
  { region: REGION, cors: true, invoker: 'public', secrets: [stripeSecretKey] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Debes estar autenticado para eliminar tu cuenta.');

    const db = getFirestore();

    // ── 1. Cancel Stripe subscription if active ────────────────────
    try {
      const userSnap = await db.collection('users').doc(uid).get();
      const userData = userSnap.data();
      const customerId = userData?.stripe_customer_id as string | undefined;

      if (customerId) {
        const stripe = new Stripe(stripeSecretKey.value(), { apiVersion: '2026-04-22.dahlia' });
        const subs = await stripe.subscriptions.list({ customer: customerId, status: 'active', limit: 5 });
        for (const sub of subs.data) {
          await stripe.subscriptions.cancel(sub.id);
        }
        // Also cancel trialing subscriptions
        const trialSubs = await stripe.subscriptions.list({ customer: customerId, status: 'trialing', limit: 5 });
        for (const sub of trialSubs.data) {
          await stripe.subscriptions.cancel(sub.id);
        }
      }
    } catch (err) {
      // Non-fatal: log but continue with account deletion
      console.error('[deleteAccount] Stripe cancellation error:', err);
    }

    // ── 2. Grab athlete_id before deleting tokens ──────────────────
    let athleteId: string | null = null;
    try {
      const tokenDoc = await db.collection('users').doc(uid).collection('strava_tokens').doc('default').get();
      if (tokenDoc.exists) athleteId = String(tokenDoc.data()?.athlete_id ?? '');
    } catch { /* ignore */ }

    // ── 3. Delete all subcollections ───────────────────────────────
    const subcollections = [
      'strava_tokens',
      'strava_activities',
      'training_plans',
      'training_plan_versions',
      'workouts',
      'mesocycle_history',
      'races',
    ];
    for (const col of subcollections) {
      const snap = await db.collection('users').doc(uid).collection(col).get();
      if (snap.empty) continue;
      // Batch delete (max 500 docs per batch)
      const chunks: FirebaseFirestore.QueryDocumentSnapshot[][] = [];
      for (let i = 0; i < snap.docs.length; i += 400) {
        chunks.push(snap.docs.slice(i, i + 400));
      }
      for (const chunk of chunks) {
        const batch = db.batch();
        chunk.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
    }

    // ── 4. Delete user document ────────────────────────────────────
    await db.collection('users').doc(uid).delete();

    // ── 5. Remove from strava_athlete_index ───────────────────────
    if (athleteId) {
      try {
        await db.collection('strava_athlete_index').doc(athleteId).delete();
      } catch { /* ignore */ }
    }

    // ── 6. Delete incidents created by this user ───────────────────
    try {
      const incSnap = await db.collection('incidents').where('user_uid', '==', uid).get();
      if (!incSnap.empty) {
        const batch = db.batch();
        incSnap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
    } catch { /* ignore */ }

    // ── 7. Delete Firebase Auth account ───────────────────────────
    await getAuth().deleteUser(uid);

    console.log(`[deleteAccount] Account permanently deleted: ${uid}`);
    return { success: true };
  }
);
