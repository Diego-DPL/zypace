"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stravaExchangeToken = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const firestore_1 = require("firebase-admin/firestore");
const stravaClientId = (0, params_1.defineSecret)('STRAVA_CLIENT_ID');
const stravaClientSecret = (0, params_1.defineSecret)('STRAVA_CLIENT_SECRET');
/**
 * Exchanges a Strava OAuth code for access/refresh tokens.
 * Called from StravaCallbackPage after the user authorizes.
 * The client_secret never reaches the browser.
 */
exports.stravaExchangeToken = (0, https_1.onCall)({ region: 'europe-west1', cors: true, invoker: 'public', secrets: [stravaClientId, stravaClientSecret] }, async (request) => {
    var _a, _b;
    const uid = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'No autenticado');
    const { code } = request.data;
    if (!code)
        throw new https_1.HttpsError('invalid-argument', 'Falta el código de autorización');
    const resp = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: stravaClientId.value(),
            client_secret: stravaClientSecret.value(),
            code,
            grant_type: 'authorization_code',
        }),
    });
    if (!resp.ok) {
        const txt = await resp.text();
        throw new https_1.HttpsError('failed-precondition', `Strava error: ${txt.slice(0, 300)}`);
    }
    const tokenData = await resp.json();
    const db = (0, firestore_1.getFirestore)();
    // Extract athlete ID from token response
    const athlete = tokenData.athlete;
    const athleteId = athlete === null || athlete === void 0 ? void 0 : athlete.id;
    await db
        .collection('users').doc(uid)
        .collection('strava_tokens').doc('default')
        .set({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: tokenData.expires_at,
        scope: (_b = tokenData.scope) !== null && _b !== void 0 ? _b : '',
        athlete_id: athleteId !== null && athleteId !== void 0 ? athleteId : null,
        updated_at: firestore_1.FieldValue.serverTimestamp(),
    });
    // Create reverse-lookup index so webhooks can find uid from athlete_id
    if (athleteId) {
        await db
            .collection('strava_athlete_index').doc(String(athleteId))
            .set({ uid, updated_at: firestore_1.FieldValue.serverTimestamp() });
    }
    return { success: true };
});
//# sourceMappingURL=stravaOAuth.js.map