import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const stravaClientId     = defineSecret('STRAVA_CLIENT_ID');
const stravaClientSecret = defineSecret('STRAVA_CLIENT_SECRET');

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';

interface StravaActivity {
  id: number;
  name: string;
  distance: number;           // metres
  moving_time: number;
  start_date: string;         // ISO
  sport_type?: string;
  average_heartrate?: number;
  max_heartrate?: number;
  total_elevation_gain?: number;
  suffer_score?: number;
  average_cadence?: number;
  pr_count?: number;
  average_watts?: number;
  perceived_exertion?: number;
}

function extractDistanceKm(description: string | null | undefined): number | undefined {
  if (!description) return undefined;
  const m = description.match(/(\d+(?:[.,]\d+)?)\s?(?:km|k)\b/i);
  if (!m) return undefined;
  const val = parseFloat(m[1].replace(',', '.'));
  return isNaN(val) || val <= 0 ? undefined : val;
}

export const syncStrava = onCall(
  { region: 'europe-west1', cors: true, invoker: 'public', secrets: [stravaClientId, stravaClientSecret], timeoutSeconds: 300 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'No autenticado');

    const { full = false, reset = false } = (request.data ?? {}) as { full?: boolean; reset?: boolean };

    const db = getFirestore();

    // ── 1. Get Strava tokens ──────────────────────────────────
    const tokenDoc = await db
      .collection('users').doc(uid)
      .collection('strava_tokens').doc('default')
      .get();

    if (!tokenDoc.exists) throw new HttpsError('failed-precondition', 'Sin tokens Strava');
    const tokenData = tokenDoc.data()!;
    const savedScope: string = tokenData.scope ?? '';

    // ── 2. Refresh token if expired ──────────────────────────
    let accessToken = tokenData.access_token as string;
    const now = Math.floor(Date.now() / 1000);
    if (tokenData.expires_at && now >= tokenData.expires_at) {
      const refresh = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id:     stravaClientId.value(),
          client_secret: stravaClientSecret.value(),
          grant_type:    'refresh_token',
          refresh_token: tokenData.refresh_token,
        }),
      });
      if (!refresh.ok) throw new HttpsError('failed-precondition', 'No se pudo refrescar token Strava');
      const refreshJson = await refresh.json() as Record<string, unknown>;
      accessToken = refreshJson.access_token as string;
      await tokenDoc.ref.update({
        access_token:  refreshJson.access_token,
        refresh_token: refreshJson.refresh_token ?? tokenData.refresh_token,
        expires_at:    refreshJson.expires_at,
        updated_at:    FieldValue.serverTimestamp(),
      });
    }

    // ── 2b. Backfill athlete_id index for pre-webhook users ──
    if (!tokenData.athlete_id) {
      try {
        const athleteResp = await fetch(`${STRAVA_API_BASE}/athlete`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (athleteResp.ok) {
          const athlete = await athleteResp.json() as Record<string, unknown>;
          const athleteId = athlete.id as number;
          await tokenDoc.ref.update({ athlete_id: athleteId, updated_at: FieldValue.serverTimestamp() });
          await db.collection('strava_athlete_index').doc(String(athleteId)).set({
            uid, updated_at: FieldValue.serverTimestamp(),
          });
        }
      } catch {
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

    let sinceDate: Date;
    if (reset || lastActSnap.empty) {
      sinceDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
    } else {
      const requestedDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
      const lastDate = new Date(lastActSnap.docs[0].data().start_date);
      sinceDate = requestedDate < lastDate ? requestedDate : lastDate;
    }

    const after = Math.floor(sinceDate.getTime() / 1000) - 60;

    // ── 4. Fetch activities from Strava ───────────────────────
    const perPage = 100;
    let page = 1;
    const fetched: StravaActivity[] = [];

    while (true) {
      const url = `${STRAVA_API_BASE}/athlete/activities?after=${after}&page=${page}&per_page=${perPage}`;
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!resp.ok) {
        throw new HttpsError('internal', `Error Strava activities: HTTP ${resp.status}`);
      }
      const batch = await resp.json() as StravaActivity[];
      if (batch.length === 0) break;
      fetched.push(...batch);
      if (batch.length < perPage) break;
      page++;
      if (fetched.length > 1000) break;
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
      const existingIds = new Set<number>(existingSnap.docs.map(d => d.data().activity_id as number));

      const batch = db.batch();
      for (const a of fetched) {
        if (existingIds.has(a.id)) continue;
        const docRef = actsCollection.doc(String(a.id));
        batch.set(docRef, {
          activity_id:           a.id,
          name:                  a.name,
          distance_m:            a.distance,
          moving_time:           a.moving_time,
          start_date:            a.start_date.substring(0, 10),
          sport_type:            a.sport_type ?? null,
          average_heartrate:     a.average_heartrate ?? null,
          max_heartrate:         a.max_heartrate ?? null,
          total_elevation_gain:  a.total_elevation_gain ?? null,
          suffer_score:          a.suffer_score ?? null,
          average_cadence:       a.average_cadence ?? null,
          pr_count:              a.pr_count ?? null,
          average_watts:         a.average_watts ?? null,
          perceived_exertion:    a.perceived_exertion ?? null,
        });
        importedNew++;
      }
      if (importedNew > 0) await batch.commit();
    }

    // ── 6. Match workouts in recent window ───────────────────
    const today = new Date();
    const pastWindow   = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const futureWindow = new Date(today.getTime() +  7 * 24 * 60 * 60 * 1000);
    const pastISO   = pastWindow.toISOString().substring(0, 10);
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
    const actsByDate: Record<string, { distance_m: number }[]> = {};
    for (const d of actsSnap.docs) {
      const a = d.data();
      const date = a.start_date as string;
      (actsByDate[date] ||= []).push({ distance_m: a.distance_m || 0 });
    }

    // Match workouts
    const updateBatch = db.batch();
    let matchedWorkouts = 0;

    for (const wDoc of workoutsSnap.docs) {
      const w = wDoc.data();
      if (w.is_completed) continue;

      const dayActs = actsByDate[w.workout_date as string];
      if (!dayActs?.length) continue;

      const isRest = /\b(rest|descanso)\b/i.test(w.description || '');
      if (isRest) continue;

      const inferredKm = extractDistanceKm(w.description);
      const targetM = inferredKm ? inferredKm * 1000 : undefined;
      const timeMatch = (w.description as string)?.match(/(\d{1,3})\s?(?:min|mins|m)\b/i);
      const targetSecs = timeMatch ? parseInt(timeMatch[1], 10) * 60 : undefined;

      let matched = false;
      for (const act of dayActs) {
        if (targetM) {
          if (Math.abs(act.distance_m - targetM) / targetM <= 0.25) { matched = true; break; }
        }
        if (!matched && targetSecs && act.distance_m > 200) { matched = true; break; }
      }
      if (!matched && !targetM && !targetSecs) {
        if (dayActs.some(a => a.distance_m >= 1000)) matched = true;
      }

      if (matched) {
        updateBatch.update(wDoc.ref, { is_completed: true });
        matchedWorkouts++;
      }
    }

    if (matchedWorkouts > 0) await updateBatch.commit();

    return {
      importedNew,
      fetchedTotal:    fetched.length,
      matchedWorkouts,
      lookbackDays,
      usedFull:        full,
      reset,
      storedScope:     savedScope,
      range: {
        from: sinceDate.toISOString().substring(0, 10),
        to:   today.toISOString().substring(0, 10),
      },
    };
  }
);
