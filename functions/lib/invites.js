"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listInvites = exports.revokeInvite = exports.createInvite = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const auth_1 = require("firebase-admin/auth");
const emailService_1 = require("./emailService");
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
// ── createInvite ──────────────────────────────────────────────────────
exports.createInvite = (0, https_1.onCall)({ region: REGION, cors: true, invoker: 'public', secrets: [emailService_1.resendApiKey] }, async (request) => {
    var _a;
    await assertAdmin((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid);
    const { email, notes } = request.data;
    if (!(email === null || email === void 0 ? void 0 : email.trim()))
        throw new https_1.HttpsError('invalid-argument', 'Falta el email');
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizedEmail) || normalizedEmail.length > 254) {
        throw new https_1.HttpsError('invalid-argument', 'Email inválido');
    }
    const db = (0, firestore_1.getFirestore)();
    const existing = await db.collection('invites').doc(normalizedEmail).get();
    if (existing.exists) {
        throw new https_1.HttpsError('already-exists', 'Ya existe una invitación para este email');
    }
    await db.collection('invites').doc(normalizedEmail).set({
        email: normalizedEmail,
        is_exempt: true,
        created_at: firestore_1.Timestamp.now(),
        notes: (notes === null || notes === void 0 ? void 0 : notes.trim()) || null,
        used: false,
    });
    // Check if a Firebase Auth user already exists with this email.
    // If so, apply is_exempt immediately (the onUserCreated trigger won't fire again).
    let isExistingUser = false;
    try {
        const authUser = await (0, auth_1.getAuth)().getUserByEmail(normalizedEmail);
        // User exists — apply exemption directly on their Firestore doc
        await db.collection('users').doc(authUser.uid).update({ is_exempt: true });
        await db.collection('invites').doc(normalizedEmail).update({
            used: true,
            used_at: firestore_1.Timestamp.now(),
            used_by: authUser.uid,
        });
        isExistingUser = true;
        console.log(`[createInvite] Applied invite to existing user: ${normalizedEmail} (uid: ${authUser.uid})`);
    }
    catch (err) {
        const code = err === null || err === void 0 ? void 0 : err.code;
        if (code !== 'auth/user-not-found') {
            // Unexpected error — log but don't fail; invite doc is already saved
            console.error('[createInvite] Error checking existing user:', err);
        }
        // auth/user-not-found is expected — invite will be applied at account creation via trigger
    }
    // Send invite email (different copy depending on whether they already have an account)
    try {
        await (0, emailService_1.sendInviteEmail)(normalizedEmail, isExistingUser);
        console.log(`[createInvite] Invite email sent to: ${normalizedEmail} (existingUser=${isExistingUser})`);
    }
    catch (err) {
        console.error('[createInvite] Failed to send invite email:', err);
        // Don't fail the whole function — invite is saved, email is best-effort
    }
    console.log(`[createInvite] Invite created for: ${normalizedEmail}`);
    return { success: true, email: normalizedEmail };
});
// ── revokeInvite ──────────────────────────────────────────────────────
exports.revokeInvite = (0, https_1.onCall)({ region: REGION, cors: true, invoker: 'public' }, async (request) => {
    var _a;
    await assertAdmin((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid);
    const { email } = request.data;
    if (!(email === null || email === void 0 ? void 0 : email.trim()))
        throw new https_1.HttpsError('invalid-argument', 'Falta el email');
    const normalizedEmail = email.trim().toLowerCase();
    await (0, firestore_1.getFirestore)().collection('invites').doc(normalizedEmail).delete();
    console.log(`[revokeInvite] Invite revoked for: ${normalizedEmail}`);
    return { success: true };
});
// ── listInvites ───────────────────────────────────────────────────────
exports.listInvites = (0, https_1.onCall)({ region: REGION, cors: true, invoker: 'public' }, async (request) => {
    var _a;
    await assertAdmin((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid);
    const snap = await (0, firestore_1.getFirestore)()
        .collection('invites')
        .orderBy('created_at', 'desc')
        .get();
    return snap.docs.map(d => {
        var _a, _b, _c, _d;
        const data = d.data();
        return {
            email: d.id,
            is_exempt: data.is_exempt,
            used: data.used,
            notes: data.notes,
            created_at: (_b = (_a = data.created_at) === null || _a === void 0 ? void 0 : _a.toMillis()) !== null && _b !== void 0 ? _b : null,
            used_at: (_d = (_c = data.used_at) === null || _c === void 0 ? void 0 : _c.toMillis()) !== null && _d !== void 0 ? _d : null,
        };
    });
});
//# sourceMappingURL=invites.js.map