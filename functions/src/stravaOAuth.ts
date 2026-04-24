import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const stravaClientId     = defineSecret('STRAVA_CLIENT_ID');
const stravaClientSecret = defineSecret('STRAVA_CLIENT_SECRET');

/**
 * Exchanges a Strava OAuth code for access/refresh tokens.
 * Called from StravaCallbackPage after the user authorizes.
 * The client_secret never reaches the browser.
 */
export const stravaExchangeToken = onCall(
  { region: 'europe-west1', cors: true, secrets: [stravaClientId, stravaClientSecret] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'No autenticado');

    const { code } = request.data as { code?: string };
    if (!code) throw new HttpsError('invalid-argument', 'Falta el código de autorización');

    const resp = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id:     stravaClientId.value(),
        client_secret: stravaClientSecret.value(),
        code,
        grant_type: 'authorization_code',
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      throw new HttpsError('failed-precondition', `Strava error: ${txt.slice(0, 300)}`);
    }

    const tokenData = await resp.json() as Record<string, unknown>;
    const db = getFirestore();

    await db
      .collection('users').doc(uid)
      .collection('strava_tokens').doc('default')
      .set({
        access_token:  tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at:    tokenData.expires_at,
        scope:         tokenData.scope ?? '',
        updated_at:    FieldValue.serverTimestamp(),
      });

    return { success: true };
  }
);
