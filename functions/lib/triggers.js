"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onIncidentUpdated = exports.onUserCreated = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
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