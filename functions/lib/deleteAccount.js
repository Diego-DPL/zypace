"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAccount = exports.stripeSecretKey = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const firestore_1 = require("firebase-admin/firestore");
const auth_1 = require("firebase-admin/auth");
/* eslint-disable @typescript-eslint/no-require-imports */
const Stripe = require('stripe');
const REGION = 'europe-west1';
exports.stripeSecretKey = (0, params_1.defineSecret)('STRIPE_SECRET_KEY');
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
exports.deleteAccount = (0, https_1.onCall)({ region: REGION, cors: true, invoker: 'public', secrets: [exports.stripeSecretKey] }, async (request) => {
    var _a, _b, _c;
    const uid = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Debes estar autenticado para eliminar tu cuenta.');
    const db = (0, firestore_1.getFirestore)();
    // ── 1. Cancel Stripe subscription if active ────────────────────
    try {
        const userSnap = await db.collection('users').doc(uid).get();
        const userData = userSnap.data();
        const customerId = userData === null || userData === void 0 ? void 0 : userData.stripe_customer_id;
        if (customerId) {
            const stripe = new Stripe(exports.stripeSecretKey.value(), { apiVersion: '2026-04-22.dahlia' });
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
    }
    catch (err) {
        // Non-fatal: log but continue with account deletion
        console.error('[deleteAccount] Stripe cancellation error:', err);
    }
    // ── 2. Grab athlete_id before deleting tokens ──────────────────
    let athleteId = null;
    try {
        const tokenDoc = await db.collection('users').doc(uid).collection('strava_tokens').doc('default').get();
        if (tokenDoc.exists)
            athleteId = String((_c = (_b = tokenDoc.data()) === null || _b === void 0 ? void 0 : _b.athlete_id) !== null && _c !== void 0 ? _c : '');
    }
    catch ( /* ignore */_d) { /* ignore */ }
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
        if (snap.empty)
            continue;
        // Batch delete (max 500 docs per batch)
        const chunks = [];
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
        }
        catch ( /* ignore */_e) { /* ignore */ }
    }
    // ── 6. Delete incidents created by this user ───────────────────
    try {
        const incSnap = await db.collection('incidents').where('user_uid', '==', uid).get();
        if (!incSnap.empty) {
            const batch = db.batch();
            incSnap.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
        }
    }
    catch ( /* ignore */_f) { /* ignore */ }
    // ── 7. Delete Firebase Auth account ───────────────────────────
    await (0, auth_1.getAuth)().deleteUser(uid);
    console.log(`[deleteAccount] Account permanently deleted: ${uid}`);
    return { success: true };
});
//# sourceMappingURL=deleteAccount.js.map