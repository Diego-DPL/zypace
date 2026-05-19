"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncStrava = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const firestore_1 = require("firebase-admin/firestore");
const stravaClientId = (0, params_1.defineSecret)('STRAVA_CLIENT_ID');
const stravaClientSecret = (0, params_1.defineSecret)('STRAVA_CLIENT_SECRET');
const STRAVA_API_BASE = 'https://www.strava.com/api/v3';
function extractDistanceKm(description) {
    if (!description)
        return undefined;
    const m = description.match(/(\d+(?:[.,]\d+)?)\s?(?:km|k)\b/i);
    if (!m)
        return undefined;
    const val = parseFloat(m[1].replace(',', '.'));
    return isNaN(val) || val <= 0 ? undefined : val;
}
exports.syncStrava = (0, https_1.onCall)({ region: 'europe-west1', cors: true, invoker: 'public', secrets: [stravaClientId, stravaClientSecret], timeoutSeconds: 300 }, async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v;
    const uid = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'No autenticado');
    const { full = false, reset = false } = ((_b = request.data) !== null && _b !== void 0 ? _b : {});
    const db = (0, firestore_1.getFirestore)();
    // ── Rate limiting: max 10 syncs per user per hour ─────────
    const syncCounterRef = db.collection('users').doc(uid).collection('strava_tokens').doc('sync_counter');
    const counterDoc = await syncCounterRef.get();
    const counterData = (_c = counterDoc.data()) !== null && _c !== void 0 ? _c : {};
    const windowStart = (_f = (_e = (_d = counterData.window_start) === null || _d === void 0 ? void 0 : _d.toDate) === null || _e === void 0 ? void 0 : _e.call(_d)) !== null && _f !== void 0 ? _f : new Date(0);
    const syncCount = (_g = counterData.count) !== null && _g !== void 0 ? _g : 0;
    const windowExpired = Date.now() - windowStart.getTime() > 60 * 60 * 1000;
    if (!windowExpired && syncCount >= 10) {
        throw new https_1.HttpsError('resource-exhausted', 'Demasiadas sincronizaciones. Espera unos minutos.');
    }
    // Update counter
    await syncCounterRef.set(windowExpired
        ? { count: 1, window_start: new Date() }
        : { count: syncCount + 1, window_start: windowStart });
    // ── 1. Get Strava tokens ──────────────────────────────────
    const tokenDoc = await db
        .collection('users').doc(uid)
        .collection('strava_tokens').doc('default')
        .get();
    if (!tokenDoc.exists)
        throw new https_1.HttpsError('failed-precondition', 'Sin tokens Strava');
    const tokenData = tokenDoc.data();
    const savedScope = (_h = tokenData.scope) !== null && _h !== void 0 ? _h : '';
    // ── 2. Refresh token if expired ──────────────────────────
    let accessToken = tokenData.access_token;
    const now = Math.floor(Date.now() / 1000);
    if (tokenData.expires_at && now >= tokenData.expires_at) {
        const refresh = await fetch('https://www.strava.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: stravaClientId.value(),
                client_secret: stravaClientSecret.value(),
                grant_type: 'refresh_token',
                refresh_token: tokenData.refresh_token,
            }),
        });
        if (!refresh.ok)
            throw new https_1.HttpsError('failed-precondition', 'No se pudo refrescar token Strava');
        const refreshJson = await refresh.json();
        accessToken = refreshJson.access_token;
        await tokenDoc.ref.update({
            access_token: refreshJson.access_token,
            refresh_token: (_j = refreshJson.refresh_token) !== null && _j !== void 0 ? _j : tokenData.refresh_token,
            expires_at: refreshJson.expires_at,
            updated_at: firestore_1.FieldValue.serverTimestamp(),
        });
    }
    // ── 2b. Backfill athlete_id index for pre-webhook users ──
    if (!tokenData.athlete_id) {
        try {
            const athleteResp = await fetch(`${STRAVA_API_BASE}/athlete`, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (athleteResp.ok) {
                const athlete = await athleteResp.json();
                const athleteId = athlete.id;
                await tokenDoc.ref.update({ athlete_id: athleteId, updated_at: firestore_1.FieldValue.serverTimestamp() });
                await db.collection('strava_athlete_index').doc(String(athleteId)).set({
                    uid, updated_at: firestore_1.FieldValue.serverTimestamp(),
                });
            }
        }
        catch (_w) {
            // Non-critical — webhook will just miss this user until reconnect
        }
    }
    // ── 3. Determine lookback window ─────────────────────────
    const lookbackDays = full ? 180 : 30;
    // Find last activity date for incremental sync
    const lastActSnap = await db
        .collection('users').doc(uid)
        .collection('strava_activities')
        .orderBy('start_date', 'desc')
        .limit(1)
        .get();
    let sinceDate;
    if (reset || lastActSnap.empty) {
        sinceDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
    }
    else {
        const requestedDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
        const lastDate = new Date(lastActSnap.docs[0].data().start_date);
        sinceDate = requestedDate < lastDate ? requestedDate : lastDate;
    }
    const after = Math.floor(sinceDate.getTime() / 1000) - 60;
    // ── 4. Fetch activities from Strava ───────────────────────
    const perPage = 100;
    let page = 1;
    const fetched = [];
    while (true) {
        const url = `${STRAVA_API_BASE}/athlete/activities?after=${after}&page=${page}&per_page=${perPage}`;
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!resp.ok) {
            throw new https_1.HttpsError('internal', `Error Strava activities: HTTP ${resp.status}`);
        }
        const batch = await resp.json();
        if (batch.length === 0)
            break;
        fetched.push(...batch);
        if (batch.length < perPage)
            break;
        page++;
        if (fetched.length > 1000)
            break;
    }
    // ── 5. Insert new activities (using Strava ID as doc ID) ──
    let importedNew = 0;
    const actsCollection = db.collection('users').doc(uid).collection('strava_activities');
    if (fetched.length > 0) {
        // Check which IDs already exist by querying stored activities
        const sinceISO = sinceDate.toISOString().substring(0, 10);
        const existingSnap = await actsCollection
            .where('start_date', '>=', sinceISO)
            .get();
        const existingIds = new Set(existingSnap.docs.map(d => d.data().activity_id));
        const batch = db.batch();
        for (const a of fetched) {
            if (existingIds.has(a.id))
                continue;
            const docRef = actsCollection.doc(String(a.id));
            batch.set(docRef, {
                activity_id: a.id,
                name: a.name,
                distance_m: a.distance,
                moving_time: a.moving_time,
                start_date: a.start_date.substring(0, 10),
                sport_type: (_k = a.sport_type) !== null && _k !== void 0 ? _k : null,
                average_heartrate: (_l = a.average_heartrate) !== null && _l !== void 0 ? _l : null,
                max_heartrate: (_m = a.max_heartrate) !== null && _m !== void 0 ? _m : null,
                total_elevation_gain: (_o = a.total_elevation_gain) !== null && _o !== void 0 ? _o : null,
                suffer_score: (_p = a.suffer_score) !== null && _p !== void 0 ? _p : null,
                average_cadence: (_q = a.average_cadence) !== null && _q !== void 0 ? _q : null,
                pr_count: (_r = a.pr_count) !== null && _r !== void 0 ? _r : null,
                average_watts: (_s = a.average_watts) !== null && _s !== void 0 ? _s : null,
                perceived_exertion: (_t = a.perceived_exertion) !== null && _t !== void 0 ? _t : null,
            });
            importedNew++;
        }
        if (importedNew > 0)
            await batch.commit();
    }
    // ── 6. Match workouts in recent window ───────────────────
    const today = new Date();
    const pastWindow = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const futureWindow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const pastISO = pastWindow.toISOString().substring(0, 10);
    const futureISO = futureWindow.toISOString().substring(0, 10);
    const workoutsSnap = await db
        .collection('users').doc(uid)
        .collection('workouts')
        .where('workout_date', '>=', pastISO)
        .where('workout_date', '<=', futureISO)
        .get();
    const actsSnap = await actsCollection
        .where('start_date', '>=', pastISO)
        .get();
    // Group activities by date
    const actsByDate = {};
    for (const d of actsSnap.docs) {
        const a = d.data();
        const date = a.start_date;
        (actsByDate[date] || (actsByDate[date] = [])).push({
            distance_m: a.distance_m || 0,
            elevation_gain_m: (_u = a.total_elevation_gain) !== null && _u !== void 0 ? _u : null,
        });
    }
    // Match workouts
    const updateBatch = db.batch();
    let matchedWorkouts = 0;
    for (const wDoc of workoutsSnap.docs) {
        const w = wDoc.data();
        if (w.is_completed)
            continue;
        const dayActs = actsByDate[w.workout_date];
        if (!(dayActs === null || dayActs === void 0 ? void 0 : dayActs.length))
            continue;
        const isRest = /\b(rest|descanso)\b/i.test(w.description || '');
        if (isRest)
            continue;
        const inferredKm = extractDistanceKm(w.description);
        const targetM = inferredKm ? inferredKm * 1000 : undefined;
        const timeMatch = (_v = w.description) === null || _v === void 0 ? void 0 : _v.match(/(\d{1,3})\s?(?:min|mins|m)\b/i);
        const targetSecs = timeMatch ? parseInt(timeMatch[1], 10) * 60 : undefined;
        let matched = false;
        let matchedAct = null;
        for (const act of dayActs) {
            if (targetM) {
                if (Math.abs(act.distance_m - targetM) / targetM <= 0.25) {
                    matched = true;
                    matchedAct = act;
                    break;
                }
            }
            if (!matched && targetSecs && act.distance_m > 200) {
                matched = true;
                matchedAct = act;
                break;
            }
        }
        if (!matched && !targetM && !targetSecs) {
            const found = dayActs.find(a => a.distance_m >= 1000);
            if (found) {
                matched = true;
                matchedAct = found;
            }
        }
        if (matched) {
            const update = { is_completed: true };
            if ((matchedAct === null || matchedAct === void 0 ? void 0 : matchedAct.elevation_gain_m) != null && matchedAct.elevation_gain_m > 0) {
                update.strava_elevation_gain_m = Math.round(matchedAct.elevation_gain_m);
            }
            updateBatch.update(wDoc.ref, update);
            matchedWorkouts++;
        }
    }
    if (matchedWorkouts > 0)
        await updateBatch.commit();
    return {
        importedNew,
        fetchedTotal: fetched.length,
        matchedWorkouts,
        lookbackDays,
        usedFull: full,
        reset,
        storedScope: savedScope,
        range: {
            from: sinceDate.toISOString().substring(0, 10),
            to: today.toISOString().substring(0, 10),
        },
    };
});
//# sourceMappingURL=syncStrava.js.map