"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteStravaWebhook = exports.registerStravaWebhook = exports.getStravaWebhookStatus = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const firestore_1 = require("firebase-admin/firestore");
const stravaClientId = (0, params_1.defineSecret)('STRAVA_CLIENT_ID');
const stravaClientSecret = (0, params_1.defineSecret)('STRAVA_CLIENT_SECRET');
const stravaWebhookVerifyToken = (0, params_1.defineSecret)('STRAVA_WEBHOOK_VERIFY_TOKEN');
const PROJECT_ID = 'zypace-9d314';
const REGION = 'europe-west1';
const WEBHOOK_URL = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/stravaWebhookHandler`;
async function assertAdmin(uid) {
    var _a;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'No autenticado');
    const doc = await (0, firestore_1.getFirestore)().collection('users').doc(uid).get();
    if (((_a = doc.data()) === null || _a === void 0 ? void 0 : _a.role) !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Solo administradores');
    }
}
/**
 * Returns current Strava webhook subscription (if any).
 */
exports.getStravaWebhookStatus = (0, https_1.onCall)({ region: REGION, cors: true, invoker: 'public', secrets: [stravaClientId, stravaClientSecret] }, async (request) => {
    var _a;
    await assertAdmin((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid);
    const resp = await fetch(`https://www.strava.com/api/v3/push_subscriptions?client_id=${stravaClientId.value()}&client_secret=${stravaClientSecret.value()}`);
    if (!resp.ok) {
        const txt = await resp.text();
        throw new https_1.HttpsError('internal', `Strava error: ${txt.slice(0, 200)}`);
    }
    const subscriptions = await resp.json();
    return { subscriptions, webhookUrl: WEBHOOK_URL };
});
/**
 * Registers a new Strava webhook subscription.
 * Strava will call the webhook URL with hub.challenge to verify.
 */
exports.registerStravaWebhook = (0, https_1.onCall)({ region: REGION, cors: true, invoker: 'public', secrets: [stravaClientId, stravaClientSecret, stravaWebhookVerifyToken] }, async (request) => {
    var _a;
    await assertAdmin((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid);
    const body = new URLSearchParams({
        client_id: stravaClientId.value(),
        client_secret: stravaClientSecret.value(),
        callback_url: WEBHOOK_URL,
        verify_token: stravaWebhookVerifyToken.value(),
    });
    const resp = await fetch('https://www.strava.com/api/v3/push_subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });
    const json = await resp.json();
    if (!resp.ok) {
        throw new https_1.HttpsError('failed-precondition', `Strava error: ${JSON.stringify(json).slice(0, 300)}`);
    }
    return { success: true, subscription: json };
});
/**
 * Deletes a Strava webhook subscription by its ID.
 */
exports.deleteStravaWebhook = (0, https_1.onCall)({ region: REGION, cors: true, invoker: 'public', secrets: [stravaClientId, stravaClientSecret] }, async (request) => {
    var _a;
    await assertAdmin((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid);
    const { subscriptionId } = request.data;
    if (!subscriptionId)
        throw new https_1.HttpsError('invalid-argument', 'Falta subscriptionId');
    const resp = await fetch(`https://www.strava.com/api/v3/push_subscriptions/${subscriptionId}?client_id=${stravaClientId.value()}&client_secret=${stravaClientSecret.value()}`, { method: 'DELETE' });
    if (resp.status !== 204 && !resp.ok) {
        const txt = await resp.text();
        throw new https_1.HttpsError('internal', `Strava error: ${txt.slice(0, 200)}`);
    }
    return { success: true };
});
//# sourceMappingURL=stravaWebhookAdmin.js.map