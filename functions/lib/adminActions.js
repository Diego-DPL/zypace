"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminDeletePlan = exports.adminDeleteUser = exports.adminBanUser = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const auth_1 = require("firebase-admin/auth");
const REGION = 'europe-west1';
async function assertAdmin(uid) {
    var _a;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'No autenticado');
    const doc = await (0, firestore_1.getFirestore)().collection('users').doc(uid).get();
    if (((_a = doc.data()) === null || _a === void 0 ? void 0 : _a.role) !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Solo administradores');
    }
}
async function assertNotSelf(callerUid, targetUid) {
    if (callerUid === targetUid) {
        throw new https_1.HttpsError('invalid-argument', 'No puedes realizar esta acción sobre tu propia cuenta');
    }
}
async function assertTargetExists(targetUid) {
    var _a;
    const doc = await (0, firestore_1.getFirestore)().collection('users').doc(targetUid).get();
    if (!doc.exists)
        throw new https_1.HttpsError('not-found', 'Usuario no encontrado');
    if (((_a = doc.data()) === null || _a === void 0 ? void 0 : _a.role) === 'admin') {
        throw new https_1.HttpsError('permission-denied', 'No puedes realizar esta acción sobre otro administrador');
    }
}
async function writeAuditLog(action, callerUid, details) {
    try {
        await (0, firestore_1.getFirestore)().collection('audit_logs').add(Object.assign(Object.assign({ action, caller_uid: callerUid }, details), { timestamp: new Date().toISOString() }));
    }
    catch (err) {
        // Audit log failure must never break the actual operation
        console.error('[auditLog] Failed to write audit log:', err);
    }
}
/**
 * Ban or unban a user (disables/enables their Firebase Auth account).
 */
exports.adminBanUser = (0, https_1.onCall)({ region: REGION, cors: true, invoker: 'public' }, async (request) => {
    var _a;
    const callerUid = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    await assertAdmin(callerUid);
    const { targetUid, banned } = request.data;
    if (!targetUid)
        throw new https_1.HttpsError('invalid-argument', 'Falta targetUid');
    await assertNotSelf(callerUid, targetUid);
    await assertTargetExists(targetUid);
    // Disable/enable Firebase Auth account
    await (0, auth_1.getAuth)().updateUser(targetUid, { disabled: banned });
    // Persist banned flag in Firestore for UI display
    await (0, firestore_1.getFirestore)().collection('users').doc(targetUid).update({ banned });
    await writeAuditLog('ban_user', callerUid, { target_uid: targetUid, banned });
    return { success: true, banned };
});
/**
 * Permanently deletes a user: Firestore data, Storage index, and Firebase Auth account.
 */
exports.adminDeleteUser = (0, https_1.onCall)({ region: REGION, cors: true, invoker: 'public' }, async (request) => {
    var _a, _b;
    const callerUid = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    await assertAdmin(callerUid);
    const { targetUid } = request.data;
    if (!targetUid)
        throw new https_1.HttpsError('invalid-argument', 'Falta targetUid');
    await assertNotSelf(callerUid, targetUid);
    await assertTargetExists(targetUid);
    const db = (0, firestore_1.getFirestore)();
    // Grab athlete_id before deleting tokens subcollection
    const tokenDoc = await db.collection('users').doc(targetUid).collection('strava_tokens').doc('default').get();
    const athleteId = tokenDoc.exists ? (_b = tokenDoc.data()) === null || _b === void 0 ? void 0 : _b.athlete_id : null;
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
        if (snap.empty)
            continue;
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
    await (0, auth_1.getAuth)().deleteUser(targetUid);
    await writeAuditLog('delete_user', callerUid, { target_uid: targetUid });
    return { success: true };
});
/**
 * Deletes a specific training plan and all its associated workouts.
 */
exports.adminDeletePlan = (0, https_1.onCall)({ region: REGION, cors: true, invoker: 'public' }, async (request) => {
    var _a;
    const callerUid = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    await assertAdmin(callerUid);
    const { targetUid, planId } = request.data;
    if (!targetUid || !planId)
        throw new https_1.HttpsError('invalid-argument', 'Faltan parámetros');
    const db = (0, firestore_1.getFirestore)();
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
    await writeAuditLog('delete_plan', callerUid, { target_uid: targetUid, plan_id: planId });
    return { success: true };
});
//# sourceMappingURL=adminActions.js.map