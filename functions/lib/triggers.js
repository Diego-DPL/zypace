"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onIncidentUpdated = exports.onPlanCreated = exports.onUserCreated = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("firebase-admin/firestore");
const emailService_1 = require("./emailService");
/**
 * Sends a welcome email when a new user document is created in Firestore.
 * Fires on: users/{uid} creation (triggered by RegisterPage on sign-up).
 */
exports.onUserCreated = (0, firestore_1.onDocumentCreated)({ document: 'users/{uid}', region: 'europe-west1', secrets: [emailService_1.resendApiKey] }, async (event) => {
    var _a;
    const data = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!data)
        return;
    const email = data.email;
    const firstName = data.first_name || '';
    if (!email) {
        console.warn('[onUserCreated] No email found for uid:', event.params.uid);
        return;
    }
    try {
        await (0, emailService_1.sendWelcomeEmail)(email, firstName);
        console.log('[onUserCreated] Welcome email sent to:', email);
    }
    catch (err) {
        console.error('[onUserCreated] Failed to send welcome email:', err);
    }
});
/**
 * Sends a "plan ready" email when a new training plan is created.
 * Fires on: users/{uid}/training_plans/{planId} creation.
 */
exports.onPlanCreated = (0, firestore_1.onDocumentCreated)({ document: 'users/{uid}/training_plans/{planId}', region: 'europe-west1', secrets: [emailService_1.resendApiKey] }, async (event) => {
    var _a, _b, _c, _d;
    const plan = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!plan)
        return;
    const uid = event.params.uid;
    const db = (0, firestore_2.getFirestore)();
    try {
        // Get user email and name
        const userDoc = await db.collection('users').doc(uid).get();
        const user = userDoc.data();
        if (!(user === null || user === void 0 ? void 0 : user.email))
            return;
        // Get race info if available
        let raceName = '';
        let raceDate = '';
        if (plan.race_id) {
            const raceDoc = await db.collection('users').doc(uid).collection('races').doc(plan.race_id).get();
            if (raceDoc.exists) {
                raceName = ((_b = raceDoc.data()) === null || _b === void 0 ? void 0 : _b.name) || '';
                raceDate = ((_c = raceDoc.data()) === null || _c === void 0 ? void 0 : _c.date) || '';
            }
        }
        await (0, emailService_1.sendPlanReadyEmail)(user.email, user.first_name || '', plan.goal || '', (_d = plan.total_weeks) !== null && _d !== void 0 ? _d : 0, raceName, raceDate);
        console.log('[onPlanCreated] Plan ready email sent to:', user.email);
    }
    catch (err) {
        console.error('[onPlanCreated] Failed to send plan ready email:', err);
    }
});
/**
 * Sends a notification email when an admin replies to an incident
 * or when an incident is marked as resolved.
 */
exports.onIncidentUpdated = (0, firestore_1.onDocumentUpdated)({ document: 'incidents/{incidentId}', region: 'europe-west1', secrets: [emailService_1.resendApiKey] }, async (event) => {
    var _a, _b;
    const before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const after = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    if (!before || !after)
        return;
    const userEmail = after.user_email;
    const subject = after.subject || 'Sin asunto';
    if (!userEmail)
        return;
    const messagesBefore = before.messages || [];
    const messagesAfter = after.messages || [];
    // ── New admin reply ───────────────────────────────────────────────
    if (messagesAfter.length > messagesBefore.length) {
        const lastMsg = messagesAfter[messagesAfter.length - 1];
        if ((lastMsg === null || lastMsg === void 0 ? void 0 : lastMsg.sender) === 'admin' && (lastMsg === null || lastMsg === void 0 ? void 0 : lastMsg.text)) {
            try {
                await (0, emailService_1.sendIncidentReplyEmail)(userEmail, subject, lastMsg.text);
                console.log('[onIncidentUpdated] Reply email sent to:', userEmail);
            }
            catch (err) {
                console.error('[onIncidentUpdated] Failed to send reply email:', err);
            }
            return; // don't also send resolved if both happened at once
        }
    }
    // ── Status changed to resolved ────────────────────────────────────
    if (before.status !== 'resuelta' && after.status === 'resuelta') {
        try {
            await (0, emailService_1.sendIncidentResolvedEmail)(userEmail, subject);
            console.log('[onIncidentUpdated] Resolved email sent to:', userEmail);
        }
        catch (err) {
            console.error('[onIncidentUpdated] Failed to send resolved email:', err);
        }
    }
});
//# sourceMappingURL=triggers.js.map