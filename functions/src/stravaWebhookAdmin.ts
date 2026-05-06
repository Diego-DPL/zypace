import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';

const stravaClientId          = defineSecret('STRAVA_CLIENT_ID');
const stravaClientSecret      = defineSecret('STRAVA_CLIENT_SECRET');
const stravaWebhookVerifyToken = defineSecret('STRAVA_WEBHOOK_VERIFY_TOKEN');

const PROJECT_ID = 'zypace-9d314';
const REGION     = 'europe-west1';
const WEBHOOK_URL = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/stravaWebhookHandler`;

async function assertAdmin(uid: string | undefined): Promise<void> {
  if (!uid) throw new HttpsError('unauthenticated', 'No autenticado');
  const doc = await getFirestore().collection('users').doc(uid).get();
  if (doc.data()?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Solo administradores');
  }
}

/**
 * Returns current Strava webhook subscription (if any).
 */
export const getStravaWebhookStatus = onCall(
  { region: REGION, cors: true, invoker: 'public', secrets: [stravaClientId, stravaClientSecret] },
  async (request) => {
    await assertAdmin(request.auth?.uid);

    const resp = await fetch(
      `https://www.strava.com/api/v3/push_subscriptions?client_id=${stravaClientId.value()}&client_secret=${stravaClientSecret.value()}`
    );

    if (!resp.ok) {
      const txt = await resp.text();
      throw new HttpsError('internal', `Strava error: ${txt.slice(0, 200)}`);
    }

    const subscriptions = await resp.json() as unknown[];
    return { subscriptions, webhookUrl: WEBHOOK_URL };
  }
);

/**
 * Registers a new Strava webhook subscription.
 * Strava will call the webhook URL with hub.challenge to verify.
 */
export const registerStravaWebhook = onCall(
  { region: REGION, cors: true, invoker: 'public', secrets: [stravaClientId, stravaClientSecret, stravaWebhookVerifyToken] },
  async (request) => {
    await assertAdmin(request.auth?.uid);

    const body = new URLSearchParams({
      client_id:     stravaClientId.value(),
      client_secret: stravaClientSecret.value(),
      callback_url:  WEBHOOK_URL,
      verify_token:  stravaWebhookVerifyToken.value(),
    });

    const resp = await fetch('https://www.strava.com/api/v3/push_subscriptions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    });

    const json = await resp.json() as Record<string, unknown>;

    if (!resp.ok) {
      throw new HttpsError('failed-precondition', `Strava error: ${JSON.stringify(json).slice(0, 300)}`);
    }

    return { success: true, subscription: json };
  }
);

/**
 * Deletes a Strava webhook subscription by its ID.
 */
export const deleteStravaWebhook = onCall(
  { region: REGION, cors: true, invoker: 'public', secrets: [stravaClientId, stravaClientSecret] },
  async (request) => {
    await assertAdmin(request.auth?.uid);

    const { subscriptionId } = request.data as { subscriptionId: number };
    if (!subscriptionId) throw new HttpsError('invalid-argument', 'Falta subscriptionId');

    const resp = await fetch(
      `https://www.strava.com/api/v3/push_subscriptions/${subscriptionId}?client_id=${stravaClientId.value()}&client_secret=${stravaClientSecret.value()}`,
      { method: 'DELETE' }
    );

    if (resp.status !== 204 && !resp.ok) {
      const txt = await resp.text();
      throw new HttpsError('internal', `Strava error: ${txt.slice(0, 200)}`);
    }

    return { success: true };
  }
);
