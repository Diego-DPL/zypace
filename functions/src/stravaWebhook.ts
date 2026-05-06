import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const stravaClientId          = defineSecret('STRAVA_CLIENT_ID');
const stravaClientSecret      = defineSecret('STRAVA_CLIENT_SECRET');
const stravaWebhookVerifyToken = defineSecret('STRAVA_WEBHOOK_VERIFY_TOKEN');

interface StravaWebhookEvent {
  object_type:     string;  // 'activity' | 'athlete'
  object_id:       number;  // activity ID
  aspect_type:     string;  // 'create' | 'update' | 'delete'
  owner_id:        number;  // Strava athlete ID
  subscription_id: number;
  event_time:      number;
}

interface StravaActivity {
  id: number;
  name: string;
  distance: number;
  moving_time: number;
  start_date: string;
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

async function matchWorkoutsForDate(
  db: FirebaseFirestore.Firestore,
  uid: string,
  dateISO: string  // 'YYYY-MM-DD'
): Promise<void> {
  const workoutsSnap = await db
    .collection('users').doc(uid)
    .collection('workouts')
    .where('workout_date', '==', dateISO)
    .get();

  if (workoutsSnap.empty) return;

  const actsSnap = await db
    .collection('users').doc(uid)
    .collection('strava_activities')
    .where('start_date', '==', dateISO)
    .get();

  if (actsSnap.empty) return;

  const dayActs = actsSnap.docs.map(d => ({ distance_m: d.data().distance_m || 0 }));

  const batch = db.batch();
  let updated = 0;

  for (const wDoc of workoutsSnap.docs) {
    const w = wDoc.data();
    if (w.is_completed) continue;

    const isRest = /\b(rest|descanso)\b/i.test(w.description || '');
    if (isRest) continue;

    const inferredKm = extractDistanceKm(w.description);
    const targetM    = inferredKm ? inferredKm * 1000 : undefined;
    const timeMatch  = (w.description as string)?.match(/(\d{1,3})\s?(?:min|mins|m)\b/i);
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
      batch.update(wDoc.ref, { is_completed: true });
      updated++;
    }
  }

  if (updated > 0) await batch.commit();
}

/**
 * HTTP endpoint that Strava calls for webhook events.
 * GET  → subscription verification (hub.challenge)
 * POST → activity create / update / delete events
 */
export const stravaWebhookHandler = onRequest(
  {
    region:   'europe-west1',
    invoker:  'public',
    secrets:  [stravaClientId, stravaClientSecret, stravaWebhookVerifyToken],
  },
  async (req, res) => {
    // ── Subscription verification ──────────────────────────────
    if (req.method === 'GET') {
      const mode      = req.query['hub.mode']         as string;
      const token     = req.query['hub.verify_token'] as string;
      const challenge = req.query['hub.challenge']    as string;

      if (mode === 'subscribe' && token === stravaWebhookVerifyToken.value()) {
        res.status(200).json({ 'hub.challenge': challenge });
      } else {
        res.status(403).send('Forbidden');
      }
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    // ── Activity event ─────────────────────────────────────────
    const event = req.body as StravaWebhookEvent;

    // Acknowledge quickly — Strava expects 200 within 2 s
    res.status(200).send('EVENT_RECEIVED');

    if (event.object_type !== 'activity') return;

    try {
      const db = getFirestore();

      // Reverse-lookup: Strava athlete_id → Firebase uid
      const indexDoc = await db
        .collection('strava_athlete_index').doc(String(event.owner_id))
        .get();
      if (!indexDoc.exists) return;

      const uid     = indexDoc.data()!.uid as string;
      const actRef  = db.collection('users').doc(uid).collection('strava_activities').doc(String(event.object_id));
      const tokenRef = db.collection('users').doc(uid).collection('strava_tokens').doc('default');

      // ── Delete ─────────────────────────────────────────────
      if (event.aspect_type === 'delete') {
        await actRef.delete();
        return;
      }

      // ── Create / Update: fetch activity from Strava ────────
      const tokenDoc = await tokenRef.get();
      if (!tokenDoc.exists) return;

      const tokenData  = tokenDoc.data()!;
      let accessToken  = tokenData.access_token as string;
      const now        = Math.floor(Date.now() / 1000);

      if (tokenData.expires_at && now >= tokenData.expires_at) {
        const refreshResp = await fetch('https://www.strava.com/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id:     stravaClientId.value(),
            client_secret: stravaClientSecret.value(),
            grant_type:    'refresh_token',
            refresh_token: tokenData.refresh_token,
          }),
        });
        if (!refreshResp.ok) return;
        const refreshJson = await refreshResp.json() as Record<string, unknown>;
        accessToken = refreshJson.access_token as string;
        await tokenRef.update({
          access_token:  refreshJson.access_token,
          refresh_token: refreshJson.refresh_token ?? tokenData.refresh_token,
          expires_at:    refreshJson.expires_at,
          updated_at:    FieldValue.serverTimestamp(),
        });
      }

      const actResp = await fetch(
        `https://www.strava.com/api/v3/activities/${event.object_id}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!actResp.ok) return;

      const a = await actResp.json() as StravaActivity;

      await actRef.set({
        activity_id:          a.id,
        name:                 a.name,
        distance_m:           a.distance,
        moving_time:          a.moving_time,
        start_date:           a.start_date.substring(0, 10),
        sport_type:           a.sport_type            ?? null,
        average_heartrate:    a.average_heartrate     ?? null,
        max_heartrate:        a.max_heartrate         ?? null,
        total_elevation_gain: a.total_elevation_gain  ?? null,
        suffer_score:         a.suffer_score          ?? null,
        average_cadence:      a.average_cadence       ?? null,
        pr_count:             a.pr_count              ?? null,
        average_watts:        a.average_watts         ?? null,
        perceived_exertion:   a.perceived_exertion    ?? null,
      });

      await matchWorkoutsForDate(db, uid, a.start_date.substring(0, 10));

    } catch (err) {
      console.error('[stravaWebhookHandler] Processing error:', err);
    }
  }
);
