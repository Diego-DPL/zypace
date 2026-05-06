"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stravaWebhookHandler = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const firestore_1 = require("firebase-admin/firestore");
const stravaClientId = (0, params_1.defineSecret)('STRAVA_CLIENT_ID');
const stravaClientSecret = (0, params_1.defineSecret)('STRAVA_CLIENT_SECRET');
const stravaWebhookVerifyToken = (0, params_1.defineSecret)('STRAVA_WEBHOOK_VERIFY_TOKEN');
function extractDistanceKm(description) {
    if (!description)
        return undefined;
    const m = description.match(/(\d+(?:[.,]\d+)?)\s?(?:km|k)\b/i);
    if (!m)
        return undefined;
    const val = parseFloat(m[1].replace(',', '.'));
    return isNaN(val) || val <= 0 ? undefined : val;
}
async function matchWorkoutsForDate(db, uid, dateISO // 'YYYY-MM-DD'
) {
    var _a;
    const workoutsSnap = await db
        .collection('users').doc(uid)
        .collection('workouts')
        .where('workout_date', '==', dateISO)
        .get();
    if (workoutsSnap.empty)
        return;
    const actsSnap = await db
        .collection('users').doc(uid)
        .collection('strava_activities')
        .where('start_date', '==', dateISO)
        .get();
    if (actsSnap.empty)
        return;
    const dayActs = actsSnap.docs.map(d => ({ distance_m: d.data().distance_m || 0 }));
    const batch = db.batch();
    let updated = 0;
    for (const wDoc of workoutsSnap.docs) {
        const w = wDoc.data();
        if (w.is_completed)
            continue;
        const isRest = /\b(rest|descanso)\b/i.test(w.description || '');
        if (isRest)
            continue;
        const inferredKm = extractDistanceKm(w.description);
        const targetM = inferredKm ? inferredKm * 1000 : undefined;
        const timeMatch = (_a = w.description) === null || _a === void 0 ? void 0 : _a.match(/(\d{1,3})\s?(?:min|mins|m)\b/i);
        const targetSecs = timeMatch ? parseInt(timeMatch[1], 10) * 60 : undefined;
        let matched = false;
        for (const act of dayActs) {
            if (targetM) {
                if (Math.abs(act.distance_m - targetM) / targetM <= 0.25) {
                    matched = true;
                    break;
                }
            }
            if (!matched && targetSecs && act.distance_m > 200) {
                matched = true;
                break;
            }
        }
        if (!matched && !targetM && !targetSecs) {
            if (dayActs.some(a => a.distance_m >= 1000))
                matched = true;
        }
        if (matched) {
            batch.update(wDoc.ref, { is_completed: true });
            updated++;
        }
    }
    if (updated > 0)
        await batch.commit();
}
/**
 * HTTP endpoint that Strava calls for webhook events.
 * GET  → subscription verification (hub.challenge)
 * POST → activity create / update / delete events
 */
exports.stravaWebhookHandler = (0, https_1.onRequest)({
    region: 'europe-west1',
    invoker: 'public',
    secrets: [stravaClientId, stravaClientSecret, stravaWebhookVerifyToken],
}, async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    // ── Subscription verification ──────────────────────────────
    if (req.method === 'GET') {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];
        if (mode === 'subscribe' && token === stravaWebhookVerifyToken.value()) {
            res.status(200).json({ 'hub.challenge': challenge });
        }
        else {
            res.status(403).send('Forbidden');
        }
        return;
    }
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }
    // ── Activity event ─────────────────────────────────────────
    const event = req.body;
    // Acknowledge quickly — Strava expects 200 within 2 s
    res.status(200).send('EVENT_RECEIVED');
    if (event.object_type !== 'activity')
        return;
    try {
        const db = (0, firestore_1.getFirestore)();
        // Reverse-lookup: Strava athlete_id → Firebase uid
        const indexDoc = await db
            .collection('strava_athlete_index').doc(String(event.owner_id))
            .get();
        if (!indexDoc.exists)
            return;
        const uid = indexDoc.data().uid;
        const actRef = db.collection('users').doc(uid).collection('strava_activities').doc(String(event.object_id));
        const tokenRef = db.collection('users').doc(uid).collection('strava_tokens').doc('default');
        // ── Delete ─────────────────────────────────────────────
        if (event.aspect_type === 'delete') {
            await actRef.delete();
            return;
        }
        // ── Create / Update: fetch activity from Strava ────────
        const tokenDoc = await tokenRef.get();
        if (!tokenDoc.exists)
            return;
        const tokenData = tokenDoc.data();
        let accessToken = tokenData.access_token;
        const now = Math.floor(Date.now() / 1000);
        if (tokenData.expires_at && now >= tokenData.expires_at) {
            const refreshResp = await fetch('https://www.strava.com/oauth/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_id: stravaClientId.value(),
                    client_secret: stravaClientSecret.value(),
                    grant_type: 'refresh_token',
                    refresh_token: tokenData.refresh_token,
                }),
            });
            if (!refreshResp.ok)
                return;
            const refreshJson = await refreshResp.json();
            accessToken = refreshJson.access_token;
            await tokenRef.update({
                access_token: refreshJson.access_token,
                refresh_token: (_a = refreshJson.refresh_token) !== null && _a !== void 0 ? _a : tokenData.refresh_token,
                expires_at: refreshJson.expires_at,
                updated_at: firestore_1.FieldValue.serverTimestamp(),
            });
        }
        const actResp = await fetch(`https://www.strava.com/api/v3/activities/${event.object_id}`, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!actResp.ok)
            return;
        const a = await actResp.json();
        await actRef.set({
            activity_id: a.id,
            name: a.name,
            distance_m: a.distance,
            moving_time: a.moving_time,
            start_date: a.start_date.substring(0, 10),
            sport_type: (_b = a.sport_type) !== null && _b !== void 0 ? _b : null,
            average_heartrate: (_c = a.average_heartrate) !== null && _c !== void 0 ? _c : null,
            max_heartrate: (_d = a.max_heartrate) !== null && _d !== void 0 ? _d : null,
            total_elevation_gain: (_e = a.total_elevation_gain) !== null && _e !== void 0 ? _e : null,
            suffer_score: (_f = a.suffer_score) !== null && _f !== void 0 ? _f : null,
            average_cadence: (_g = a.average_cadence) !== null && _g !== void 0 ? _g : null,
            pr_count: (_h = a.pr_count) !== null && _h !== void 0 ? _h : null,
            average_watts: (_j = a.average_watts) !== null && _j !== void 0 ? _j : null,
            perceived_exertion: (_k = a.perceived_exertion) !== null && _k !== void 0 ? _k : null,
        });
        await matchWorkoutsForDate(db, uid, a.start_date.substring(0, 10));
    }
    catch (err) {
        console.error('[stravaWebhookHandler] Processing error:', err);
    }
});
//# sourceMappingURL=stravaWebhook.js.map